import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { supabase } from "../supabaseClient";
import {
  MAX_BALLS,
  MOTION_CRICKET_GAME_TYPE,
  type BatToHostMessage,
  type HostToBatMessage,
} from "./motionCricket";
import {
  buildLanOriginFromIp,
  defaultPhoneOrigin,
  discoverLanIpv4ViaIce,
  shouldTryIceDiscovery,
} from "./phoneOrigin";

const MOVENET_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];

const DELIVERY_MS = 2100;
const PITCH_AT = 0.62;

type DeliveryProfile = {
  releaseX: number;
  pitchX: number;
  pitchY: number;
  endX: number;
  endY: number;
  bounceLift: number;
};

function getBallState(tRaw: number, w: number, h: number, profile: DeliveryProfile) {
  const t = Math.min(1.08, Math.max(0, tRaw));
  const startX = profile.releaseX;
  const startY = h * 0.1;
  const pitchX = profile.pitchX;
  const pitchY = profile.pitchY;
  const endX = profile.endX;
  const endY = profile.endY;

  let x = startX;
  let y = startY;
  if (t <= PITCH_AT) {
    const u = t / PITCH_AT;
    x = startX + (pitchX - startX) * u;
    y = startY + (pitchY - startY) * u * u;
  } else {
    const u = Math.min(1, (t - PITCH_AT) / (1 - PITCH_AT));
    x = pitchX + (endX - pitchX) * u;
    // Rise after bounce, then dip slightly to bat zone.
    y = pitchY + (endY - pitchY) * u - profile.bounceLift * Math.sin(Math.PI * u);
  }

  const r = t <= PITCH_AT ? 8 + t * 8 : 13 - Math.min(1, (t - PITCH_AT) / 0.55) * 3;
  return { t, x, y, r, pitched: t >= PITCH_AT };
}

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-6) return Math.hypot(px - ax, py - ay);
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

type LegacyNavigator = Navigator & {
  webkitGetUserMedia?: (
    constraints: MediaStreamConstraints,
    success: (stream: MediaStream) => void,
    error: (err: unknown) => void
  ) => void;
  mozGetUserMedia?: (
    constraints: MediaStreamConstraints,
    success: (stream: MediaStream) => void,
    error: (err: unknown) => void
  ) => void;
  msGetUserMedia?: (
    constraints: MediaStreamConstraints,
    success: (stream: MediaStream) => void,
    error: (err: unknown) => void
  ) => void;
};

async function requestCameraStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const nav = navigator as LegacyNavigator;
  if (navigator.mediaDevices?.getUserMedia) return navigator.mediaDevices.getUserMedia(constraints);

  const legacy = nav.webkitGetUserMedia ?? nav.mozGetUserMedia ?? nav.msGetUserMedia;
  if (legacy) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacy.call(nav, constraints, resolve, reject);
    });
  }
  throw new Error("Camera API unavailable. Open stadium on http://localhost:5173 or use HTTPS.");
}

