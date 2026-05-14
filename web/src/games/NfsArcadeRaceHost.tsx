import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { requestBrioOrUserFacingWebcam } from "../lib/cameraStream";
import { drawBookSteeringInVideoRect } from "../lib/steeringBookPipOverlay";

const LS = 5;
const RS = 6;
const LW = 9;
const RW = 10;
const NOSE = 0;

const RACE_MS = 100_000;
const AI_COUNT = 7;
const BEST_KEY = "nfs-arcade-race-best";

const AI_NAMES = ["Viper", "Ghost", "Fury", "Razor", "Storm", "Nitro", "Blade"] as const;

/** Scrolling traffic: lane −1…1, phase offset */
const TRAFFIC: { lane: number; off: number; hue: string }[] = [
  { lane: -0.5, off: 0, hue: "#e11d48" },
  { lane: 0.45, off: 70, hue: "#6366f1" },
  { lane: -0.15, off: 140, hue: "#22c55e" },
  { lane: 0.6, off: 210, hue: "#eab308" },
  { lane: -0.65, off: 280, hue: "#a855f7" },
  { lane: 0.2, off: 350, hue: "#f97316" },
  { lane: -0.35, off: 95, hue: "#14b8a6" },
  { lane: 0.55, off: 165, hue: "#ec4899" },
];

