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

const RACE_DURATION_MS = 95_000;
const STEER_BEST_KEY = "motion-steering-race-best";

/** Lateral −1…1 at each depth; `off` staggers along the road cycle (wider spread). */
const ROAD_OBSTACLES: { lane: number; off: number }[] = [
  { lane: -0.92, off: 12 },
  { lane: 0.88, off: 38 },
  { lane: -0.35, off: 72 },
  { lane: 0.55, off: 105 },
  { lane: 0.95, off: 142 },
  { lane: -0.78, off: 178 },
  { lane: 0.12, off: 215 },
  { lane: -0.55, off: 248 },
  { lane: 0.72, off: 285 },
  { lane: -0.22, off: 318 },
  { lane: 0.38, off: 352 },
  { lane: -0.88, off: 388 },
  { lane: 0.65, off: 425 },
];

const ROAD_COINS: { lane: number; off: number }[] = [
  { lane: -0.72, off: 28 },
  { lane: 0.45, off: 58 },
  { lane: 0.92, off: 88 },
  { lane: -0.55, off: 122 },
  { lane: 0.18, off: 155 },
  { lane: -0.95, off: 188 },
  { lane: 0.78, off: 225 },
  { lane: -0.28, off: 262 },
  { lane: 0.62, off: 298 },
  { lane: -0.82, off: 335 },
  { lane: 0.32, off: 368 },
  { lane: -0.48, off: 402 },
];

/** One full loop of scroll phase; obstacle/coin `off` values live in [0, ROAD_CYCLE). */
const ROAD_CYCLE = 480;

/** Lateral travel: fraction of canvas width (−1…1 maps to road). Higher = more room to move. */
const LANE_TRACK = 0.2;

/** Base coin value; each extra ball adds this much on top (escalating pickups). */
const COIN_BASE = 72;
const COIN_PER_PRIOR = 38;

