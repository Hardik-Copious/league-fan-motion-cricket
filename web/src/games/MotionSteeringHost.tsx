import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { requestBrioOrUserFacingWebcam } from "../lib/cameraStream";
import { drawBookSteeringInVideoRect } from "../lib/steeringBookPipOverlay";

/** MoveNet keypoint indices */
const LS = 5;
const RS = 6;
const LW = 9;
const RW = 10;

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/** Lane offset −1…1, scroll phase offset px */
const ROAD_OBSTACLES: { lane: number; off: number }[] = [
  { lane: -0.55, off: 0 },
  { lane: 0.52, off: 95 },
  { lane: 0, off: 180 },
  { lane: -0.48, off: 260 },
  { lane: 0.58, off: 340 },
  { lane: -0.35, off: 420 },
  { lane: 0.4, off: 500 },
];

/** Lane gems: same scroll as cones; +score when car passes through at depth */
const ROAD_COINS: { lane: number; off: number }[] = [
  { lane: -0.72, off: 55 },
  { lane: 0.7, off: 210 },
  { lane: -0.62, off: 380 },
  { lane: 0.55, off: 470 },
];

const STEER_BEST_KEY = "motion-steering-best-score";

export default function MotionSteeringHost() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof poseDetection.createDetector>> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const roadPhaseRef = useRef(0);
  const steerSmoothedRef = useRef(0);
  const carLaneRef = useRef(0);
  const scoreRef = useRef(0);
  const bestRef = useRef(0);
  const safeStreakRef = useRef(0);
  const coinArmedRef = useRef(ROAD_COINS.map(() => true));
  const coinLapRef = useRef(-1);
  const coinTotalRef = useRef(0);

  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [poseError, setPoseError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);

  const drawFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      steer: number,
      roadPhase: number,
      carX: number,
      video: HTMLVideoElement | null,
      pLw: { x: number; y: number; score?: number } | undefined,
      pRw: { x: number; y: number; score?: number } | undefined,
      hud: { score: number; best: number; safe: number; coins: number; speedPct: number },
      coinsArmed: readonly boolean[]
    ) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1a2840");
      g.addColorStop(0.45, "#243552");
      g.addColorStop(1, "#0d1218");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const twinkle = 0.35 + Math.sin(roadPhase * 0.04) * 0.12;
      for (let s = 0; s < 48; s++) {
        const sx = ((s * 7919) % 997) / 997;
        const sy = ((s * 4999) % 1000) / 1000;
        const px = sx * w;
        const py = sy * h * 0.32;
        const a = twinkle * (0.25 + (s % 5) * 0.12);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(px, py, 1.5, 1.5);
      }

      const vanY = h * 0.22;
      const roadTop = h * 0.38;
      const roadBot = h * 0.92;
      const cx = w * 0.5;

      ctx.fillStyle = "#2a2a32";
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.08, vanY);
      ctx.lineTo(cx - w * 0.42, roadBot);
      ctx.lineTo(cx + w * 0.42, roadBot);
      ctx.lineTo(cx + w * 0.08, vanY);
      ctx.closePath();
      ctx.fill();

      const stripeH = h * 0.045;
      const scroll = roadPhase % (stripeH * 2);
      ctx.strokeStyle = "rgba(255,220,120,0.55)";
      ctx.lineWidth = Math.max(2, w * 0.004);
      for (let y = roadTop + scroll; y < roadBot; y += stripeH * 2) {
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, Math.min(y + stripeH, roadBot));
        ctx.stroke();
      }

      const laneMax = w * 0.14;
      const cycle = 400;
      for (const ob of ROAD_OBSTACLES) {
        const z = (roadPhase + ob.off) % cycle;
        const prog = z / cycle;
        if (prog < 0.04 || prog > 0.97) continue;
        const oy = roadTop + (roadBot - roadTop) * (0.1 + prog * 0.82);
        const pxScale = 0.32 + prog * 0.68;
        const ox = cx + ob.lane * w * 0.11 * pxScale;
        const coneH = h * 0.055 * (0.45 + prog * 0.55);
        const coneW = coneH * 0.55;
        ctx.fillStyle = prog > 0.75 ? "rgba(220, 60, 40, 0.92)" : "rgba(251, 146, 60, 0.9)";
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox - coneW, oy + coneH);
        ctx.lineTo(ox + coneW, oy + coneH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(40,20,0,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      const cycleCoins = 400;
      for (let ci = 0; ci < ROAD_COINS.length; ci++) {
        const c = ROAD_COINS[ci];
        const z = (roadPhase + c.off) % cycleCoins;
        const prog = z / cycleCoins;
        if (prog < 0.05 || prog > 0.96) continue;
        const oy = roadTop + (roadBot - roadTop) * (0.1 + prog * 0.82);
        const pxScale = 0.32 + prog * 0.68;
        const ox = cx + c.lane * w * 0.11 * pxScale;
        const armed = coinsArmed[ci] ?? true;
        const r = h * 0.022 * (0.5 + prog * 0.5);
        ctx.fillStyle = armed ? "rgba(250, 204, 21, 0.95)" : "rgba(80, 70, 40, 0.45)";
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
        if (armed) {
          ctx.strokeStyle = "rgba(255, 250, 220, 0.7)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      const carW = w * 0.12;
      const carH = h * 0.08;
      const carY = roadBot - carH * 1.35;
      const cxCar = cx + carX * laneMax;

      ctx.fillStyle = "#c62828";
      ctx.fillRect(cxCar - carW / 2, carY, carW, carH * 0.55);
      ctx.fillStyle = "#1565c0";
      ctx.fillRect(cxCar - carW * 0.35, carY + carH * 0.38, carW * 0.7, carH * 0.45);
      ctx.fillStyle = "#111";
      ctx.fillRect(cxCar - carW * 0.42, carY + carH * 0.78, carW * 0.22, carH * 0.22);
      ctx.fillRect(cxCar + carW * 0.2, carY + carH * 0.78, carW * 0.22, carH * 0.22);

      const beam = ctx.createRadialGradient(cxCar, carY, 0, cxCar, carY - h * 0.22, h * 0.35);
      beam.addColorStop(0, "rgba(255, 248, 200, 0.14)");
      beam.addColorStop(1, "rgba(255, 248, 200, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(cxCar - carW * 0.9, carY + carH);
      ctx.lineTo(cxCar + carW * 0.9, carY + carH);
      ctx.lineTo(cxCar, carY - h * 0.28);
      ctx.closePath();
      ctx.fill();

      const wheelR = Math.min(w, h) * 0.11;
      const wx = w * 0.82;
      const wy = h * 0.72;
      ctx.strokeStyle = "rgba(40,40,48,0.95)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(wx, wy, wheelR + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#3d3d48";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(wx, wy, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      const ang = steer * 0.95;
      ctx.strokeStyle = "rgba(255,200,120,0.9)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.sin(ang) * wheelR * 0.92, wy - Math.cos(ang) * wheelR * 0.92);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.arc(wx, wy, wheelR * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(8,10,14,0.78)";
      ctx.fillRect(10, 10, w * 0.58, h * 0.14);
      ctx.fillStyle = "rgba(255,248,240,0.95)";
      ctx.font = `${Math.max(12, Math.floor(w * 0.022))}px sans-serif`;
      ctx.fillText("Steer: book edge (wrist line) · PiP = mirror selfie", 18, 32);
      ctx.font = `${Math.max(11, Math.floor(w * 0.016))}px sans-serif`;
      ctx.fillStyle = "rgba(200,210,230,0.9)";
      ctx.fillText(`Wheel ${(steer * 57.3).toFixed(0)}° · Pace +${hud.speedPct.toFixed(0)}%`, 18, 52);
      ctx.fillStyle = "rgba(250, 204, 21, 0.92)";
      ctx.fillText(`Score ${Math.floor(hud.score)} · Best ${Math.floor(hud.best)} · Coins ${hud.coins}`, 18, 70);
      ctx.fillStyle = "rgba(180, 255, 200, 0.88)";
      ctx.fillText(`Clean streak ${hud.safe} · Gold orbs = bonus`, 18, 88);

      if (video && video.readyState >= 2) {
        const tw = w * 0.26;
        const th = (video.videoHeight / Math.max(1, video.videoWidth)) * tw;
        const vx = w - tw - 12;
        const vy = 12;
        ctx.save();
        ctx.globalAlpha = 0.52;
        ctx.translate(vx + tw, vy);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, tw, th);
        ctx.restore();
        drawBookSteeringInVideoRect(ctx, pLw, pRw, vx, vy, tw, th, w, h, steer);
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx, vy, tw, th);
      }
    },
    []
  );

  async function start() {
    setPhase("loading");
    setPoseError(null);
    roadPhaseRef.current = 0;
    steerSmoothedRef.current = 0;
    carLaneRef.current = 0;
    scoreRef.current = 0;
    safeStreakRef.current = 0;
    coinArmedRef.current = ROAD_COINS.map(() => true);
    coinLapRef.current = -1;
    coinTotalRef.current = 0;
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STEER_BEST_KEY) : null;
      const n = raw ? parseInt(raw, 10) : 0;
      bestRef.current = Number.isFinite(n) && n > 0 ? n : bestRef.current;
    } catch {
      /* ignore */
    }
    try {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();

      const { stream, label } = await requestBrioOrUserFacingWebcam();
      streamRef.current = stream;
      setCameraLabel(label);
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }

      const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      });
      detectorRef.current = detector;

      const loop = async () => {
        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const det = detectorRef.current;
          if (!video || !canvas || !det || video.readyState < 2) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;
          canvas.width = w;
          canvas.height = h;

          const poses = await det.estimatePoses(video, { flipHorizontal: false });
          const kp = poses[0]?.keypoints;

          let steer = 0;
          const pLs = kp?.[LS];
          const pRs = kp?.[RS];
          const pLw = kp?.[LW];
          const pRw = kp?.[RW];
          if (
            pLs &&
            pRs &&
            pLw &&
            pRw &&
            (pLs.score ?? 0) > 0.25 &&
            (pRs.score ?? 0) > 0.25 &&
            (pLw.score ?? 0) > 0.2 &&
            (pRw.score ?? 0) > 0.2
          ) {
            const shoulderW = Math.hypot(pRs.x - pLs.x, pRs.y - pLs.y) || 1;
            const dx = pRw.x - pLw.x;
            const dy = pRw.y - pLw.y;
            const span = Math.hypot(dx, dy) || 1;
            const spanRatio = span / shoulderW;
            if (spanRatio >= 0.3 && spanRatio <= 2.5) {
              const theta = Math.atan2(dy, dx);
              const maxRad = 0.52;
              steer = clamp(theta / maxRad, -1, 1);
            }
          }

          const sPrev = steerSmoothedRef.current;
          steerSmoothedRef.current = sPrev + (steer - sPrev) * 0.18;
          const smRaw = steerSmoothedRef.current;
          /** Lateral inversion so steering matches mirrored selfie / book intuition. */
          const sm = -smRaw;
          carLaneRef.current += (sm * 0.85 - carLaneRef.current) * 0.08;

          const cx = w * 0.5;
          const roadTop = h * 0.38;
          const roadBot = h * 0.92;
          const laneMax = w * 0.14;
          const cycle = 400;
          const carXpx = cx + carLaneRef.current * laneMax;

          let hitCone = false;
          for (const ob of ROAD_OBSTACLES) {
            const z = (roadPhaseRef.current + ob.off) % cycle;
            const prog = z / cycle;
            if (prog < 0.72 || prog > 0.9) continue;
            const pxScale = 0.32 + prog * 0.68;
            const obstacleX = cx + ob.lane * w * 0.11 * pxScale;
            if (Math.abs(obstacleX - carXpx) < w * 0.052) hitCone = true;
          }

          if (hitCone) {
            safeStreakRef.current = 0;
          } else {
            safeStreakRef.current = Math.min(9999, safeStreakRef.current + 1);
          }

          const lap = Math.floor(roadPhaseRef.current / cycle);
          if (lap !== coinLapRef.current) {
            coinLapRef.current = lap;
            for (let i = 0; i < coinArmedRef.current.length; i++) coinArmedRef.current[i] = true;
          }

          for (let i = 0; i < ROAD_COINS.length; i++) {
            if (!coinArmedRef.current[i]) continue;
            const z = (roadPhaseRef.current + ROAD_COINS[i].off) % cycle;
            const prog = z / cycle;
            if (prog < 0.73 || prog > 0.9) continue;
            const pxScale = 0.32 + prog * 0.68;
            const coinX = cx + ROAD_COINS[i].lane * w * 0.11 * pxScale;
            if (Math.abs(coinX - carXpx) < w * 0.048) {
              coinArmedRef.current[i] = false;
              scoreRef.current += 42;
              coinTotalRef.current += 1;
            }
          }

          const speedMul =
            1 +
            Math.min(0.38, scoreRef.current / 5200) +
            Math.min(0.14, safeStreakRef.current / 5000);
          scoreRef.current += 0.026 * speedMul + (hitCone ? 0 : 0.014);
          roadPhaseRef.current += (1.35 + Math.abs(sm) * 0.58) * speedMul;

          if (scoreRef.current > bestRef.current) {
            bestRef.current = scoreRef.current;
            try {
              localStorage.setItem(STEER_BEST_KEY, String(Math.floor(bestRef.current)));
            } catch {
              /* ignore */
            }
          }

          const hud = {
            score: scoreRef.current,
            best: bestRef.current,
            safe: safeStreakRef.current,
            coins: coinTotalRef.current,
            speedPct: (speedMul - 1) * 100,
          };

          drawFrame(
            ctx,
            w,
            h,
            sm,
            roadPhaseRef.current,
            carLaneRef.current,
            video,
            pLw,
            pRw,
            hud,
            coinArmedRef.current
          );
        } finally {
          rafRef.current = requestAnimationFrame(loop);
        }
      };

      rafRef.current = requestAnimationFrame(loop);
      setPhase("running");
    } catch (e) {
      setPoseError(e instanceof Error ? e.message : "Camera or model failed");
      setPhase("idle");
    }
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <>
      <p className="muted">
        <Link to="/games" className="muted">
          ← Games
        </Link>
        {" · "}
        <Link to="/games/basketball" className="muted">
          Basketball hub
        </Link>
      </p>
      <h1>Motion steering (demo)</h1>
      <p className="muted">
        Webcam + MoveNet: hold a <strong>rectangular book</strong> across your hands like a steering bar — we read the{" "}
        <strong>tilt angle of the line from left wrist to right wrist</strong> (the long edge of the “book”) and map
        that to the wheel. The picture-in-picture is a <strong>mirrored selfie</strong> with the book overlay aligned to it; <strong>lateral steering is inverted</strong> so the car moves the same way you tilt in that preview. Dodge cones, grab <strong>gold orbs</strong> each lap, and build a <strong>clean streak</strong> for extra pace — best score is saved locally. For the full experience see{" "}
        <Link to="/games/motion-steering-race">Motion Grand Prix</Link>.
      </p>
      {cameraLabel && phase !== "idle" && (
        <p className="muted small">
          Camera: <strong>{cameraLabel}</strong>
        </p>
      )}
      {phase === "idle" && (
        <button type="button" className="btn primary" onClick={() => void start()}>
          Start camera
        </button>
      )}
      {phase === "loading" && <p className="muted">Loading camera and MoveNet…</p>}
      {poseError && <p className="error">{poseError}</p>}
      {phase !== "idle" && (
        <div className="motion-cricket-stage card" style={{ marginTop: "0.75rem" }}>
          <video ref={videoRef} className="motion-cricket-feed" playsInline muted />
          <canvas ref={canvasRef} className="motion-cricket-canvas" />
        </div>
      )}
      {phase === "running" && (
        <p className="muted small" style={{ marginTop: "0.75rem" }}>
          Cones and gold bonus orbs scroll toward you — steer with your book, watch the mirrored PiP. Clean driving raises pace; near a cone flashes red.
        </p>
      )}
    </>
  );
}