const PICKUPS: { lane: number; off: number }[] = [
  { lane: -0.72, off: 40 },
  { lane: 0.68, off: 200 },
  { lane: -0.55, off: 320 },
  { lane: 0.5, off: 420 },
];

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, rw: number, rh: number, r: number) {
  const rr = Math.min(r, rw / 2, rh / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + rw - rr, y);
  ctx.quadraticCurveTo(x + rw, y, x + rw, y + rr);
  ctx.lineTo(x + rw, y + rh - rr);
  ctx.quadraticCurveTo(x + rw, y + rh, x + rw - rr, y + rh);
  ctx.lineTo(x + rr, y + rh);
  ctx.quadraticCurveTo(x, y + rh, x, y + rh - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

type Hud = {
  mph: number;
  nitro: number;
  rank: number;
  score: number;
  best: number;
  timeLeft: number;
  finished: boolean;
  pack: { pos: number; name: string; you: boolean }[];
  drafting: boolean;
};

export default function NfsArcadeRaceHost() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof poseDetection.createDetector>> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  const worldZRef = useRef(0);
  const laneRef = useRef(0);
  const steerSmoothedRef = useRef(0);
  const throttleRef = useRef(0.4);
  const nitroRef = useRef(0);
  const scoreRef = useRef(0);
  const bestRef = useRef(0);
  const pickupArmedRef = useRef(PICKUPS.map(() => true));
  const pickupLapRef = useRef(-1);
  const aiProgRef = useRef<number[]>([]);
  const aiPaceRef = useRef<number[]>([]);
  const raceStartRef = useRef(0);
  const finishedRef = useRef(false);
  const lastMsRef = useRef(0);
  const draftTimerRef = useRef(0);

  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [poseError, setPoseError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ rank: number; score: number } | null>(null);

  const drawFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      steerVis: number,
      worldZ: number,
      lane: number,
      video: HTMLVideoElement | null,
      pLw: { x: number; y: number; score?: number } | undefined,
      pRw: { x: number; y: number; score?: number } | undefined,
      hud: Hud,
      pickupArmed: readonly boolean[]
    ) => {
      const horizon = h * 0.3;
      const bend = steerVis * w * 0.2;

      const sky = ctx.createLinearGradient(0, 0, w, horizon * 1.4);
      sky.addColorStop(0, "#0f0518");
      sky.addColorStop(0.4, "#1a0a2e");
      sky.addColorStop(0.75, "#2d1048");
      sky.addColorStop(1, "#12081c");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const sg = ctx.createRadialGradient(w * 0.5, horizon * 0.4, 0, w * 0.5, horizon * 0.5, w * 0.9);
      sg.addColorStop(0, "rgba(255, 60, 120, 0.15)");
      sg.addColorStop(0.5, "rgba(80, 20, 120, 0.08)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, horizon * 1.2);

      const bx = (worldZ * 0.08) % (w * 0.35);
      for (let i = 0; i < 18; i++) {
        const bw = w * (0.04 + (i % 4) * 0.02);
        const bh = h * (0.08 + (i % 3) * 0.04);
        const x = ((i * 97 + bx) % 1) * w * 1.1 - w * 0.05;
        const y = horizon * 0.2 + ((i * 53) % 100) * 0.01 * h;
        ctx.fillStyle = `rgba(10, 8, 24, ${0.35 + (i % 3) * 0.1})`;
        ctx.fillRect(x, y, bw, bh);
      }

      const roadRows = 56;
      for (let i = 0; i < roadRows; i++) {
        const t = i / (roadRows - 1);
        const y = horizon + t * (h - horizon);
        const scale = 0.08 + t * 0.92;
        const half = w * 0.42 * scale;
        const cxRow = w * 0.5 + bend * (1 - t) ** 1.45 * 0.85;
        const left = cxRow - half;
        const right = cxRow + half;
        const prevT = i === 0 ? 0 : (i - 1) / (roadRows - 1);
        const prevY = horizon + prevT * (h - horizon);
        const prevScale = 0.08 + prevT * 0.92;
        const prevHalf = w * 0.42 * prevScale;
        const prevCx = w * 0.5 + bend * (1 - prevT) ** 1.45 * 0.85;

        ctx.fillStyle = i % 2 === 0 ? "#15151f" : "#12121a";
        ctx.beginPath();
        ctx.moveTo(prevCx - prevHalf, prevY);
        ctx.lineTo(prevCx + prevHalf, prevY);
        ctx.lineTo(right, y);
        ctx.lineTo(left, y);
        ctx.closePath();
        ctx.fill();

        if (i % 3 === 0 && t > 0.12) {
          const dashW = half * 0.06;
          const cxDash = cxRow - dashW / 2 + Math.sin(worldZ * 0.04 + i * 0.5) * half * 0.02;
          ctx.fillStyle = "rgba(255, 220, 140, 0.55)";
          ctx.fillRect(cxDash - dashW / 2, y - 2, dashW, 3);
        }
      }

      ctx.strokeStyle = "rgba(236, 72, 153, 0.45)";
      ctx.lineWidth = 3;
      for (let i = 0; i < roadRows; i += 2) {
        const t = i / (roadRows - 1);
        const y = horizon + t * (h - horizon);
        const scale = 0.08 + t * 0.92;
        const half = w * 0.42 * scale;
        const cxRow = w * 0.5 + bend * (1 - t) ** 1.45 * 0.85;
        ctx.beginPath();
        ctx.moveTo(cxRow - half, y);
        ctx.lineTo(cxRow - half - w * 0.02 * scale, y + 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cxRow + half, y);
        ctx.lineTo(cxRow + half + w * 0.02 * scale, y + 4);
        ctx.stroke();
      }

      const cycle = 420;
      const drawCarSilhouette = (
        cx0: number,
        y0: number,
        halfW: number,
        carH: number,
        fill: string,
        tailGlow: boolean
      ) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        roundRectPath(ctx, cx0 - halfW, y0 - carH, halfW * 2, carH, halfW * 0.25);
        ctx.fill();
        if (tailGlow) {
          ctx.fillStyle = "rgba(255, 80, 40, 0.65)";
          ctx.fillRect(cx0 - halfW * 0.35, y0 - 3, halfW * 0.7, 5);
        }
        ctx.fillStyle = "rgba(40, 200, 255, 0.35)";
        ctx.fillRect(cx0 - halfW * 0.55, y0 - carH * 0.72, halfW * 1.1, carH * 0.22);
      };

      for (const tr of TRAFFIC) {
        const z = (worldZ + tr.off) % cycle;
        const prog = z / cycle;
        if (prog < 0.03 || prog > 0.98) continue;
        const t = 0.1 + prog * 0.88;
        const y = horizon + t * (h - horizon);
        const scale = 0.08 + t * 0.92;
        const half = w * 0.42 * scale;
        const cxRow = w * 0.5 + bend * (1 - t) ** 1.45 * 0.85;
        const ox = cxRow + tr.lane * w * 0.11 * scale;
        const carH = h * 0.05 * (0.4 + scale);
        const carW = half * 0.42;
        drawCarSilhouette(ox, y, carW, carH, tr.hue, prog > 0.55);
      }

      for (let pi = 0; pi < PICKUPS.length; pi++) {
        const p = PICKUPS[pi];
        const z = (worldZ + p.off) % cycle;
        const prog = z / cycle;
        if (prog < 0.04 || prog > 0.97) continue;
        const t = 0.1 + prog * 0.88;
        const y = horizon + t * (h - horizon);
        const scale = 0.08 + t * 0.92;
        const half = w * 0.42 * scale;
        const cxRow = w * 0.5 + bend * (1 - t) ** 1.45 * 0.85;
        const ox = cxRow + p.lane * w * 0.11 * scale;
        const r = h * 0.018 * scale * 8;
        const armed = pickupArmed[pi] ?? true;
        ctx.fillStyle = armed ? "rgba(0, 255, 200, 0.9)" : "rgba(40, 60, 55, 0.5)";
        ctx.beginPath();
        ctx.arc(ox, y - r * 0.3, r, 0, Math.PI * 2);
        ctx.fill();
      }

      const tPlayer = 0.94;
      const yP = horizon + tPlayer * (h - horizon);
      const scaleP = 0.08 + tPlayer * 0.92;
      const halfP = w * 0.42 * scaleP;
      const cxP = w * 0.5 + bend * (1 - tPlayer) ** 1.45 * 0.85;
      const px = cxP + lane * w * 0.11 * scaleP;
      const carH = h * 0.065;
      const carW = halfP * 0.48;

      if (hud.nitro > 8 && hud.mph > 140) {
        ctx.strokeStyle = "rgba(0, 220, 255, 0.35)";
        ctx.lineWidth = 4;
        for (let s = 0; s < 6; s++) {
          ctx.beginPath();
          ctx.moveTo(px - carW, yP + s * 5);
          ctx.lineTo(px - carW * 1.8 - s * 8, yP + 25 + s * 10);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px + carW, yP + s * 5);
          ctx.lineTo(px + carW * 1.8 + s * 8, yP + 25 + s * 10);
          ctx.stroke();
        }
      }

      const body = ctx.createLinearGradient(px - carW, yP - carH, px + carW, yP);
      body.addColorStop(0, "#1e293b");
      body.addColorStop(0.45, "#334155");
      body.addColorStop(1, "#0f172a");
      drawCarSilhouette(px, yP, carW, carH, "#0f172a", true);
      ctx.fillStyle = body;
      ctx.beginPath();
      roundRectPath(ctx, px - carW, yP - carH, carW * 2, carH, carW * 0.28);
      ctx.fill();
      ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
      ctx.fillRect(px - carW * 0.75, yP - carH * 0.78, carW * 1.5, carH * 0.28);
      ctx.strokeStyle = "rgba(244, 114, 182, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(px - carW - 1, yP - carH - 1, carW * 2 + 2, carH + 2);

      const rainA = clamp(hud.mph / 220, 0.15, 0.55);
      ctx.strokeStyle = `rgba(200, 220, 255, ${rainA * 0.35})`;
      ctx.lineWidth = 1;
      for (let r = 0; r < 80; r++) {
        const rx = ((r * 73 + worldZ * 2) % w) + (r % 3) * 2;
        const ry = ((r * 47) % h) * 0.95;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + 10, ry + 22);
        ctx.stroke();
      }

      const card = (x: number, y: number, rw: number, rh: number) => {
        ctx.fillStyle = "rgba(6, 8, 16, 0.78)";
        ctx.beginPath();
        roundRectPath(ctx, x, y, rw, rh, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        roundRectPath(ctx, x, y, rw, rh, 10);
        ctx.stroke();
      };

      card(10, 10, w * 0.2, h * 0.14);
      ctx.fillStyle = "#f8fafc";
      ctx.font = `700 ${Math.max(10, w * 0.014)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText("SPEED", 22, 32);
      ctx.font = `800 ${Math.max(22, w * 0.038)}px monospace`;
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`${Math.round(hud.mph)}`, 22, 68);
      ctx.font = `${Math.max(10, w * 0.012)}px sans-serif`;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("MPH", 22, 86);

      card(w * 0.22, 10, w * 0.2, h * 0.14);
      ctx.fillStyle = "#f8fafc";
      ctx.font = `700 ${Math.max(10, w * 0.014)}px sans-serif`;
      ctx.fillText("NITRO", w * 0.22 + 12, 32);
      const nx = w * 0.22 + 14;
      const ny = 44;
      const nw = w * 0.18;
      const nh = 18;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(nx, ny, nw, nh);
      ctx.fillStyle = hud.drafting ? "#22d3ee" : "#a855f7";
      ctx.fillRect(nx, ny, (nw * hud.nitro) / 100, nh);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(nx, ny, nw, nh);

      card(w * 0.44, 10, w * 0.22, h * 0.14);
      ctx.fillStyle = "#f8fafc";
      ctx.font = `700 ${Math.max(10, w * 0.014)}px sans-serif`;
      ctx.fillText("RANK · TIME", w * 0.44 + 12, 32);
      ctx.font = `${Math.max(14, w * 0.022)}px sans-serif`;
      ctx.fillStyle = "#fde68a";
      ctx.fillText(`P${hud.rank} · ${hud.timeLeft.toFixed(1)}s`, w * 0.44 + 12, 62);
      ctx.font = `${Math.max(10, w * 0.012)}px sans-serif`;
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(`Score ${Math.floor(hud.score)}  Best ${Math.floor(hud.best)}`, w * 0.44 + 12, 84);

      const lx = w * 0.68;
      const ly = 10;
      const lw = w * 0.3;
      const lh = h * 0.22;
      card(lx, ly, lw, lh);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = `700 ${Math.max(10, w * 0.013)}px sans-serif`;
      ctx.fillText("PACK", lx + 12, ly + 22);
      ctx.font = `${Math.max(10, w * 0.012)}px sans-serif`;
      for (let i = 0; i < Math.min(8, hud.pack.length); i++) {
        const row = hud.pack[i];
        ctx.fillStyle = row.you ? "#7dd3fc" : "#cbd5e1";
        ctx.fillText(`${row.pos}. ${row.name}`, lx + 12, ly + 40 + i * 16);
      }

      if (video && video.readyState >= 2) {
        const tw = w * 0.22;
        const th = (video.videoHeight / Math.max(1, video.videoWidth)) * tw;
        const vx = w - tw - 12;
        const vy = h - th - 14;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.translate(vx + tw, vy);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, tw, th);
        ctx.restore();
        drawBookSteeringInVideoRect(ctx, pLw, pRw, vx, vy, tw, th, w, h, steerVis);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx, vy, tw, th);
      }

      if (hud.finished) {
        ctx.fillStyle = "rgba(5, 6, 14, 0.82)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#f1f5f9";
        ctx.font = `800 ${Math.max(26, w * 0.05)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("HEAT OVER", w / 2, h * 0.42);
        ctx.font = `${Math.max(16, w * 0.028)}px sans-serif`;
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(`P${hud.rank}  ·  ${Math.floor(hud.score)} pts`, w / 2, h * 0.52);
        ctx.textAlign = "left";
      }
    },
    []
  );

  async function start() {
    cancelAnimationFrame(rafRef.current);
    setPhase("loading");
    setPoseError(null);
    setSummary(null);
    finishedRef.current = false;
    worldZRef.current = 0;
    laneRef.current = 0;
    steerSmoothedRef.current = 0;
    throttleRef.current = 0.4;
    nitroRef.current = 35;
    scoreRef.current = 0;
    pickupArmedRef.current = PICKUPS.map(() => true);
    pickupLapRef.current = -1;
    draftTimerRef.current = 0;
    aiProgRef.current = AI_NAMES.map((_, i) => -25 - i * 11);
    aiPaceRef.current = AI_NAMES.map((_, i) => 0.93 + ((i * 41) % 9) * 0.011);
    lastMsRef.current = performance.now();
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(BEST_KEY) : null;
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
      raceStartRef.current = performance.now();

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

          const now = performance.now();
          const dt = Math.min(0.05, Math.max(0.008, (now - lastMsRef.current) / 1000));
          lastMsRef.current = now;

          const elapsed = now - raceStartRef.current;
          const timeLeft = Math.max(0, (RACE_MS - elapsed) / 1000);
          if (timeLeft <= 0 && !finishedRef.current) {
            finishedRef.current = true;
            const pz = worldZRef.current;
            let rank = 1;
            for (let i = 0; i < AI_COUNT; i++) if (aiProgRef.current[i] > pz) rank++;
            setSummary({ rank, score: scoreRef.current });
          }

          const poses = await det.estimatePoses(video, { flipHorizontal: false });
          const kp = poses[0]?.keypoints;

          let steer = 0;
          const pLs = kp?.[LS];
          const pRs = kp?.[RS];
          const pLw = kp?.[LW];
          const pRw = kp?.[RW];
          const pNose = kp?.[NOSE];
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
              steer = clamp(theta / 0.52, -1, 1);
            }
          }

          let throttleTarget = 0.38;
          if (pNose && (pNose.score ?? 0) > 0.28) {
            throttleTarget = clamp((h * 0.36 - pNose.y) / (h * 0.38), 0, 1);
          } else if (pLw && pRw && (pLw.score ?? 0) > 0.18 && (pRw.score ?? 0) > 0.18) {
            throttleTarget = clamp((h * 0.42 - (pLw.y + pRw.y) / 2) / (h * 0.4), 0, 1);
          }
          throttleTarget = 0.12 + throttleTarget * 0.88;
          throttleRef.current += (throttleTarget - throttleRef.current) * 0.14;

          const sPrev = steerSmoothedRef.current;
          steerSmoothedRef.current = sPrev + (steer - sPrev) * 0.2;
          const steerVis = -steerSmoothedRef.current;
          if (!finishedRef.current) {
            laneRef.current += (steerVis * 0.9 - laneRef.current) * 0.09;
          }

          const cycle = 420;
          let drafting = false;
          const horizon = h * 0.3;
          const bend = steerVis * w * 0.2;
          const tPlayer = 0.94;
          const scaleP = 0.08 + tPlayer * 0.92;
          const cxP =
            w * 0.5 + bend * (1 - tPlayer) ** 1.45 * 0.85 + laneRef.current * w * 0.11 * scaleP;

          for (const tr of TRAFFIC) {
            const z = (worldZRef.current + tr.off) % cycle;
            const prog = z / cycle;
            if (prog < 0.72 || prog > 0.9) continue;
            const t = 0.1 + prog * 0.88;
            const scale = 0.08 + t * 0.92;
            const cxRow = w * 0.5 + bend * (1 - t) ** 1.45 * 0.85;
            const tx = cxRow + tr.lane * w * 0.11 * scale;
            const laneDiff = Math.abs(tr.lane - laneRef.current);
            if (laneDiff < 0.2 && prog >= 0.74 && prog <= 0.86 && Math.abs(tx - cxP) < w * 0.08 * scaleP) {
              drafting = true;
            }
          }

          if (drafting) draftTimerRef.current = Math.min(2.5, draftTimerRef.current + dt);
          else draftTimerRef.current = Math.max(0, draftTimerRef.current - dt * 2);

          if (!finishedRef.current) {
            if (draftTimerRef.current > 0.4) {
              nitroRef.current = clamp(nitroRef.current + dt * 22, 0, 100);
            }
            const burn = throttleRef.current > 0.82 && nitroRef.current > 2;
            if (burn) nitroRef.current = Math.max(0, nitroRef.current - dt * 28);
            const nitroBoost = burn ? 0.42 : 0;
            const spd =
              (1.1 + throttleRef.current * 1.85 + Math.abs(steerVis) * 0.25 + nitroBoost) *
              (1 + Math.min(0.25, scoreRef.current / 8000));
            worldZRef.current += spd * dt * 58;
            scoreRef.current += spd * dt * 22 + (drafting ? dt * 15 : 0);
            for (let i = 0; i < AI_COUNT; i++) {
              const wave = Math.sin(now * 0.0009 + i * 1.4) * 0.035;
              aiProgRef.current[i] += spd * aiPaceRef.current[i] * (1 + wave) * (0.95 + (i % 3) * 0.02);
            }
          }

          const lap = Math.floor(worldZRef.current / cycle);
          if (lap !== pickupLapRef.current) {
            pickupLapRef.current = lap;
            for (let i = 0; i < pickupArmedRef.current.length; i++) pickupArmedRef.current[i] = true;
          }

          for (let i = 0; i < PICKUPS.length; i++) {
            if (!pickupArmedRef.current[i] || finishedRef.current) continue;
            const z = (worldZRef.current + PICKUPS[i].off) % cycle;
            const prog = z / cycle;
            if (prog < 0.74 || prog > 0.9) continue;
            const t = 0.1 + prog * 0.88;
            const scale = 0.08 + t * 0.92;
            const half = w * 0.42 * scale;
            const cxRow = w * 0.5 + bend * (1 - t) ** 1.45 * 0.85;
            const ox = cxRow + PICKUPS[i].lane * w * 0.11 * scale;
            if (Math.abs(ox - cxP) < w * 0.05) {
              pickupArmedRef.current[i] = false;
              nitroRef.current = clamp(nitroRef.current + 28, 0, 100);
              scoreRef.current += 55;
            }
          }

          const mph =
            95 +
            throttleRef.current * 115 +
            (throttleRef.current > 0.82 && nitroRef.current > 3 ? nitroRef.current * 0.35 : 0) +
            Math.min(40, worldZRef.current * 0.002);

          const pz = worldZRef.current;
          let rank = 1;
          for (let i = 0; i < AI_COUNT; i++) if (aiProgRef.current[i] > pz) rank++;
          const pack = [
            ...AI_NAMES.map((name, i) => ({ name, d: aiProgRef.current[i]!, you: false as const })),
            { name: "You" as const, d: pz, you: true as const },
          ]
            .sort((a, b) => b.d - a.d)
            .map((row, idx) => ({ pos: idx + 1, name: row.name, you: row.you }));

          if (scoreRef.current > bestRef.current) {
            bestRef.current = scoreRef.current;
            try {
              localStorage.setItem(BEST_KEY, String(Math.floor(bestRef.current)));
            } catch {
              /* ignore */
            }
          }

          const hud: Hud = {
            mph,
            nitro: nitroRef.current,
            rank,
            score: scoreRef.current,
            best: bestRef.current,
            timeLeft,
            finished: finishedRef.current,
            pack,
            drafting: draftTimerRef.current > 0.35,
          };

          drawFrame(
            ctx,
            w,
            h,
            steerVis,
            worldZRef.current,
            laneRef.current,
            video,
            pLw,
            pRw,
            hud,
            pickupArmedRef.current
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
        <Link to="/games/motion-steering-race" className="muted">
          Grand Prix
        </Link>
      </p>
      <h1>Night heat (NFS-style arcade)</h1>
      <p className="muted">
        Need for Speed–inspired <strong>night street chase</strong> vibe: pseudo-3D road, neon traffic, rain, nitro, and a
        live pack board. <strong>Steer</strong> with your book (wrist line, mirrored PiP). <strong>Throttle</strong>: nose
        higher in frame = faster (same as Grand Prix). <strong>Draft</strong> behind tail lights (same lane, close) to
        charge <strong>nitro</strong>; keep throttle high to burn it for a burst. Green orbs refill nitro. Race{" "}
        {(RACE_MS / 1000).toFixed(0)}s.
      </p>
      {cameraLabel && phase !== "idle" && (
        <p className="muted small">
          Camera: <strong>{cameraLabel}</strong>
        </p>
      )}
      {phase === "idle" && (
        <button type="button" className="btn primary" onClick={() => void start()}>
          Start engine
        </button>
      )}
      {phase === "loading" && <p className="muted">Loading camera and MoveNet…</p>}
      {poseError && <p className="error">{poseError}</p>}
      {summary && (
        <div className="card" style={{ marginTop: "0.75rem" }}>
          <p style={{ marginTop: 0 }}>
            <strong>Last run:</strong> P{summary.rank} · {Math.floor(summary.score)} pts
          </p>
          <button type="button" className="btn primary" onClick={() => void start()}>
            Run again
          </button>
        </div>
      )}
      {phase !== "idle" && (
        <div className="motion-cricket-stage card steering-race-stage" style={{ marginTop: "0.75rem" }}>
          <video ref={videoRef} className="motion-cricket-feed" playsInline muted />
          <canvas ref={canvasRef} className="motion-cricket-canvas" />
        </div>
      )}
    </>
  );
}
