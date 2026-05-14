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

/** Hazards use this phase; it advances faster than `roadPhase` when throttle is high. */
const HAZARD_THROTTLE_IDLE = 0.92;
const HAZARD_THROTTLE_GAIN = 1.58;
/** Extra multiplier on hazard scroll only (road stripes unchanged). */
const HAZARD_GLOBAL_MULT = 1.38;
/** Road stripe / world scroll — higher = faster feel even when coasting. */
const ROAD_SCROLL_BASE = 0.98;
const ROAD_SCROLL_THROTTLE = 0.82;
const ROAD_SCROLL_STEER = 0.32;
const ROAD_SCROLL_DT_MULT = 58;

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
  /** Coins/cones approach rate vs road (1 ≈ matched at mid-throttle). */
  hazardMul: number;
  pickupGlow: number;
  coneFlash: number;
  timeLeftSec: number;
  timeFmt: string;
  km: number;
  finished: boolean;
  /** Seconds since race start (brief on-canvas tips). */
  raceElapsedSec: number;
};

export default function MotionSteeringRaceHost() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof poseDetection.createDetector>> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  const roadPhaseRef = useRef(0);
  const trafficPhaseRef = useRef(0);
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
  const pickupGlowRef = useRef(0);
  const coneFlashRef = useRef(0);
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
      trafficPhase: number,
      carX: number,
      video: HTMLVideoElement | null,
      pLw: { x: number; y: number; score?: number } | undefined,
      pRw: { x: number; y: number; score?: number } | undefined,
      hud: HudPack,
      coinsArmed: readonly boolean[]
    ) => {
      const skyTop = ctx.createLinearGradient(0, 0, w, h * 0.38);
      skyTop.addColorStop(0, "#04060d");
      skyTop.addColorStop(0.42, "#0c1530");
      skyTop.addColorStop(0.78, "#152240");
      skyTop.addColorStop(1, "#1c1530");
      ctx.fillStyle = skyTop;
      ctx.fillRect(0, 0, w, h * 0.4);

      const sunset = ctx.createLinearGradient(0, h * 0.24, w, h * 0.44);
      sunset.addColorStop(0, "rgba(255, 60, 30, 0)");
      sunset.addColorStop(0.48, "rgba(255, 100, 45, 0.26)");
      sunset.addColorStop(1, "rgba(200, 60, 120, 0.1)");
      ctx.fillStyle = sunset;
      ctx.fillRect(0, h * 0.22, w, h * 0.22);

      const haze = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.52);
      haze.addColorStop(0, "rgba(32, 26, 42, 0.15)");
      haze.addColorStop(1, "rgba(6, 8, 14, 0.94)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, h * 0.3, w, h * 0.24);

      for (let c = 0; c < 8; c++) {
        const cxC = ((c * 1.31 + 0.12) % 1) * w * 1.12 - w * 0.04;
        const cyC = h * (0.045 + (c % 3) * 0.038);
        const rw = w * (0.07 + (c % 2) * 0.042);
        const rh = h * 0.019;
        ctx.fillStyle = `rgba(210, 225, 255, ${0.032 + (c % 2) * 0.026})`;
        ctx.beginPath();
        ctx.ellipse(cxC, cyC, rw, rh, (c * 0.33) % 1, 0, Math.PI * 2);
        ctx.fill();
      }

      const sunX = w * 0.72;
      const sunY = h * 0.095;
      const sunHalo = ctx.createRadialGradient(sunX, sunY, h * 0.02, sunX, sunY, h * 0.24);
      sunHalo.addColorStop(0, "rgba(255, 225, 190, 0.42)");
      sunHalo.addColorStop(0.4, "rgba(255, 150, 80, 0.16)");
      sunHalo.addColorStop(1, "rgba(255, 90, 50, 0)");
      ctx.fillStyle = sunHalo;
      ctx.beginPath();
      ctx.arc(sunX, sunY, h * 0.22, 0, Math.PI * 2);
      ctx.fill();
      const sunCore = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.052);
      sunCore.addColorStop(0, "rgba(255, 252, 240, 0.98)");
      sunCore.addColorStop(0.55, "rgba(255, 200, 120, 0.35)");
      sunCore.addColorStop(1, "rgba(255, 140, 70, 0)");
      ctx.fillStyle = sunCore;
      ctx.beginPath();
      ctx.arc(sunX, sunY, h * 0.05, 0, Math.PI * 2);
      ctx.fill();

      const scrollBg = roadPhase * 0.28;
      for (let layer = 0; layer < 3; layer++) {
        const par = (layer + 1) * 0.16;
        const baseY = h * (0.23 + layer * 0.045);
        const a = 0.3 - layer * 0.065;
        ctx.fillStyle =
          layer === 0
            ? `rgba(26, 36, 58, ${a + 0.4})`
            : layer === 1
              ? `rgba(16, 44, 58, ${a + 0.28})`
              : `rgba(12, 32, 44, ${a + 0.22})`;
        for (let m = 0; m < 11; m++) {
          const mx = (((m * w) / 5.12 + scrollBg * par) % (w * 1.48)) - w * 0.2;
          ctx.beginPath();
          ctx.moveTo(mx, baseY + h * 0.09);
          ctx.lineTo(mx + w * 0.11, baseY + h * 0.09);
          ctx.lineTo(mx + w * 0.055, baseY - h * (0.05 + layer * 0.016));
          ctx.closePath();
          ctx.fill();
        }
      }

      const vanY = h * 0.2;
      const roadTop = h * 0.36;
      const roadBot = h * 0.92;
      const cx = w * 0.5;

      const vergeL = ctx.createLinearGradient(0, roadTop, w * 0.14, roadBot);
      vergeL.addColorStop(0, "rgba(12, 52, 28, 0.97)");
      vergeL.addColorStop(1, "rgba(5, 20, 10, 0.99)");
      ctx.fillStyle = vergeL;
      ctx.fillRect(0, roadTop - h * 0.02, w * 0.13, roadBot - roadTop + h * 0.04);
      const vergeR = ctx.createLinearGradient(w, roadTop, w * 0.86, roadBot);
      vergeR.addColorStop(0, "rgba(12, 52, 28, 0.97)");
      vergeR.addColorStop(1, "rgba(5, 20, 10, 0.99)");
      ctx.fillStyle = vergeR;
      ctx.fillRect(w * 0.87, roadTop - h * 0.02, w * 0.13, roadBot - roadTop + h * 0.04);

      const roadGrad = ctx.createLinearGradient(cx - w * 0.48, roadTop, cx + w * 0.48, roadBot);
      roadGrad.addColorStop(0, "#161922");
      roadGrad.addColorStop(0.12, "#242834");
      roadGrad.addColorStop(0.5, "#0e1016");
      roadGrad.addColorStop(0.88, "#222630");
      roadGrad.addColorStop(1, "#080a0e");
      ctx.fillStyle = roadGrad;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.07, vanY);
      ctx.lineTo(cx - w * 0.44, roadBot);
      ctx.lineTo(cx + w * 0.44, roadBot);
      ctx.lineTo(cx + w * 0.07, vanY);
      ctx.closePath();
      ctx.fill();

      const sheen = ctx.createLinearGradient(cx, roadTop, cx, roadBot);
      sheen.addColorStop(0, "rgba(255,255,255,0.075)");
      sheen.addColorStop(0.38, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.066, vanY + h * 0.01);
      ctx.lineTo(cx - w * 0.42, roadBot);
      ctx.lineTo(cx + w * 0.42, roadBot);
      ctx.lineTo(cx + w * 0.066, vanY + h * 0.01);
      ctx.closePath();
      ctx.fill();

      const texScroll = (roadPhase * 1.8) % 14;
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = "#8b93a8";
      ctx.lineWidth = 1;
      for (let ty = roadTop + texScroll; ty < roadBot; ty += 14) {
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.4, ty);
        ctx.lineTo(cx + w * 0.4, ty);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "rgba(255,255,255,0.58)";
      ctx.lineWidth = Math.max(3, w * 0.004);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.395, roadBot);
      ctx.lineTo(cx - w * 0.065, vanY + h * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.395, roadBot);
      ctx.lineTo(cx + w * 0.065, vanY + h * 0.02);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 205, 70, 0.38)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.402, roadBot);
      ctx.lineTo(cx - w * 0.068, vanY + h * 0.02);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.402, roadBot);
      ctx.lineTo(cx + w * 0.068, vanY + h * 0.02);
      ctx.stroke();

      const stripeH = h * 0.038;
      const scroll = roadPhase % (stripeH * 2);
      ctx.strokeStyle = "rgba(255, 236, 175, 0.92)";
      ctx.lineWidth = Math.max(2.5, w * 0.0038);
      ctx.shadowColor = "rgba(255, 195, 80, 0.48)";
      ctx.shadowBlur = 11;
      for (let y = roadTop + scroll; y < roadBot; y += stripeH * 2) {
        const seg = Math.min(stripeH * 0.92, roadBot - y);
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, y + seg);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      const reflScroll = roadPhase * 0.9;
      for (let ri = 0; ri < 18; ri++) {
        const t = ri / 17;
        const prog = 0.12 + t * 0.86;
        const y = roadTop + (roadBot - roadTop) * prog;
        for (const side of [-1, 1] as const) {
          const idx = ri * 2 + (side === 1 ? 1 : 0);
          const phase = (idx + reflScroll * 0.08) % 2;
          const xNear = cx + side * (w * 0.069 + prog * w * 0.326);
          ctx.fillStyle = phase < 1 ? "rgba(210, 42, 52, 0.9)" : "rgba(248, 248, 252, 0.92)";
          ctx.fillRect(xNear - 2, y - 3, 4, 6);
        }
      }

      const laneMax = w * LANE_TRACK;
      for (const ob of ROAD_OBSTACLES) {
        const z = (trafficPhase + ob.off) % ROAD_CYCLE;
        const prog = z / ROAD_CYCLE;
        if (prog < 0.04 || prog > 0.97) continue;
        const oy = roadTop + (roadBot - roadTop) * (0.1 + prog * 0.82);
        const laneSpread = laneMax * (0.38 + prog * 0.62);
        const ox = cx + ob.lane * laneSpread;
        const coneH = h * 0.055 * (0.45 + prog * 0.55);
        const coneW = coneH * 0.55;
        ctx.fillStyle = prog > 0.75 ? "rgba(230, 55, 45, 0.98)" : "rgba(255, 145, 55, 0.96)";
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox - coneW, oy + coneH);
        ctx.lineTo(ox + coneW, oy + coneH);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox - coneW * 0.35, oy + coneH * 0.55);
        ctx.stroke();
        ctx.strokeStyle = "rgba(40, 15, 0, 0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      for (let ci = 0; ci < ROAD_COINS.length; ci++) {
        const c = ROAD_COINS[ci];
        const z = (trafficPhase + c.off) % ROAD_CYCLE;
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
          ctx.beginPath();
          ctx.arc(ox, oy, r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = "rgba(255, 200, 80, 0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ox, oy, r * 1.15, 0, Math.PI * 2);
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

      if (hud.throttle > 0.55 || hud.hazardMul > 1.2) {
        const sp = Math.max(hud.throttle, clamp((hud.hazardMul - 0.5) / 1.4, 0, 1));
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.08 + Math.max(0, sp - 0.55) * 0.42})`;
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

      if (hud.pickupGlow > 0.04) {
        const g = hud.pickupGlow;
        const rg = ctx.createRadialGradient(w * 0.5, h * 0.88, 0, w * 0.5, h * 0.88, w * 0.55);
        rg.addColorStop(0, `rgba(255, 230, 140, ${g * 0.22})`);
        rg.addColorStop(0.45, `rgba(255, 200, 80, ${g * 0.08})`);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }
      if (hud.coneFlash > 0.04) {
        const f = hud.coneFlash;
        const rg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.65);
        rg.addColorStop(0, `rgba(255, 80, 40, ${f * 0.14})`);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }

      const drawHudPanel = (x: number, y: number, rw: number, rh: number, rad: number, accent: string) => {
        const g = ctx.createLinearGradient(x, y, x + rw * 0.3, y + rh);
        g.addColorStop(0, "rgba(22, 28, 42, 0.92)");
        g.addColorStop(0.5, "rgba(12, 16, 28, 0.88)");
        g.addColorStop(1, "rgba(6, 8, 16, 0.9)");
        ctx.fillStyle = g;
        ctx.beginPath();
        roundRectPath(ctx, x, y, rw, rh, rad);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRectPath(ctx, x + 1, y + 1, rw - 2, rh - 2, rad - 1);
        ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.35;
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
      ctx.font = `600 ${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = "rgba(186, 198, 218, 0.95)";
      ctx.fillText("PICKUPS", cxT, y1);
      ctx.font = `800 ${Math.max(22, w * 0.034)}px sans-serif`;
      ctx.fillStyle = "#fde047";
      ctx.fillText(`${hud.coins}`, cxT, y2);
      ctx.font = `${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = hud.coneHits > 0 ? "rgba(251, 146, 60, 0.92)" : "rgba(148, 163, 184, 0.82)";
      ctx.fillText(`Cones hit ${hud.coneHits}`, cxT, y3);

      const c2 = barPad + colW;
      ctx.font = `600 ${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = "rgba(186, 198, 218, 0.95)";
      ctx.fillText("TIME", c2, y1);
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
      ctx.fillText(`Best ${Math.round(hud.best)}  ·  later pickups worth more`, c3, y3);

      const c4 = barPad + colW * 3;
      ctx.font = `600 ${Math.max(9, w * 0.012)}px sans-serif`;
      ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
      ctx.fillText("PACE", c4, y1);
      ctx.font = `700 ${Math.max(17, w * 0.022)}px sans-serif`;
      ctx.fillStyle = "#6ee7b7";
      ctx.fillText(`+${hud.speedPct.toFixed(0)}%`, c4, y2);
      ctx.font = `${Math.max(9, w * 0.011)}px sans-serif`;
      ctx.fillStyle = "rgba(203, 213, 225, 0.88)";
      ctx.fillText(
        `Hazard ×${hud.hazardMul.toFixed(2)}  ·  streak ×${Math.min(999, Math.floor(hud.safe / 30))}`,
        c4,
        y3
      );

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
      ctx.font = `${Math.max(8, w * 0.009)}px sans-serif`;
      ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
      ctx.fillText("Gas = nose higher · coast = lower", thBarX + thBarW, thBarY + thBarH + 28);
      ctx.textAlign = "left";

      if (!hud.finished && hud.raceElapsedSec >= 0 && hud.raceElapsedSec < 14) {
        const fade = hud.raceElapsedSec < 2.5 ? 1 : Math.max(0.22, 1 - (hud.raceElapsedSec - 2.5) / 11.5);
        const bw = Math.min(w * 0.9, 680);
        const bx = (w - bw) / 2;
        const by = h * 0.5;
        const bh = 46;
        ctx.save();
        ctx.globalAlpha = 0.9 * fade;
        drawHudPanel(bx, by, bw, bh, 12, "rgba(251, 191, 36, 0.4)");
        ctx.font = `600 ${Math.max(10, w * 0.017)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(248, 250, 252, 0.96)";
        ctx.fillText("Yellow orbs = collect score  ·  Orange cones = dodge  ·  Tilt book = steer", w / 2, by + 29);
        ctx.textAlign = "left";
        ctx.restore();
      }

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
        const rPip = 10;
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, vx, vy, tw, th, rPip);
        ctx.clip();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(video, vx, vy, tw, th);
        ctx.restore();
        drawBookSteeringInVideoRect(ctx, pLw, pRw, vx, vy, tw, th, w, h, steerVisual, false);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        roundRectPath(ctx, vx, vy, tw, th, rPip);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRectPath(ctx, vx + 1, vy + 1, tw - 2, th - 2, rPip - 1);
        ctx.stroke();
      }

      const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.22, w * 0.5, h * 0.5, w * 0.75);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.32)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      if (hud.finished) {
        ctx.fillStyle = "rgba(4, 6, 12, 0.88)";
        ctx.fillRect(0, 0, w, h);
        const accentY = h * 0.28;
        const lineG = ctx.createLinearGradient(w * 0.2, accentY, w * 0.8, accentY);
        lineG.addColorStop(0, "rgba(251, 191, 36, 0)");
        lineG.addColorStop(0.5, "rgba(251, 191, 36, 0.75)");
        lineG.addColorStop(1, "rgba(251, 191, 36, 0)");
        ctx.strokeStyle = lineG;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.18, accentY);
        ctx.lineTo(w * 0.82, accentY);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,250,245,0.98)";
        ctx.font = `800 ${Math.max(26, Math.floor(w * 0.048))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("FINISHED", w / 2, h * 0.38);
        ctx.font = `${Math.max(15, Math.floor(w * 0.024))}px sans-serif`;
        ctx.fillStyle = "rgba(148, 196, 255, 0.95)";
        ctx.fillText(
          `${hud.coins} pickups · ${hud.coneHits} cone hit${hud.coneHits === 1 ? "" : "s"}`,
          w / 2,
          h * 0.46
        );
        ctx.fillStyle = "rgba(253, 224, 138, 0.98)";
        ctx.font = `700 ${Math.max(20, Math.floor(w * 0.032))}px sans-serif`;
        ctx.fillText(`${Math.round(hud.score)} pts`, w / 2, h * 0.54);
        ctx.fillStyle = "rgba(180,195,210,0.88)";
        ctx.font = `${Math.max(12, Math.floor(w * 0.016))}px sans-serif`;
        ctx.fillText("Best score saved on this device · Race again below", w / 2, h * 0.62);
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
    trafficPhaseRef.current = 0;
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
    pickupGlowRef.current = 0;
    coneFlashRef.current = 0;
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

          pickupGlowRef.current *= 0.89;
          coneFlashRef.current *= 0.87;
          if (pickupGlowRef.current < 0.02) pickupGlowRef.current = 0;
          if (coneFlashRef.current < 0.02) coneFlashRef.current = 0;

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
            const z = (trafficPhaseRef.current + ob.off) % ROAD_CYCLE;
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
                coneFlashRef.current = Math.min(1, coneFlashRef.current + 0.48);
              }
            }
          }

          if (hitCone) {
            safeStreakRef.current = 0;
          } else {
            safeStreakRef.current = Math.min(9999, safeStreakRef.current + 1);
          }

          const lap = Math.floor(trafficPhaseRef.current / ROAD_CYCLE);
          if (lap !== coinLapRef.current) {
            coinLapRef.current = lap;
            for (let i = 0; i < coinArmedRef.current.length; i++) coinArmedRef.current[i] = true;
            for (let i = 0; i < coneArmedRef.current.length; i++) coneArmedRef.current[i] = true;
          }

          for (let i = 0; i < ROAD_COINS.length; i++) {
            if (!coinArmedRef.current[i] || finishedRef.current) continue;
            const c = ROAD_COINS[i]!;
            const z = (trafficPhaseRef.current + c.off) % ROAD_CYCLE;
            const prog = z / ROAD_CYCLE;
            if (prog < 0.73 || prog > 0.9) continue;
            const laneSpread = laneMax * (0.38 + prog * 0.62);
            const coinX = cx + c.lane * laneSpread;
            if (Math.abs(coinX - carXpx) < w * 0.05) {
              coinArmedRef.current[i] = false;
              const prior = coinTotalRef.current;
              coinTotalRef.current += 1;
              let pts = COIN_BASE + prior * COIN_PER_PRIOR;
              if (safeStreakRef.current > 120) pts *= 1.15;
              scoreRef.current += pts;
              pickupGlowRef.current = Math.min(1, pickupGlowRef.current + 0.58);
            }
          }

          const coneSlow = Math.min(0.14, coneHitsRef.current * 0.022);
          const hazardMul = HAZARD_THROTTLE_IDLE + throttleRef.current * HAZARD_THROTTLE_GAIN;
          const speedMul =
            1 +
            Math.min(0.28, scoreRef.current / 7200) +
            Math.min(0.12, safeStreakRef.current / 4800) +
            Math.max(0, throttleRef.current - 0.28) * 0.18 -
            coneSlow;
          const paceDisplay = Math.max(0, (speedMul - 1) * 100);

          if (!finishedRef.current) {
            const roadScroll =
              (ROAD_SCROLL_BASE +
                throttleRef.current * ROAD_SCROLL_THROTTLE +
                Math.abs(smVisual) * ROAD_SCROLL_STEER) *
              speedMul *
              dt *
              ROAD_SCROLL_DT_MULT;
            const trafficScroll = roadScroll * hazardMul * HAZARD_GLOBAL_MULT;
            roadPhaseRef.current += roadScroll;
            trafficPhaseRef.current += trafficScroll;
            const distPts =
              trafficScroll * 0.032 * (0.85 + throttleRef.current * 0.28) * (hitCone ? 0.35 : 1);
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
            hazardMul,
            pickupGlow: pickupGlowRef.current,
            coneFlash: coneFlashRef.current,
            timeLeftSec: finishedRef.current ? 0 : timeLeftSec,
            timeFmt: formatRaceClock(timeLeftSec),
            km: (roadPhaseRef.current * 0.38 + trafficPhaseRef.current * 0.62) * 0.00013,
            finished: finishedRef.current,
            raceElapsedSec: timeInRace / 1000,
          };

          drawFrame(
            ctx,
            w,
            h,
            smVisual,
            roadPhaseRef.current,
            trafficPhaseRef.current,
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
      <h1 className="steering-race-title">Motion Grand Prix</h1>
      <p className="muted">
        A <strong>{RACE_DURATION_MS / 1000}s</strong> camera-driven sprint: <strong>tilt a book</strong> to steer, <strong>nose height</strong> for
        throttle, <strong>yellow orbs</strong> for score, <strong>orange cones</strong> to dodge. Everything runs in your browser; best score is saved locally.
      </p>
      {cameraLabel && phase !== "idle" && (
        <p className="muted small">
          Camera: <strong>{cameraLabel}</strong>
        </p>
      )}
      {phase === "idle" && (
        <>
          <div className="card steering-race-quickstart" style={{ marginTop: "0.65rem", maxWidth: 640 }}>
            <h2 className="steering-race-quickstart-title">Quick start (first time here?)</h2>
            <ol className="muted small steering-race-quickstart-list">
              <li>Stand so your shoulders, face, and a small book all fit in frame.</li>
              <li>Press <strong>Start race</strong> and choose <strong>Allow</strong> when the browser asks for the camera.</li>
              <li>Show both wrists on the book — tilt left/right to steer (watch the wheel + camera inset).</li>
              <li>
                Slide your nose <strong>higher</strong> in frame for more speed, <strong>lower</strong> to coast (bar under the top HUD).
              </li>
            </ol>
            <p className="muted small steering-race-privacy">
              Your video stays on this device for this session; we do not upload it for Grand Prix.
            </p>
          </div>
          <div style={{ marginTop: "0.9rem" }}>
            <button type="button" className="btn primary" onClick={() => void start()}>
              Start race
            </button>
          </div>
        </>
      )}
      {phase === "loading" && (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Starting camera and pose model… This usually takes a few seconds.
        </p>
      )}
      {poseError && <p className="error">{poseError}</p>}
      {raceSummary && (
        <div className="card" style={{ marginTop: "0.75rem", borderColor: "var(--accent)" }}>
          <p style={{ marginTop: 0 }}>
            <strong>Last result:</strong> {raceSummary.balls} pickups · {raceSummary.cones} cones · score{" "}
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
            <strong>Cones vs pickups:</strong> orange <strong>cones</strong> = obstacles. Yellow <strong>orbs</strong> = score (same as the HUD pickup count).
          </li>
          <li>
            <strong>Steer:</strong> book tilt (wheel bottom-right); lateral range is wide for weaving between cones.
          </li>
          <li>
            <strong>Throttle:</strong> nose higher in frame = more gas (bar under the top HUD).
          </li>
          <li>
            <strong>Hazard pace:</strong> coasting is slower than full gas, but the road and hazards still move at a decent crawl; gas speeds everything up (see <strong>Hazard ×</strong>).
          </li>
          <li>
            <strong>Pickups & penalties:</strong> each ball is worth more than the last; long clean runs add a small ball bonus. Each cone hit costs score once per pass and dulls boost.
          </li>
          <li>
            <strong>Coming later (ideas):</strong> ghost best line, night mode, optional sound, and daily distance goals — shout if you want one wired next.
          </li>
        </ul>
      )}
    </>
  );
}