/** One-time cone strike per obstacle per lap — score cannot go below 0. */
const CONE_SCORE_PENALTY = 280;

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function formatRaceClock(sec: number): string {
  const t = Math.max(0, sec);
  if (t >= 60) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t - m * 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${t.toFixed(1)}s`;
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

type HudPack = {
  score: number;
  best: number;
  coins: number;
  coneHits: number;
  safe: number;
  speedPct: number;
  throttle: number;
  timeLeftSec: number;
  timeFmt: string;
  km: number;
  finished: boolean;
};

export default function MotionSteeringRaceHost() {
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
  const coneArmedRef = useRef(ROAD_OBSTACLES.map(() => true));
  const coinLapRef = useRef(-1);
  const coinTotalRef = useRef(0);
  const coneHitsRef = useRef(0);
  const throttleRef = useRef(0.42);
  const raceStartMsRef = useRef(0);
  const finishedRef = useRef(false);
  const lastFrameMsRef = useRef(0);

  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [poseError, setPoseError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);
  const [raceSummary, setRaceSummary] = useState<{ score: number; balls: number; cones: number } | null>(null);

  const drawFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      /** Display steering (already sign-corrected for mirror + car). */
      steerVisual: number,
      roadPhase: number,
      carX: number,
      video: HTMLVideoElement | null,
      pLw: { x: number; y: number; score?: number } | undefined,
      pRw: { x: number; y: number; score?: number } | undefined,
      hud: HudPack,
      coinsArmed: readonly boolean[]
    ) => {
      const sky = ctx.createLinearGradient(0, 0, w, h * 0.55);
      sky.addColorStop(0, "#3d1f6b");
      sky.addColorStop(0.35, "#c94b4b");
      sky.addColorStop(0.72, "#f0a050");
      sky.addColorStop(1, "#1a1028");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const moonX = w * 0.78;
      const moonY = h * 0.12;
      const moonG = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, h * 0.09);
      moonG.addColorStop(0, "rgba(255,248,220,0.95)");
      moonG.addColorStop(0.5, "rgba(255,220,180,0.35)");
      moonG.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = moonG;
      ctx.beginPath();
      ctx.arc(moonX, moonY, h * 0.07, 0, Math.PI * 2);
      ctx.fill();

      const scrollBg = roadPhase * 0.35;
      for (let layer = 0; layer < 2; layer++) {
        const par = (layer + 1) * 0.22;
        const baseY = h * (0.26 + layer * 0.06);
        ctx.fillStyle =
          layer === 0 ? "rgba(35, 22, 55, 0.88)" : "rgba(20, 35, 48, 0.75)";
        for (let m = 0; m < 9; m++) {
          const mx = (((m * w) / 5.5 + scrollBg * par) % (w * 1.4)) - w * 0.15;
          ctx.beginPath();
          ctx.moveTo(mx, baseY + h * 0.08);
          ctx.lineTo(mx + w * 0.12, baseY + h * 0.08);
          ctx.lineTo(mx + w * 0.06, baseY - h * (0.06 + layer * 0.02));
          ctx.closePath();
          ctx.fill();
        }
      }

      const vanY = h * 0.2;
      const roadTop = h * 0.36;
      const roadBot = h * 0.92;
      const cx = w * 0.5;

      ctx.fillStyle = "rgba(18, 42, 28, 0.92)";
      ctx.fillRect(0, roadTop - h * 0.02, w * 0.12, roadBot - roadTop + h * 0.04);
      ctx.fillRect(w * 0.88, roadTop - h * 0.02, w * 0.14, roadBot - roadTop + h * 0.04);

      const roadGrad = ctx.createLinearGradient(0, roadTop, 0, roadBot);
      roadGrad.addColorStop(0, "#2d2d38");
      roadGrad.addColorStop(0.5, "#1e1e28");
      roadGrad.addColorStop(1, "#12121a");
      ctx.fillStyle = roadGrad;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.07, vanY);
      ctx.lineTo(cx - w * 0.44, roadBot);
      ctx.lineTo(cx + w * 0.44, roadBot);
      ctx.lineTo(cx + w * 0.07, vanY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.395, roadBot);
      ctx.lineTo(cx - w * 0.065, vanY + h * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.395, roadBot);
      ctx.lineTo(cx + w * 0.065, vanY + h * 0.02);
      ctx.stroke();

      const stripeH = h * 0.042;
      const scroll = roadPhase % (stripeH * 2);
      ctx.strokeStyle = "rgba(255, 230, 160, 0.65)";
      ctx.lineWidth = Math.max(2, w * 0.0035);
      ctx.shadowColor = "rgba(255, 200, 100, 0.4)";
      ctx.shadowBlur = 8;
      for (let y = roadTop + scroll; y < roadBot; y += stripeH * 2) {
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, Math.min(y + stripeH, roadBot));
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      const laneMax = w * LANE_TRACK;
      for (const ob of ROAD_OBSTACLES) {
        const z = (roadPhase + ob.off) % ROAD_CYCLE;
        const prog = z / ROAD_CYCLE;
        if (prog < 0.04 || prog > 0.97) continue;
        const oy = roadTop + (roadBot - roadTop) * (0.1 + prog * 0.82);
        const laneSpread = laneMax * (0.38 + prog * 0.62);
        const ox = cx + ob.lane * laneSpread;
        const coneH = h * 0.055 * (0.45 + prog * 0.55);
        const coneW = coneH * 0.55;
        ctx.fillStyle = prog > 0.75 ? "rgba(220, 50, 40, 0.95)" : "rgba(255, 140, 60, 0.95)";
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox - coneW, oy + coneH);
        ctx.lineTo(ox + coneW, oy + coneH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(60, 20, 0, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      for (let ci = 0; ci < ROAD_COINS.length; ci++) {
        const c = ROAD_COINS[ci];
        const z = (roadPhase + c.off) % ROAD_CYCLE;
        const prog = z / ROAD_CYCLE;
        if (prog < 0.05 || prog > 0.96) continue;
        const oy = roadTop + (roadBot - roadTop) * (0.1 + prog * 0.82);
        const laneSpread = laneMax * (0.38 + prog * 0.62);
        const ox = cx + c.lane * laneSpread;
        const armed = coinsArmed[ci] ?? true;
        const r = h * 0.022 * (0.5 + prog * 0.5);
        const cg = ctx.createRadialGradient(ox - r * 0.3, oy - r * 0.3, 0, ox, oy, r * 1.2);
        cg.addColorStop(0, armed ? "rgba(255, 255, 200, 1)" : "rgba(90, 80, 40, 0.5)");
        cg.addColorStop(1, armed ? "rgba(250, 160, 20, 0.9)" : "rgba(50, 45, 20, 0.4)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
        if (armed) {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      const carW = w * 0.13;
      const carH = h * 0.082;
      const carY = roadBot - carH * 1.38;
      const cxCar = cx + carX * laneMax;

      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath();
      ctx.ellipse(cxCar, carY + carH + 4, carW * 0.52, h * 0.011, 0, 0, Math.PI * 2);
      ctx.fill();

      if (hud.throttle > 0.55) {
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.08 + (hud.throttle - 0.55) * 0.35})`;
        ctx.lineWidth = 4;
        for (let s = 0; s < 5; s++) {
          const py = carY + carH + 4 + s * 6;
          ctx.beginPath();
          ctx.moveTo(cxCar - carW * 0.3 - s * 5, py);
          ctx.lineTo(cxCar - carW * 0.9 - s * 12, py + 20 + s * 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cxCar + carW * 0.3 + s * 5, py);
          ctx.lineTo(cxCar + carW * 0.9 + s * 12, py + 20 + s * 8);
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.translate(cxCar, carY + carH * 0.55);
      ctx.rotate(steerVisual * 0.12);
      ctx.translate(-cxCar, -(carY + carH * 0.55));

      const bodyGrad = ctx.createLinearGradient(cxCar - carW, carY, cxCar + carW, carY + carH);
      bodyGrad.addColorStop(0, "#b71c1c");
      bodyGrad.addColorStop(0.45, "#e53935");
      bodyGrad.addColorStop(1, "#8b0000");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      roundRectPath(ctx, cxCar - carW * 0.5, carY, carW, carH * 0.58, 8);
      ctx.fill();

      ctx.fillStyle = "rgba(180, 230, 255, 0.35)";
      ctx.beginPath();
      roundRectPath(ctx, cxCar - carW * 0.38, carY + carH * 0.12, carW * 0.76, carH * 0.28, 5);
      ctx.fill();

      ctx.fillStyle = "#0d47a1";
      ctx.beginPath();
      roundRectPath(ctx, cxCar - carW * 0.36, carY + carH * 0.42, carW * 0.72, carH * 0.42, 6);
      ctx.fill();

      ctx.fillStyle = "#111";
      ctx.fillRect(cxCar - carW * 0.44, carY + carH * 0.78, carW * 0.2, carH * 0.2);
      ctx.fillRect(cxCar + carW * 0.24, carY + carH * 0.78, carW * 0.2, carH * 0.2);
      ctx.restore();

      const beam = ctx.createRadialGradient(cxCar, carY, 0, cxCar, carY - h * 0.2, h * 0.32);
      beam.addColorStop(0, "rgba(255, 248, 200, 0.2)");
      beam.addColorStop(1, "rgba(255, 248, 200, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(cxCar - carW * 0.95, carY + carH);
      ctx.lineTo(cxCar + carW * 0.95, carY + carH);
      ctx.lineTo(cxCar, carY - h * 0.26);
      ctx.closePath();
      ctx.fill();

      const drawHudPanel = (x: number, y: number, rw: number, rh: number, rad: number, accent: string) => {
        const g = ctx.createLinearGradient(x, y, x, y + rh);
        g.addColorStop(0, "rgba(18, 24, 40, 0.94)");
        g.addColorStop(1, "rgba(8, 12, 22, 0.9)");
        ctx.fillStyle = g;
        ctx.beginPath();
        roundRectPath(ctx, x, y, rw, rh, rad);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        roundRectPath(ctx, x, y, rw, rh, rad);
        ctx.stroke();
      };

      const barH = Math.max(56, h * 0.092);
      const barPad = 14;
      const barW = w - barPad * 2;
      drawHudPanel(barPad, 10, barW, barH, 14, "rgba(56, 189, 248, 0.45)");

      const colW = barW / 4;
      const cxT = barPad + 18;
      const y1 = 28;
      const y2 = 52;
      const y3 = 74;
      ctx.textAlign = "left";
      ctx.font = `600 ${Math.max(9, w * 0.012)}px sans-serif`;
      ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
      ctx.fillText("BALLS", cxT, y1);
      ctx.font = `800 ${Math.max(22, w * 0.034)}px sans-serif`;
      ctx.fillStyle = "#fde047";
      ctx.fillText(`${hud.coins}`, cxT, y2);
      ctx.font = `${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = hud.coneHits > 0 ? "rgba(251, 146, 60, 0.9)" : "rgba(148, 163, 184, 0.8)";
      ctx.fillText(`Cones hit ${hud.coneHits}`, cxT, y3);

      const c2 = barPad + colW;
      ctx.font = `600 ${Math.max(9, w * 0.012)}px sans-serif`;
      ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
      ctx.fillText("TIME LEFT", c2, y1);
      ctx.font = `700 ${Math.max(18, w * 0.026)}px monospace`;
      ctx.fillStyle = hud.timeLeftSec < 15 ? "#fb7185" : "#fef9c3";
      ctx.fillText(hud.timeFmt, c2, y2);
      ctx.font = `${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
      ctx.fillText(`${hud.km.toFixed(2)} km`, c2, y3);

      const c3 = barPad + colW * 2;
      ctx.font = `600 ${Math.max(9, w * 0.012)}px sans-serif`;
      ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
      ctx.fillText("SCORE", c3, y1);
      ctx.font = `800 ${Math.max(22, w * 0.032)}px monospace`;
      ctx.fillStyle = "#fde047";
      ctx.fillText(`${Math.round(hud.score)}`, c3, y2);
      ctx.font = `${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = "rgba(203, 213, 225, 0.88)";
      ctx.fillText(`Best ${Math.round(hud.best)}  ·  each ball worth more`, c3, y3);

      const c4 = barPad + colW * 3;
      ctx.font = `600 ${Math.max(9, w * 0.012)}px sans-serif`;
      ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
      ctx.fillText("BOOST", c4, y1);
      ctx.font = `700 ${Math.max(17, w * 0.022)}px sans-serif`;
      ctx.fillStyle = "#6ee7b7";
      ctx.fillText(`+${hud.speedPct.toFixed(0)}%`, c4, y2);
      ctx.font = `${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = "rgba(203, 213, 225, 0.88)";
      ctx.fillText(`Clean ×${Math.min(999, Math.floor(hud.safe / 30))}`, c4, y3);

      const thBarW = barW - 36;
      const thBarX = barPad + 18;
      const thBarY = 10 + barH + 6;
      const thBarH = 8;
      drawHudPanel(thBarX, thBarY, thBarW, thBarH + 4, 6, "rgba(167, 139, 250, 0.35)");
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      roundRectPath(ctx, thBarX + 3, thBarY + 3, thBarW - 6, thBarH, 4);
      ctx.fill();
      const twFill = (thBarW - 6) * hud.throttle;
      const thGrad = ctx.createLinearGradient(thBarX, thBarY, thBarX + thBarW, thBarY);
      thGrad.addColorStop(0, "#22d3ee");
      thGrad.addColorStop(1, "#a78bfa");
      ctx.fillStyle = thGrad;
      ctx.beginPath();
      roundRectPath(ctx, thBarX + 3, thBarY + 3, twFill, thBarH, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
      ctx.font = `600 ${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(`THROTTLE ${Math.round(hud.throttle * 100)}%`, thBarX + thBarW, thBarY + thBarH + 14);
      ctx.textAlign = "left";

      const wx = w * 0.88;
      const wy = h * 0.78;
      const wheelR = Math.min(w, h) * 0.078;
      ctx.strokeStyle = "rgba(15, 23, 42, 0.95)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(wx, wy, wheelR + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(wx, wy, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      const ang = steerVisual * 0.95;
      ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.sin(ang) * wheelR * 0.88, wy - Math.cos(ang) * wheelR * 0.88);
      ctx.stroke();
      ctx.fillStyle = "rgba(15,23,42,0.55)";
      ctx.font = `600 ${Math.max(8, w * 0.01)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("BOOK", wx, wy + wheelR + 14);
      ctx.textAlign = "left";

      if (video && video.readyState >= 2) {
        const tw = w * 0.2;
        const th = (video.videoHeight / Math.max(1, video.videoWidth)) * tw;
        const vx = w - tw - 12;
        const vy = h - th - 14;
        ctx.save();
        ctx.globalAlpha = 0.62;
        ctx.drawImage(video, vx, vy, tw, th);
        ctx.restore();
        drawBookSteeringInVideoRect(ctx, pLw, pRw, vx, vy, tw, th, w, h, steerVisual, false);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, tw, th);
      }

      const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.25, w * 0.5, h * 0.5, w * 0.72);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.22)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      if (hud.finished) {
        ctx.fillStyle = "rgba(5, 8, 16, 0.85)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,250,240,0.98)";
        ctx.font = `800 ${Math.max(26, Math.floor(w * 0.05))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("RACE COMPLETE", w / 2, h * 0.36);
        ctx.font = `${Math.max(17, Math.floor(w * 0.028))}px sans-serif`;
        ctx.fillStyle = "#7dd3fc";
        ctx.fillText(
          `${hud.coins} balls · ${hud.coneHits} cone${hud.coneHits === 1 ? "" : "s"}`,
          w / 2,
          h * 0.46
        );
        ctx.fillStyle = "rgba(253, 230, 138, 0.95)";
        ctx.fillText(`${Math.round(hud.score)} pts · best saved locally`, w / 2, h * 0.54);
        ctx.fillStyle = "rgba(180,195,210,0.9)";
        ctx.font = `${Math.max(12, Math.floor(w * 0.016))}px sans-serif`;
        ctx.fillText("Race again — button under the canvas", w / 2, h * 0.64);
        ctx.textAlign = "left";
      }
    },
    []
  );

  async function start() {
    cancelAnimationFrame(rafRef.current);
    setPhase("loading");
    setPoseError(null);
    setRaceSummary(null);
    finishedRef.current = false;
    roadPhaseRef.current = 0;
    steerSmoothedRef.current = 0;
    carLaneRef.current = 0;
    scoreRef.current = 0;
    safeStreakRef.current = 0;
    coinArmedRef.current = ROAD_COINS.map(() => true);
    coneArmedRef.current = ROAD_OBSTACLES.map(() => true);
    coinLapRef.current = -1;
    coinTotalRef.current = 0;
    coneHitsRef.current = 0;
    throttleRef.current = 0.42;
    lastFrameMsRef.current = performance.now();
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

      raceStartMsRef.current = performance.now();

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
          const dt = Math.min(0.05, Math.max(0.008, (now - lastFrameMsRef.current) / 1000));
          lastFrameMsRef.current = now;

          const timeInRace = now - raceStartMsRef.current;
          const timeLeftSec = (RACE_DURATION_MS - timeInRace) / 1000;
          if (timeLeftSec <= 0 && !finishedRef.current) {
            finishedRef.current = true;
            const finishBonus = Math.max(
              0,
              40 + coinTotalRef.current * 42 - coneHitsRef.current * 65
            );
            scoreRef.current += finishBonus;
            setRaceSummary({
              score: scoreRef.current,
              balls: coinTotalRef.current,
              cones: coneHitsRef.current,
            });
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
              const maxRad = 0.52;
              steer = clamp(theta / maxRad, -1, 1);
            }
          }

          let throttleTarget = 0.38;
          if (pNose && (pNose.score ?? 0) > 0.28) {
            throttleTarget = clamp((h * 0.36 - pNose.y) / (h * 0.38), 0, 1);
          } else if (pLw && pRw && (pLw.score ?? 0) > 0.18 && (pRw.score ?? 0) > 0.18) {
            const midY = (pLw.y + pRw.y) / 2;
            throttleTarget = clamp((h * 0.42 - midY) / (h * 0.4), 0, 1);
          }
          throttleTarget = 0.12 + throttleTarget * 0.88;
          const tPrev = throttleRef.current;
          throttleRef.current = tPrev + (throttleTarget - tPrev) * 0.14;

          const sPrev = steerSmoothedRef.current;
          steerSmoothedRef.current = sPrev + (steer - sPrev) * 0.24;
          const smRaw = steerSmoothedRef.current;
          /** PiP is unmirrored — steering matches what you see in the preview. */
          const smVisual = smRaw;
          if (!finishedRef.current) {
            carLaneRef.current += (smVisual * 0.93 - carLaneRef.current) * 0.12;
            carLaneRef.current = clamp(carLaneRef.current, -1, 1);
          }

          const cx = w * 0.5;
          const laneMax = w * LANE_TRACK;
          const carXpx = cx + carLaneRef.current * laneMax;

          let hitCone = false;
          for (let oi = 0; oi < ROAD_OBSTACLES.length; oi++) {
            const ob = ROAD_OBSTACLES[oi]!;
            const z = (roadPhaseRef.current + ob.off) % ROAD_CYCLE;
            const prog = z / ROAD_CYCLE;
            if (prog < 0.72 || prog > 0.9) continue;
            const laneSpread = laneMax * (0.38 + prog * 0.62);
            const obstacleX = cx + ob.lane * laneSpread;
            if (Math.abs(obstacleX - carXpx) < w * 0.054) {
              hitCone = true;
              if (coneArmedRef.current[oi] && !finishedRef.current) {
                coneArmedRef.current[oi] = false;
                coneHitsRef.current += 1;
                scoreRef.current = Math.max(0, scoreRef.current - CONE_SCORE_PENALTY);
                safeStreakRef.current = 0;
              }
            }
          }

          if (hitCone) {
            safeStreakRef.current = 0;
          } else {
            safeStreakRef.current = Math.min(9999, safeStreakRef.current + 1);
          }

          const lap = Math.floor(roadPhaseRef.current / ROAD_CYCLE);
          if (lap !== coinLapRef.current) {
            coinLapRef.current = lap;
            for (let i = 0; i < coinArmedRef.current.length; i++) coinArmedRef.current[i] = true;
            for (let i = 0; i < coneArmedRef.current.length; i++) coneArmedRef.current[i] = true;
          }

          for (let i = 0; i < ROAD_COINS.length; i++) {
            if (!coinArmedRef.current[i] || finishedRef.current) continue;
            const c = ROAD_COINS[i]!;
            const z = (roadPhaseRef.current + c.off) % ROAD_CYCLE;
            const prog = z / ROAD_CYCLE;
            if (prog < 0.73 || prog > 0.9) continue;
            const laneSpread = laneMax * (0.38 + prog * 0.62);
            const coinX = cx + c.lane * laneSpread;
            if (Math.abs(coinX - carXpx) < w * 0.05) {
              coinArmedRef.current[i] = false;
              const prior = coinTotalRef.current;
              coinTotalRef.current += 1;
              scoreRef.current += COIN_BASE + prior * COIN_PER_PRIOR;
            }
          }

          const coneSlow = Math.min(0.14, coneHitsRef.current * 0.022);
          const speedMul =
            1 +
            Math.min(0.28, scoreRef.current / 7200) +
            Math.min(0.12, safeStreakRef.current / 4800) +
            Math.max(0, throttleRef.current - 0.28) * 0.18 -
            coneSlow;
          const paceDisplay = Math.max(0, (speedMul - 1) * 100);

          if (!finishedRef.current) {
            const scroll =
              (1.08 + throttleRef.current * 1.62 + Math.abs(smVisual) * 0.38) * speedMul * dt * 62;
            roadPhaseRef.current += scroll;
            const distPts =
              scroll * 0.032 * (0.85 + throttleRef.current * 0.3) * (hitCone ? 0.35 : 1);
            const cleanMult = hitCone ? 1 : 1 + Math.min(0.35, safeStreakRef.current / 2400);
            scoreRef.current += distPts * cleanMult;
          }

          if (scoreRef.current > bestRef.current) {
            bestRef.current = scoreRef.current;
            try {
              localStorage.setItem(STEER_BEST_KEY, String(Math.floor(bestRef.current)));
            } catch {
              /* ignore */
            }
          }

          const hud: HudPack = {
            score: scoreRef.current,
            best: bestRef.current,
            coins: coinTotalRef.current,
            coneHits: coneHitsRef.current,
            safe: safeStreakRef.current,
            speedPct: paceDisplay,
            throttle: throttleRef.current,
            timeLeftSec: finishedRef.current ? 0 : timeLeftSec,
            timeFmt: formatRaceClock(timeLeftSec),
            km: roadPhaseRef.current * 0.00013,
            finished: finishedRef.current,
          };

          drawFrame(
            ctx,
            w,
            h,
            smVisual,
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
        <Link to="/games/motion-steering" className="muted">
          Simple steering demo
        </Link>
      </p>
      <h1>Motion Grand Prix</h1>
      <p className="muted">
        Full <strong>{RACE_DURATION_MS / 1000}s</strong> sprint: steer with your <strong>book</strong> (wrist line) — lateral
        control matches the <strong>camera</strong> preview (same left/right as the PiP). <strong>Nose higher</strong> in frame = more throttle (horizontal bar under the HUD).
        <strong> Score</strong> favors <strong>balls</strong> (each pickup is worth more than the last) and light distance; <strong>each cone</strong> costs points and slows you slightly. Finish bonus rewards balls and penalizes cone hits. Best score is saved locally.
      </p>
      {cameraLabel && phase !== "idle" && (
        <p className="muted small">
          Camera: <strong>{cameraLabel}</strong>
        </p>
      )}
      {phase === "idle" && (
        <button type="button" className="btn primary" onClick={() => void start()}>
          Start race
        </button>
      )}
      {phase === "loading" && <p className="muted">Loading camera and MoveNet…</p>}
      {poseError && <p className="error">{poseError}</p>}
      {raceSummary && (
        <div className="card" style={{ marginTop: "0.75rem", borderColor: "var(--accent)" }}>
          <p style={{ marginTop: 0 }}>
            <strong>Last result:</strong> {raceSummary.balls} balls · {raceSummary.cones} cones · score{" "}
            {Math.floor(raceSummary.score)}
          </p>
          <button type="button" className="btn primary" onClick={() => void start()}>
            Race again
          </button>
        </div>
      )}
      {phase !== "idle" && (
        <div className="motion-cricket-stage card steering-race-stage" style={{ marginTop: "0.75rem" }}>
          <video ref={videoRef} className="motion-cricket-feed" playsInline muted />
          <canvas ref={canvasRef} className="motion-cricket-canvas" />
        </div>
      )}
      {phase === "running" && (
        <ul className="muted small" style={{ marginTop: "0.75rem", paddingLeft: "1.1rem" }}>
          <li>
            <strong>Steer:</strong> book tilt (wheel bottom-right); lateral range is wider for easier flow between cones.
          </li>
          <li>
            <strong>Throttle:</strong> nose higher in frame = more gas (bar under the top HUD).
          </li>
          <li>
            <strong>Pickups:</strong> yellow balls score more the more you have already collected; orange cones subtract a chunk once per pass and dull your boost.
          </li>
        </ul>
      )}
    </>
  );
}
