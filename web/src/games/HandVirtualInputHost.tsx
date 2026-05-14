import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import { requestBrioOrUserFacingWebcam } from "../lib/cameraStream";
import {
  countExtendedFingersPerHand,
  dominantIndexTipMirrored,
  fingerGestureLevel,
  maxExtendedFingerCount,
} from "./handFingerGestures";

const LW = 9;
const RW = 10;

export type KeyDef = { label: string; x: number; y: number; w: number; h: number };

function layoutKeys(w: number, h: number): KeyDef[] {
  const pad = w * 0.02;
  const kbTop = h * 0.5;
  const keyH = (h - kbTop - pad * 2) / 3.4;
  const keyW = (w - pad * 2) / 10.5;
  const rows: string[][] = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "⌫"],
    ["Z", "X", "C", "V", "B", "N", "M", "␣", "↵"],
  ];
  const keys: KeyDef[] = [];
  rows.forEach((row, ri) => {
    const y = kbTop + ri * (keyH + pad * 0.4);
    let x0 = pad;
    row.forEach((label) => {
      const kw =
        label === "␣" ? keyW * 2.8 : label === "↵" ? keyW * 1.35 : label === "⌫" ? keyW * 1.15 : keyW;
      keys.push({ label, x: x0, y, w: kw, h: keyH });
      x0 += kw + pad * 0.35;
    });
  });
  return keys;
}

function hitKey(keys: KeyDef[], px: number, py: number): KeyDef | null {
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    if (px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h) return k;
  }
  return null;
}

function applyKeyLabel(buf: string, label: string, long: boolean): string {
  let add = "";
  if (label === "⌫") {
    const once = buf.slice(0, -1);
    return long ? once.slice(0, -1) : once;
  }
  if (label === "␣") add = " ";
  else if (label === "↵") add = "\n";
  else add = label;
  if (long) add = `${add}${add}`;
  return buf + add;
}