export default function MotionCricketHost({ session }: { session: Session | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof poseDetection.createDetector>> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const rafRef = useRef<number>(0);

  const playingRef = useRef(false);
  const runsRef = useRef(0);
  const wicketsRef = useRef(0);
  const ballRef = useRef(0);

  const deliveryActiveRef = useRef(false);
  const deliveryStartMsRef = useRef(0);
  const swingResolvedRef = useRef(false);
  const hitAnimActiveRef = useRef(false);
  const hitAnimStartMsRef = useRef(0);
  const hitStartRef = useRef({ x: 0, y: 0 });
  const hitVelRef = useRef({ x: 0, y: 0 });
  const ballNowRef = useRef({ x: 0, y: 0, t: 0 });
  const deliveryProfileRef = useRef<DeliveryProfile>({
    releaseX: 0,
    pitchX: 0,
    pitchY: 0,
    endX: 0,
    endY: 0,
    bounceLift: 0,
  });
  const batNowRef = useRef<{ wristX: number; wristY: number; tipX: number; tipY: number } | null>(null);

  const [hostId] = useState<string>(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `host-${Math.random().toString(36).slice(2, 10)}`
  );
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "playing" | "done">("idle");
  const [poseError, setPoseError] = useState<string | null>(null);
  const [batConnected, setBatConnected] = useState(false);
  const [runs, setRuns] = useState(0);
  const [wickets, setWickets] = useState(0);
  const [ball, setBall] = useState(0);
  const [lastBallRuns, setLastBallRuns] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deliveryState, setDeliveryState] = useState<"idle" | "in_flight">("idle");
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [phoneOrigin, setPhoneOrigin] = useState(() => defaultPhoneOrigin());
  const [lanDiscovery, setLanDiscovery] = useState<"idle" | "scanning" | "ok" | "fallback">(() =>
    shouldTryIceDiscovery() ? "scanning" : "ok"
  );

  useEffect(() => {
    const v = videoRef.current;
    const s = streamRef.current;
    if (!v || !s) return;
    if (v.srcObject !== s) v.srcObject = s;
    void v.play().catch(() => {});
  }, [phase]);

  useEffect(() => {
    if (!shouldTryIceDiscovery()) {
      setLanDiscovery("ok");
      return;
    }
    setLanDiscovery("scanning");
    void discoverLanIpv4ViaIce().then((ip) => {
      if (ip) {
        setPhoneOrigin(buildLanOriginFromIp(ip));
        setLanDiscovery("ok");
      } else {
        setLanDiscovery("fallback");
      }
    });
  }, []);

  const batUrl = useMemo(() => `${phoneOrigin}/games/bat?host=${encodeURIComponent(hostId)}`, [hostId, phoneOrigin]);

  const broadcast = useCallback((msg: HostToBatMessage) => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({
      type: "broadcast",
      event: "host_msg",
      payload: msg,
    });
  }, []);

  const finishBall = useCallback(
    (runsThisBall: number, outcome: "hit" | "miss" | "late" | "edge") => {
      if (!deliveryActiveRef.current) return;
      deliveryActiveRef.current = false;
      swingResolvedRef.current = true;
      setDeliveryState("idle");

      const nextBall = ballRef.current + 1;
      ballRef.current = nextBall;
      runsRef.current += runsThisBall;

      setBall(nextBall);
      setRuns(runsRef.current);
      setLastBallRuns(runsThisBall);

      if (runsThisBall === 0 && outcome === "late") {
        wicketsRef.current += 1;
        setWickets(wicketsRef.current);
      }

      const text =
        outcome === "hit"
          ? `Crisp hit! +${runsThisBall}`
          : outcome === "edge"
            ? runsThisBall > 0
              ? `Edge! +${runsThisBall}`
              : "Thick edge but fielded"
            : outcome === "late"
              ? "Too late — wicket"
              : "Missed the ball";
      setFeedback(text);

      if (outcome === "hit" || outcome === "edge") {
        hitAnimActiveRef.current = true;
        hitAnimStartMsRef.current = performance.now();
        const canvas = canvasRef.current;
        const cw = canvas?.width || 1;
        const ch = canvas?.height || 1;
        hitStartRef.current = {
          x: ballNowRef.current.x > 0 ? ballNowRef.current.x / cw : 0.5,
          y: ballNowRef.current.y > 0 ? ballNowRef.current.y / ch : 0.63,
        };
        hitVelRef.current = {
          x: outcome === "hit" ? (Math.random() > 0.5 ? 0.22 : -0.22) : 0.12,
          y: outcome === "hit" ? -0.55 : -0.4,
        };
      }

      broadcast({
        type: "ball_result",
        ball: nextBall,
        runs: runsThisBall,
        outcome,
        totalRuns: runsRef.current,
        wickets: wicketsRef.current,
      });
      broadcast({ type: "score_sync", runs: runsRef.current, wickets: wicketsRef.current, balls: nextBall });

      if (nextBall >= MAX_BALLS) {
        playingRef.current = false;
        setPhase("done");
      }
    },
    [broadcast]
  );

  const startNextBall = useCallback(
    (trigger: "bat" | "keyboard") => {
      if (!playingRef.current) return;
      if (deliveryActiveRef.current) return;
      if (ballRef.current >= MAX_BALLS) return;

      deliveryActiveRef.current = true;
      swingResolvedRef.current = false;
      hitAnimActiveRef.current = false;
      ballNowRef.current = { x: 0, y: 0, t: 0 };
      // Realistic line/length variation per delivery.
      const w = canvasRef.current?.width || 1280;
      const h = canvasRef.current?.height || 720;
      // Lefty setup: bowl mostly to right side of batter.
      const rightChannelBase = 0.6;
      const releaseX = w * (rightChannelBase + Math.random() * 0.06);
      const pitchX = w * (rightChannelBase + Math.random() * 0.08);
      const fullLength = Math.random() > 0.45;
      const shortBall = !fullLength && Math.random() > 0.52;
      const pitchY = h * (fullLength ? 0.73 : shortBall ? 0.67 : 0.7);
      const endX = w * (rightChannelBase + Math.random() * 0.1);
      const endY = h * (shortBall ? 0.57 : 0.62);
      deliveryProfileRef.current = {
        releaseX,
        pitchX,
        pitchY,
        endX,
        endY,
        bounceLift: h * (shortBall ? 0.12 : 0.08),
      };
      deliveryStartMsRef.current = performance.now();
      setDeliveryState("in_flight");
      setFeedback(trigger === "bat" ? "Ball delivered from phone" : "Ball delivered from keyboard");

      broadcast({
        type: "ball_started",
        ball: ballRef.current + 1,
        speed: 1,
        etaMs: DELIVERY_MS,
      });
    },
    [broadcast]
  );

  const applySwing = useCallback(
    (_peak: number, _source: "bat" | "keyboard") => {
      // Swing signals are ignored in overlap-only mode.
    },
    []
  );

  const onData = useCallback(
    (data: unknown) => {
      try {
        const msg = data as BatToHostMessage;
        if (msg?.type === "join_request") {
          setBatConnected(true);
          broadcast({ type: "welcome", maxBalls: MAX_BALLS });
          broadcast({ type: "score_sync", runs: runsRef.current, wickets: wicketsRef.current, balls: ballRef.current });
        }
        if (msg?.type === "disconnect_request") {
          setBatConnected(false);
        }
        if (msg?.type === "swing") applySwing(msg.peak, "bat");
        if (msg?.type === "start_innings") startInnings();
        if (msg?.type === "next_ball") startNextBall("bat");
      } catch {
        /* ignore */
      }
    },
    [applySwing, broadcast, startNextBall]
  );

  useEffect(() => {
    const channel = supabase.channel(`motion:${hostId}`);
    channelRef.current = channel;
    channel.on("broadcast", { event: "bat_msg" }, ({ payload }) => onData(payload));
    void channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setFeedback("Session channel error. Refresh stadium.");
      }
      if (status === "CLOSED") {
        setBatConnected(false);
      }
    });
    return () => {
      setBatConnected(false);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [hostId, onData]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      if (e.code === "KeyN") {
        e.preventDefault();
        startNextBall("keyboard");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startNextBall]);

  async function startStadium() {
    setPhase("loading");
    setPoseError(null);
    try {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();

      const stream = await requestCameraStream({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;

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

          // Procedural stadium (no image assets): sky, tiers, field, and pitch.
          const sky = ctx.createLinearGradient(0, 0, 0, h * 0.56);
          sky.addColorStop(0, "#8fd7ff");
          sky.addColorStop(0.6, "#7bc6ef");
          sky.addColorStop(1, "#6bb8df");
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, w, h * 0.56);

          // Stadium tiers.
          const tier1 = ctx.createLinearGradient(0, h * 0.34, 0, h * 0.56);
          tier1.addColorStop(0, "#6b7280");
          tier1.addColorStop(1, "#4b5563");
          ctx.fillStyle = tier1;
          ctx.fillRect(0, h * 0.34, w, h * 0.08);

          const tier2 = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.56);
          tier2.addColorStop(0, "#525f70");
          tier2.addColorStop(1, "#384556");
          ctx.fillStyle = tier2;
          ctx.fillRect(0, h * 0.42, w, h * 0.07);

          // Crowd dots for depth.
          for (let i = 0; i < 180; i += 1) {
            const x = ((i * 73) % 997) / 997;
            const y = ((i * 59) % 313) / 313;
            const px = x * w;
            const py = h * (0.35 + y * 0.13);
            const c = 140 + ((i * 17) % 70);
            ctx.fillStyle = `rgba(${c},${c},${c + 20},0.55)`;
            ctx.fillRect(px, py, 2, 2);
          }

          // Boundary and outfield.
          ctx.fillStyle = "#2f9b2f";
          ctx.fillRect(0, h * 0.49, w, h * 0.51);
          ctx.strokeStyle = "rgba(255,255,255,0.45)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, h * 0.51);
          ctx.lineTo(w, h * 0.51);
          ctx.stroke();

          // Pitch trapezoid (keeper viewpoint).
          ctx.fillStyle = "#d9a86c";
          ctx.beginPath();
          ctx.moveTo(w * 0.43, h * 0.64);
          ctx.lineTo(w * 0.57, h * 0.64);
          ctx.lineTo(w * 0.78, h * 0.92);
          ctx.lineTo(w * 0.22, h * 0.92);
          ctx.closePath();
          ctx.fill();

          // Crease lines.
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(w * 0.41, h * 0.77);
          ctx.lineTo(w * 0.59, h * 0.77);
          ctx.moveTo(w * 0.30, h * 0.89);
          ctx.lineTo(w * 0.70, h * 0.89);
          ctx.stroke();

          const laneGrad = ctx.createLinearGradient(w * 0.5, h * 0.22, w * 0.5, h * 0.95);
          laneGrad.addColorStop(0, "rgba(255,255,255,0.10)");
          laneGrad.addColorStop(1, "rgba(255,255,255,0.03)");
          ctx.fillStyle = laneGrad;
          ctx.fillRect(w * 0.45, h * 0.18, w * 0.1, h * 0.72);

          const poses = await det.estimatePoses(video, { flipHorizontal: false });
          const kp = poses[0]?.keypoints;

          // Keeper-view wicket placements.
          const nearWicketX = w * 0.5;
          const nearWicketY = h * 0.88;
          const nearWicketH = h * 0.20;
          const farWicketX = w * 0.5;
          const farWicketY = h * 0.66;
          const farWicketH = h * 0.11;

          const drawWicket = (x: number, y: number, height: number, alpha = 0.9) => {
            const gap = w * 0.012;
            const stumpW = Math.max(3, w * 0.007);
            ctx.fillStyle = `rgba(218, 148, 74, ${alpha})`;
            for (const dx of [-gap, 0, gap]) {
              ctx.fillRect(x + dx - stumpW / 2, y - height, stumpW, height);
            }
          };

          // Far wicket (batsman end) behind avatar.
          drawWicket(farWicketX, farWicketY, farWicketH, 0.68);
          // Near wicket (keeper end) in foreground.
          drawWicket(nearWicketX, nearWicketY, nearWicketH, 0.95);

          // Draw a large pose-driven batter avatar in front of far wicket.
          {
            const targetFeetY = h * 0.8;
            const targetBodyH = h * 0.46;
            const targetCenterX = w * 0.53;

            let mappedPoints: Array<{ x: number; y: number; score: number }> = [];
            if (kp) {
              const good = kp.filter((p) => (p.score ?? 0) > 0.2);
              if (good.length > 0) {
                const minX = Math.min(...good.map((p) => p.x));
                const maxX = Math.max(...good.map((p) => p.x));
                const minY = Math.min(...good.map((p) => p.y));
                const maxY = Math.max(...good.map((p) => p.y));
                const poseW = Math.max(1, maxX - minX);
                const poseH = Math.max(1, maxY - minY);
                const scale = Math.min((targetBodyH / poseH) * 1.05, (w * 0.22) / poseW);
                const centerX = (minX + maxX) / 2;

                // Mirror pose in keeper-view so batter visually faces incoming ball.
                mappedPoints = kp.map((p) => ({
                  x: targetCenterX - (p.x - centerX) * scale,
                  y: (p.y - maxY) * scale + targetFeetY,
                  score: p.score ?? 0,
                }));
              }
            }

            // Fallback neutral avatar if pose is weak.
            if (mappedPoints.length === 0) {
              const cx = targetCenterX;
              const footY = targetFeetY;
              const bodyH = targetBodyH;
              mappedPoints = [
                { x: cx, y: footY - bodyH * 0.92, score: 1 }, // nose
                { x: cx - w * 0.018, y: footY - bodyH * 0.84, score: 1 }, // left eye
                { x: cx + w * 0.018, y: footY - bodyH * 0.84, score: 1 }, // right eye
                { x: cx - w * 0.035, y: footY - bodyH * 0.78, score: 1 }, // left ear
                { x: cx + w * 0.035, y: footY - bodyH * 0.78, score: 1 }, // right ear
                { x: cx - w * 0.03, y: footY - bodyH * 0.64, score: 1 }, // left shoulder
                { x: cx + w * 0.03, y: footY - bodyH * 0.64, score: 1 }, // right shoulder
                { x: cx - w * 0.045, y: footY - bodyH * 0.48, score: 1 }, // left elbow
                { x: cx + w * 0.055, y: footY - bodyH * 0.42, score: 1 }, // right elbow
                { x: cx - w * 0.052, y: footY - bodyH * 0.28, score: 1 }, // left wrist
                { x: cx + w * 0.062, y: footY - bodyH * 0.26, score: 1 }, // right wrist
                { x: cx - w * 0.024, y: footY - bodyH * 0.34, score: 1 }, // left hip
                { x: cx + w * 0.024, y: footY - bodyH * 0.34, score: 1 }, // right hip
                { x: cx - w * 0.03, y: footY - bodyH * 0.15, score: 1 }, // left knee
                { x: cx + w * 0.028, y: footY - bodyH * 0.13, score: 1 }, // right knee
                { x: cx - w * 0.028, y: footY, score: 1 }, // left ankle
                { x: cx + w * 0.028, y: footY, score: 1 }, // right ankle
              ];
            }
            batNowRef.current = null;

            // Ground shadow below avatar.
            ctx.fillStyle = "rgba(0,0,0,0.30)";
            ctx.beginPath();
            ctx.ellipse(targetCenterX, targetFeetY + 6, w * 0.06, h * 0.018, 0, 0, Math.PI * 2);
            ctx.fill();

            // Filled torso to look like a proper batter body.
            const leftShoulder = mappedPoints[5];
            const rightShoulder = mappedPoints[6];
            const leftHip = mappedPoints[11];
            const rightHip = mappedPoints[12];
            if (leftShoulder && rightShoulder && leftHip && rightHip) {
              ctx.beginPath();
              ctx.moveTo(leftShoulder.x, leftShoulder.y);
              ctx.lineTo(rightShoulder.x, rightShoulder.y);
              ctx.lineTo(rightHip.x, rightHip.y);
              ctx.lineTo(leftHip.x, leftHip.y);
              ctx.closePath();
              ctx.fillStyle = "rgba(30, 64, 175, 0.55)";
              ctx.fill();
            }

            // Skeleton limbs.
            ctx.strokeStyle = "rgba(37, 99, 235, 0.95)";
            ctx.lineWidth = Math.max(3, w * 0.0045);
            ctx.lineCap = "round";
            for (const [a, b] of MOVENET_EDGES) {
              const pa = mappedPoints[a];
              const pb = mappedPoints[b];
              if (!pa || !pb || pa.score < 0.2 || pb.score < 0.2) continue;
              ctx.beginPath();
              ctx.moveTo(pa.x, pa.y);
              ctx.lineTo(pb.x, pb.y);
              ctx.stroke();
            }

            // Keypoint dots (hands/pose visibility).
            for (const p of mappedPoints) {
              if (p.score < 0.2) continue;
              ctx.beginPath();
              ctx.arc(p.x, p.y, Math.max(3, w * 0.005), 0, Math.PI * 2);
              ctx.fillStyle = "rgba(96, 165, 250, 0.95)";
              ctx.fill();
              ctx.strokeStyle = "rgba(7,10,16,0.55)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }

            // Bat from right wrist direction (actual bat shape: handle + blade).
            const rs = mappedPoints[6];
            const rw = mappedPoints[10];
            if (rs && rw && rs.score > 0.2 && rw.score > 0.2) {
              const batLen = h * 0.22;
              const angle = Math.atan2(rw.y - rs.y, rw.x - rs.x);
              const hx = rw.x + Math.cos(angle) * (batLen * 0.22);
              const hy = rw.y + Math.sin(angle) * (batLen * 0.22);
              const bx = rw.x + Math.cos(angle) * batLen;
              const by = rw.y + Math.sin(angle) * batLen;
              batNowRef.current = { wristX: rw.x, wristY: rw.y, tipX: bx, tipY: by };

              // Handle (thin, dark) where player grips.
              ctx.strokeStyle = "rgba(55, 65, 81, 0.98)";
              ctx.lineWidth = Math.max(4, w * 0.006);
              ctx.beginPath();
              ctx.moveTo(rw.x, rw.y);
              ctx.lineTo(hx, hy);
              ctx.stroke();

              // Blade as polygon so it doesn't look like a stick.
              const nx = -Math.sin(angle);
              const ny = Math.cos(angle);
              const bladeNear = Math.max(8, w * 0.012);
              const bladeFar = Math.max(13, w * 0.017);
              const toeX = bx + Math.cos(angle) * (h * 0.018);
              const toeY = by + Math.sin(angle) * (h * 0.018);
              ctx.beginPath();
              ctx.moveTo(hx + nx * bladeNear, hy + ny * bladeNear);
              ctx.lineTo(hx - nx * bladeNear, hy - ny * bladeNear);
              ctx.lineTo(bx - nx * bladeFar, by - ny * bladeFar);
              ctx.lineTo(toeX, toeY);
              ctx.lineTo(bx + nx * bladeFar, by + ny * bladeFar);
              ctx.closePath();
              ctx.fillStyle = "rgba(214, 170, 96, 0.98)";
              ctx.fill();
              ctx.strokeStyle = "rgba(103, 72, 35, 0.9)";
              ctx.lineWidth = 2;
              ctx.stroke();

              // Bat splice line.
              ctx.beginPath();
              ctx.moveTo(hx + nx * (bladeNear * 0.45), hy + ny * (bladeNear * 0.45));
              ctx.lineTo(bx + nx * (bladeFar * 0.4), by + ny * (bladeFar * 0.4));
              ctx.strokeStyle = "rgba(255,255,255,0.45)";
              ctx.lineWidth = 1.3;
              ctx.stroke();
            }
          }

          if (deliveryActiveRef.current) {
            const now = performance.now();
            const tRaw = (now - deliveryStartMsRef.current) / DELIVERY_MS;
            const b = getBallState(tRaw, w, h, deliveryProfileRef.current);
            const { t, x, y, r } = b;
            ballNowRef.current = { x, y, t };

            // Trail (oldest to newest).
            for (let i = 4; i >= 1; i -= 1) {
              const tt = Math.max(0, t - i * 0.05);
              const bt = getBallState(tt, w, h, deliveryProfileRef.current);
              const tx = bt.x;
              const ty = bt.y;
              const tr = Math.max(3, r - i * 2.2);
              ctx.beginPath();
              ctx.arc(tx, ty, tr, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(239, 68, 68, ${0.12 + (5 - i) * 0.1})`;
              ctx.fill();
            }

            // Ball glow + core
            const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 1, x, y, r * 1.45);
            g.addColorStop(0, "rgba(255,220,220,0.95)");
            g.addColorStop(0.35, "rgba(248,113,113,0.98)");
            g.addColorStop(1, "rgba(185,28,28,0.98)");
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.lineWidth = 2.6;
            ctx.strokeStyle = "rgba(255,255,255,0.98)";
            ctx.stroke();

            // Simple seam
            ctx.beginPath();
            ctx.moveTo(x - r * 0.65, y - r * 0.2);
            ctx.lineTo(x + r * 0.65, y + r * 0.2);
            ctx.strokeStyle = "rgba(255,245,245,0.88)";
            ctx.lineWidth = 1.6;
            ctx.stroke();

            if (Math.abs(t - PITCH_AT) < 0.04 || (t > PITCH_AT && t < PITCH_AT + 0.06)) {
              const splashR = w * 0.03 + (t - PITCH_AT) * w * 0.2;
              ctx.beginPath();
              ctx.ellipse(deliveryProfileRef.current.pitchX, deliveryProfileRef.current.pitchY, splashR, h * 0.012, 0, 0, Math.PI * 2);
              ctx.strokeStyle = "rgba(255, 239, 207, 0.55)";
              ctx.lineWidth = 2;
              ctx.stroke();
            }

            // Incoming HUD tag
            ctx.fillStyle = "rgba(255,230,170,0.95)";
            ctx.font = `${Math.max(12, Math.floor(w * 0.014))}px sans-serif`;
            ctx.fillText("INCOMING", w * 0.05, h * 0.12);

            // Overlap-only mode: hit only when ball overlaps the bat itself.
            const bat = batNowRef.current;
            if (!swingResolvedRef.current && bat) {
              // Do not allow "ghost hits" before the ball reaches the batter lane.
              const inBattingZone = t >= 0.7 && y >= h * 0.54;
              if (inBattingZone) {
                const contactDist = distancePointToSegment(x, y, bat.wristX, bat.wristY, bat.tipX, bat.tipY);
                // Strict bat-only overlap: ball radius + blade half-width + small margin.
                const overlapTolerance = r + Math.max(12, w * 0.014);
                if (contactDist <= overlapTolerance) {
                swingResolvedRef.current = true;
                const batVecX = bat.tipX - bat.wristX;
                const batVecY = bat.tipY - bat.wristY;
                const batAngle = Math.atan2(batVecY, batVecX);
                const middleFactor = Math.max(0, 1 - contactDist / Math.max(20, overlapTolerance));
                const faceQuality = Math.max(0, 1 - Math.abs(batAngle - Math.PI * 0.18) / 1.9);
                const shotQuality = 0.68 * middleFactor + 0.32 * faceQuality;
                // Requested outcomes on contact: only 4 or 6.
                const rScore = shotQuality > 0.6 ? 6 : 4;
                finishBall(rScore, "hit");
                }
              }
            }

            if (t >= 1.12 && !swingResolvedRef.current) {
              swingResolvedRef.current = true;
              finishBall(0, "miss");
            }
          }

          // Post-hit follow-through animation: ball flies to outfield.
          if (hitAnimActiveRef.current) {
            const ht = (performance.now() - hitAnimStartMsRef.current) / 950;
            if (ht >= 1) {
              hitAnimActiveRef.current = false;
            } else {
              const sx = hitStartRef.current.x * w;
              const sy = hitStartRef.current.y * h;
              const vx = hitVelRef.current.x * w;
              const vy = hitVelRef.current.y * h;
              const x = sx + vx * ht;
              const y = sy + vy * ht + (h * 0.35) * ht * ht;
              const r = Math.max(4, 11 - ht * 5);

              for (let i = 4; i >= 1; i -= 1) {
                const tt = Math.max(0, ht - i * 0.05);
                const tx = sx + vx * tt;
                const ty = sy + vy * tt + (h * 0.35) * tt * tt;
                const tr = Math.max(2, r - i);
                ctx.beginPath();
                ctx.arc(tx, ty, tr, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(239, 68, 68, ${0.10 + (5 - i) * 0.08})`;
                ctx.fill();
              }

              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(239,68,68,0.98)";
              ctx.fill();
              ctx.strokeStyle = "rgba(255,255,255,0.95)";
              ctx.lineWidth = 1.8;
              ctx.stroke();
            }
          }

          // Small webcam thumbnail at bottom-right (player reference, not full overlay).
          const thumbW = Math.min(w * 0.26, 240);
          const thumbH = thumbW * 0.58;
          const tx = w - thumbW - 18;
          const ty = h - thumbH - 18;
          ctx.save();
          ctx.fillStyle = "rgba(7,10,16,0.78)";
          ctx.fillRect(tx - 2, ty - 22, thumbW + 4, thumbH + 24);
          ctx.drawImage(video, tx, ty, thumbW, thumbH);
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 2;
          ctx.strokeRect(tx, ty, thumbW, thumbH);
          ctx.fillStyle = "rgba(255,255,255,0.86)";
          ctx.font = `${Math.max(11, Math.floor(w * 0.012))}px sans-serif`;
          ctx.fillText("You (camera)", tx + 8, ty - 8);
          ctx.restore();
        } finally {
          rafRef.current = requestAnimationFrame(loop);
        }
      };

      rafRef.current = requestAnimationFrame(loop);
      setPhase("ready");
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

  function startInnings() {
    runsRef.current = 0;
    wicketsRef.current = 0;
    ballRef.current = 0;
    deliveryActiveRef.current = false;
    swingResolvedRef.current = false;
    hitAnimActiveRef.current = false;
    ballNowRef.current = { x: 0, y: 0, t: 0 };

    setRuns(0);
    setWickets(0);
    setBall(0);
    setLastBallRuns(null);
    setFeedback("Tap Next Ball on phone to deliver.");
    setDeliveryState("idle");

    playingRef.current = true;
    setPhase("playing");

    broadcast({ type: "score_sync", runs: 0, wickets: 0, balls: 0 });
  }

  const disconnectBat = useCallback(() => {
    broadcast({ type: "host_disconnected", reason: "Disconnected by stadium host." });
    setBatConnected(false);
    setFeedback("Bat disconnected.");
  }, [broadcast]);

  async function submitScore() {
    setSubmitErr(null);
    setSubmitMsg(null);
    if (!session?.user) {
      setSubmitErr("Sign in to save your score.");
      return;
    }
    const { error } = await supabase.from("game_sessions").insert({
      user_id: session.user.id,
      game_type: MOTION_CRICKET_GAME_TYPE,
      score: runs,
      duration_ms: null,
      metadata: { balls: ball, wickets, source: "motion_cricket_host", bat_connected: batConnected },
    });
    if (error) setSubmitErr(error.message);
    else setSubmitMsg("Score saved to leaderboard.");
  }

  return (
    <>
      <Link to="/games" className="muted">
        ← Games
      </Link>
      <h1>Motion cricket — stadium (laptop)</h1>
      <p className="muted">
        Stadium mode: phone sends <strong>Next Ball</strong>. A hit is auto-detected when your pose-driven bat overlaps
        the ball. Press <kbd className="kbd-inline">N</kbd> for next ball.
      </p>

      <div className="card motion-cricket-pair">
          <h2 className="motion-cricket-pair-title">Phone as bat</h2>
          <p className="muted">
            Pair in either way:
            <strong> (1)</strong> open Bat screen and paste Host ID manually, or
            <strong> (2)</strong> open the prefilled Bat link below.
          </p>
          {lanDiscovery === "scanning" && <p className="muted small">Detecting your LAN address…</p>}
          {lanDiscovery === "fallback" && (
            <p className="error small">
              Could not detect LAN IP. Set <code>VITE_PHONE_URL_ORIGIN=http://YOUR_LAN_IP:5173</code> and restart dev.
            </p>
          )}
          <code className="motion-cricket-url">{batUrl}</code>
          <div style={{ marginTop: "0.75rem", display: "inline-block", background: "#fff", padding: "10px", borderRadius: "10px" }}>
            <QRCodeSVG value={batUrl} size={176} includeMargin />
          </div>
          <p className="muted small">Scan QR on phone to open Bat with prefilled Host ID.</p>
          <p style={{ marginTop: "0.6rem" }}>
            <a className="btn" href={batUrl} target="_blank" rel="noreferrer">
              Open bat with prefilled Host ID
            </a>
          </p>
          <p className="muted small">
            Host ID: <strong>{hostId}</strong>{" "}
            {batConnected ? <span className="badge live">Bat connected</span> : <span className="muted">Waiting…</span>}
          </p>
          <button type="button" className="btn" disabled={!batConnected} onClick={disconnectBat}>
            Disconnect bat
          </button>
        </div>

      {phase === "idle" && (
        <button type="button" className="btn primary" onClick={() => void startStadium()}>
          Start camera & pose
        </button>
      )}
      {phase === "loading" && <p className="muted">Loading camera and MoveNet…</p>}
      {poseError && <p className="error">{poseError}</p>}

      {phase !== "idle" && (
        <div className="motion-cricket-stage card">
          <video ref={videoRef} className="motion-cricket-feed" playsInline muted />
          <canvas ref={canvasRef} className="motion-cricket-canvas" />
        </div>
      )}

      {phase === "ready" && (
        <p style={{ marginTop: "1rem" }}>
          <button type="button" className="btn primary" onClick={startInnings}>
            Start innings ({MAX_BALLS} balls)
          </button>
        </p>
      )}

      {(phase === "playing" || phase === "done") && (
        <div className="card motion-cricket-scoreboard">
          <div>
            <strong>Runs:</strong> {runs} &nbsp; <strong>Wkts:</strong> {wickets} &nbsp; <strong>Ball:</strong> {ball}/
            {MAX_BALLS}
          </div>
          <p className="muted">Delivery: {deliveryState === "in_flight" ? "In flight" : "Tap Next Ball on phone"}</p>
          {lastBallRuns != null && <p className="muted">Last ball: {lastBallRuns} runs</p>}
          {feedback && <p className="motion-cricket-feedback">{feedback}</p>}
        </div>
      )}

      {phase === "done" && (
        <div className="card">
          <h2>Innings complete</h2>
          <p>
            Total <strong>{runs}</strong> runs, <strong>{wickets}</strong> wickets, in {MAX_BALLS} balls.
          </p>
          <button type="button" className="btn primary" onClick={() => void submitScore()} disabled={!session}>
            Save score
          </button>
          {!session && <p className="muted">Sign in to save.</p>}
          {submitMsg && <p>{submitMsg}</p>}
          {submitErr && <p className="error">{submitErr}</p>}
          <p style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn" onClick={startInnings}>
              Play again
            </button>
          </p>
        </div>
      )}
    </>
  );
}