export default function HandVirtualInputHost() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseDetectorRef = useRef<Awaited<ReturnType<typeof poseDetection.createDetector>> | null>(null);
  const handDetectorRef = useRef<handPoseDetection.HandDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  const cursorRef = useRef({ x: 320, y: 240 });
  const cursorInitedRef = useRef(false);
  const prevLevelRef = useRef<0 | 1 | 2>(0);
  const sinceOneRef = useRef<number | null>(null);
  const sinceTwoRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);
  const bufferRef = useRef("");

  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [poseError, setPoseError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);
  const [buffer, setBuffer] = useState("");
  const [hud, setHud] = useState<{ maxF: number; sumF: number; level: 0 | 1 | 2; last: string }>({
    maxF: 0,
    sumF: 0,
    level: 0,
    last: "—",
  });

  async function start() {
    setPhase("loading");
    setPoseError(null);
    cursorInitedRef.current = false;
    bufferRef.current = "";
    setBuffer("");
    prevLevelRef.current = 0;
    sinceOneRef.current = null;
    sinceTwoRef.current = null;
    longFiredRef.current = false;
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
        await new Promise<void>((resolve) => {
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            resolve();
            return;
          }
          const onMeta = () => {
            v.removeEventListener("loadedmetadata", onMeta);
            resolve();
          };
          v.addEventListener("loadedmetadata", onMeta);
          window.setTimeout(() => {
            v.removeEventListener("loadedmetadata", onMeta);
            resolve();
          }, 4000);
        });
      }

      const poseDet = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      });
      poseDetectorRef.current = poseDet;

      const handDet = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
        runtime: "tfjs",
        modelType: "lite",
        maxHands: 2,
      });
      handDetectorRef.current = handDet;

      const loop = async () => {
        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const poseDetLoop = poseDetectorRef.current;
          const handDetLoop = handDetectorRef.current;
          if (!video || !canvas || !poseDetLoop || !handDetLoop || video.readyState < 2) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;
          canvas.width = w;
          canvas.height = h;

          if (!cursorInitedRef.current) {
            cursorRef.current = { x: w * 0.5, y: h * 0.32 };
            cursorInitedRef.current = true;
          }

          const keys = layoutKeys(w, h);

          const [poses, hands] = await Promise.all([
            poseDetLoop.estimatePoses(video, { flipHorizontal: false }),
            handDetLoop.estimateHands(video, { flipHorizontal: false, staticImageMode: false }),
          ]);
          const kp = poses[0]?.keypoints;

          const totalFingers = hands.reduce((s, h) => s + countExtendedFingersPerHand(h), 0);
          const maxFingers = maxExtendedFingerCount(hands);
          const level = fingerGestureLevel(maxFingers);

          const tipMirrored = dominantIndexTipMirrored(hands, w);
          const pLw = kp?.[LW];
          const pRw = kp?.[RW];
          if (tipMirrored) {
            const c = cursorRef.current;
            c.x += (tipMirrored.x - c.x) * 0.34;
            c.y += (tipMirrored.y - c.y) * 0.34;
          } else if (pLw && pRw && (pLw.score ?? 0) > 0.15 && (pRw.score ?? 0) > 0.15) {
            const rawX = w - (pLw.x + pRw.x) / 2;
            const rawY = (pLw.y + pRw.y) / 2;
            const c = cursorRef.current;
            c.x += (rawX - c.x) * 0.3;
            c.y += (rawY - c.y) * 0.3;
          }

          const now = performance.now();
          const prev = prevLevelRef.current;

          if (level === 0) {
            if (prev === 1 && sinceOneRef.current != null && !longFiredRef.current) {
              const dt = now - sinceOneRef.current;
              // Require a short hold so noise doesn't fire; no upper cap — users often aim >0.5s before release.
              if (dt >= 28) {
                const key = hitKey(keys, cursorRef.current.x, cursorRef.current.y);
                if (key) {
                  const next = applyKeyLabel(bufferRef.current, key.label, false);
                  bufferRef.current = next;
                  setBuffer(next);
                  setHud((s) => ({ ...s, last: `Click: ${key.label}` }));
                } else {
                  setHud((s) => ({ ...s, last: "Click: (no key)" }));
                }
              }
            }
            sinceOneRef.current = null;
            sinceTwoRef.current = null;
            longFiredRef.current = false;
          } else if (level === 1) {
            if (prev !== 1) sinceOneRef.current = now;
            if (prev >= 2) sinceTwoRef.current = null;
          } else {
            if (prev < 2) sinceTwoRef.current = now;
            if (sinceTwoRef.current != null && !longFiredRef.current && now - sinceTwoRef.current > 450) {
              longFiredRef.current = true;
              const key = hitKey(keys, cursorRef.current.x, cursorRef.current.y);
              if (key) {
                const next = applyKeyLabel(bufferRef.current, key.label, true);
                bufferRef.current = next;
                setBuffer(next);
                setHud((s) => ({ ...s, last: `Long: ${key.label} (doubled)` }));
              } else {
                setHud((s) => ({ ...s, last: "Long: (no key)" }));
              }
            }
          }

          prevLevelRef.current = level;

          const bg = ctx.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, "#0e1218");
          bg.addColorStop(1, "#141a24");
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, w, h);

          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.lineWidth = 1;
          for (const k of keys) {
            ctx.fillStyle = "rgba(30,36,48,0.92)";
            ctx.fillRect(k.x, k.y, k.w, k.h);
            ctx.strokeRect(k.x, k.y, k.w, k.h);
            ctx.fillStyle = "rgba(235,240,255,0.92)";
            ctx.font = `${Math.max(11, Math.floor(k.h * 0.38))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(k.label, k.x + k.w / 2, k.y + k.h / 2);
          }

          const cx = cursorRef.current.x;
          const cy = cursorRef.current.y;
          const hk = hitKey(keys, cx, cy);
          if (hk) {
            ctx.strokeStyle = "rgba(120,200,255,0.45)";
            ctx.lineWidth = 2;
            ctx.strokeRect(hk.x - 2, hk.y - 2, hk.w + 4, hk.h + 4);
          }

          const ring =
            level === 0
              ? "rgba(255,255,255,0.55)"
              : level === 1
                ? "rgba(255, 180, 90, 0.9)"
                : "rgba(220, 120, 255, 0.95)";
          ctx.strokeStyle = ring;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(10, w * 0.018), 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fill();

          if (level >= 2 && sinceTwoRef.current != null) {
            const t = Math.min(1, (now - sinceTwoRef.current) / 450);
            ctx.strokeStyle = `rgba(220, 140, 255, ${0.35 + t * 0.5})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(14, w * 0.028) + t * w * 0.04, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.fillStyle = "rgba(6,8,12,0.72)";
          ctx.fillRect(10, 10, w * 0.88, h * 0.12);
          ctx.fillStyle = "rgba(240,245,255,0.95)";
          ctx.font = `${Math.max(11, Math.floor(w * 0.018))}px monospace`;
          ctx.textAlign = "left";
          const preview = bufferRef.current.replace(/\n/g, "↵ ");
          const line = preview.length > 120 ? `…${preview.slice(-118)}` : preview;
          ctx.fillText(line || "typed text…", 18, 32);
          ctx.font = `${Math.max(10, Math.floor(w * 0.014))}px sans-serif`;
          ctx.fillStyle = "rgba(180,195,220,0.9)";
          const modeLabel = level === 0 ? "hover" : level === 1 ? "1 finger → click on release" : "2+ fingers → long";
          ctx.fillText(`Fingers max ${maxFingers} (Σ${totalFingers}) · ${modeLabel}`, 18, 54);

          if (now % 400 < 20) {
            setHud((s) => ({ ...s, maxF: maxFingers, sumF: totalFingers, level, last: s.last }));
          }
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
      handDetectorRef.current?.dispose();
      handDetectorRef.current = null;
      poseDetectorRef.current = null;
    };
  }, []);

  return (
    <>
      <p className="muted">
        <Link to="/games" className="muted">
          ← Games
        </Link>
      </p>
      <h1>Hand virtual keyboard &amp; cursor</h1>
      <p className="muted">
        In-page only (does not move your system mouse). Uses <strong>MediaPipe Hands</strong> (TensorFlow.js) to count
        raised fingers: <strong>no fingers extended</strong> = move cursor only (hover); <strong>one finger</strong> on
        a hand = click on release; <strong>two or more on the same hand</strong> = long action after a short hold. The
        camera strip above the canvas is your live feed so the browser keeps decoding frames for tracking.
      </p>

      <div className="card" style={{ marginTop: "0.75rem" }}>
        <h2 style={{ marginTop: 0 }}>Finger → mouse</h2>
        <ul className="muted small" style={{ marginBottom: 0, paddingLeft: "1.1rem" }}>
          <li>
            <strong>Hover / move:</strong> keep a relaxed hand (0 fingers counted extended) or move before you tap a
            key — cursor follows your <strong>index tip</strong> (mirrored), or wrists via MoveNet if the hand model
            loses you briefly.
          </li>
          <li>
            <strong>Click:</strong> on a hand, show <strong>exactly one</strong> extended finger (often index), then
            relax so that hand shows <strong>none</strong> — the key fires on release (you can hold the pose for several
            seconds while aiming; only a very quick flick is ignored).
          </li>
          <li>
            <strong>Long click:</strong> on one hand, hold <strong>two or more</strong> extended fingers (e.g. peace sign)
            ~0.45s — inserts doubled characters. (One finger on each hand still counts as hover/click, not long.)
          </li>
          <li>
            <strong>Preview:</strong> live camera above the keyboard; cursor ring shows where taps register.
          </li>
        </ul>
      </div>

      {cameraLabel && phase !== "idle" && (
        <p className="muted small" style={{ marginTop: "0.5rem" }}>
          Camera: <strong>{cameraLabel}</strong>
        </p>
      )}

      {phase === "idle" && (
        <button type="button" className="btn primary" style={{ marginTop: "0.5rem" }} onClick={() => void start()}>
          Start camera
        </button>
      )}
      {phase === "loading" && <p className="muted">Loading camera, MoveNet, and hand model…</p>}
      {poseError && <p className="error">{poseError}</p>}

      {phase !== "idle" && (
        <div className="motion-cricket-stage hand-virtual-stage card" style={{ marginTop: "0.75rem" }}>
          <video ref={videoRef} className="motion-cricket-feed" playsInline muted />
          <canvas ref={canvasRef} className="motion-cricket-canvas" />
        </div>
      )}

      {phase === "running" && (
        <div className="card" style={{ marginTop: "0.75rem" }}>
          <p className="muted small" style={{ marginTop: 0 }}>
            Last gesture: <strong>{hud.last}</strong> · Max / sum fingers: {hud.maxF} / {hud.sumF} · Mode:{" "}
            {hud.level === 0 ? "hover" : hud.level === 1 ? "1-finger" : "2+ long"}
          </p>
          <label className="muted small" style={{ display: "block", marginTop: "0.5rem" }}>
            Typed buffer (copy if you like)
            <textarea
              className="motion-cricket-input"
              style={{ width: "100%", maxWidth: "none", minHeight: "5rem", marginTop: "0.35rem" }}
              readOnly
              value={buffer}
            />
          </label>
        </div>
      )}
    </>
  );
}
