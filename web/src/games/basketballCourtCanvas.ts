import type { CourtZone } from "./motionBasketball";

export const BASKETBALL_MOVENET_EDGES: [number, number][] = [
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

export type AvatarPoint = { x: number; y: number; score: number };

export function drawBasketballHalfCourt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  zoneMs: Partial<Record<CourtZone, number>>
): void {
  const floorTop = h * 0.18;
  const sky = ctx.createLinearGradient(0, 0, 0, floorTop);
  sky.addColorStop(0, "#1e3a5f");
  sky.addColorStop(1, "#2d4a6f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, floorTop);

  const floor = ctx.createLinearGradient(0, floorTop, 0, h);
  floor.addColorStop(0, "#c9985a");
  floor.addColorStop(0.45, "#b8874d");
  floor.addColorStop(1, "#8f6238");
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorTop, w, h - floorTop);

  const cx = w * 0.5;
  const baselineY = h * 0.88;
  const keyTopY = h * 0.52;

  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = Math.max(2, w * 0.003);
  ctx.strokeRect(cx - w * 0.19, keyTopY, w * 0.38, baselineY - keyTopY);

  ctx.beginPath();
  ctx.arc(cx, keyTopY, w * 0.19, 0, Math.PI, true);
  ctx.stroke();

  const arcR = w * 0.36;
  ctx.beginPath();
  ctx.arc(cx, baselineY + arcR * 0.02, arcR, Math.PI * 1.21, Math.PI * 1.79);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, baselineY);
  ctx.lineTo(w, baselineY);
  ctx.stroke();

  const boardY = h * 0.2;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(cx - w * 0.08, boardY, w * 0.16, h * 0.028);
  ctx.strokeStyle = "rgba(180,90,40,0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, boardY + h * 0.055, w * 0.022, 0, Math.PI * 2);
  ctx.stroke();

  const zt = zoneMs;
  const zsum = (zt.left_wing ?? 0) + (zt.right_wing ?? 0) + (zt.paint ?? 0) + (zt.top_of_key ?? 0) + 1;
  const drawZoneTint = (zone: CourtZone, px: number, py: number, pr: number) => {
    const t = (zt[zone] ?? 0) / zsum;
    if (t < 0.02) return;
    ctx.fillStyle =
      zone === "paint"
        ? `rgba(251, 191, 36, ${0.08 + t * 0.22})`
        : `rgba(59, 130, 246, ${0.06 + t * 0.18})`;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  };
  drawZoneTint("left_wing", w * 0.22, h * 0.72, w * 0.12);
  drawZoneTint("right_wing", w * 0.78, h * 0.72, w * 0.12);
  drawZoneTint("paint", cx, h * 0.7, w * 0.1);
  drawZoneTint("top_of_key", cx, h * 0.56, w * 0.08);
}

/** 2D side view: shooter left, hoop right, parabolic flight space (reference: profile shot diagrams). */
export function drawBasketballSideProfileCourt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  zoneMs: Partial<Record<CourtZone, number>>
): void {
  const sky = ctx.createLinearGradient(0, 0, w, h * 0.5);
  sky.addColorStop(0, "#87b8e8");
  sky.addColorStop(0.45, "#b8d4f0");
  sky.addColorStop(1, "#d6e8f7");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.52);

  ctx.strokeStyle = "rgba(120, 150, 120, 0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const tx = w * (0.15 + i * 0.12);
    const th = h * (0.08 + (i % 3) * 0.02);
    ctx.fillStyle = `rgba(60, 110, 70, ${0.12 + (i % 2) * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(tx, h * 0.44, w * 0.04, th, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const groundY = h * 0.56;
  const floor = ctx.createLinearGradient(0, groundY, 0, h);
  floor.addColorStop(0, "#c9985a");
  floor.addColorStop(0.5, "#a67c52");
  floor.addColorStop(1, "#7d5a3c");
  ctx.fillStyle = floor;
  ctx.fillRect(0, groundY, w, h - groundY);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(90,90,90,0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.72, groundY);
  ctx.lineTo(w * 0.72, h * 0.12);
  ctx.stroke();

  const rimX = w * 0.87;
  const boardW = w * 0.028;
  const boardTop = groundY - h * 0.34;
  const boardH = h * 0.22;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(rimX, boardTop, boardW, boardH);
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.strokeRect(rimX, boardTop, boardW, boardH);

  const rimCy = boardTop + boardH + h * 0.018;
  ctx.strokeStyle = "rgba(200, 80, 30, 0.95)";
  ctx.lineWidth = Math.max(3, w * 0.004);
  ctx.beginPath();
  ctx.arc(rimX + boardW * 0.5, rimCy, w * 0.022, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, groundY, w, h * 0.012);

  const zt = zoneMs;
  const zsum = (zt.left_wing ?? 0) + (zt.right_wing ?? 0) + (zt.paint ?? 0) + (zt.top_of_key ?? 0) + 1;
  const tint = (zone: CourtZone, px: number, pw: number) => {
    const t = (zt[zone] ?? 0) / zsum;
    if (t < 0.02) return;
    ctx.fillStyle =
      zone === "paint"
        ? `rgba(251, 191, 36, ${0.06 + t * 0.18})`
        : `rgba(59, 130, 246, ${0.05 + t * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(px, groundY + h * 0.06, pw, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  tint("left_wing", w * 0.22, w * 0.1);
  tint("paint", w * 0.48, w * 0.12);
  tint("top_of_key", w * 0.52, w * 0.08);
  tint("right_wing", w * 0.74, w * 0.1);
}

export function buildSideProfileAvatarPoints(
  keypoints: Array<{ x: number; y: number; score?: number }> | undefined,
  w: number,
  h: number
): AvatarPoint[] {
  const targetFeetY = h * 0.87;
  const targetBodyH = h * 0.4;
  const targetCenterX = w * 0.2;

  let mapped: AvatarPoint[] = [];
  if (keypoints?.length) {
    const good = keypoints.filter((p) => (p.score ?? 0) > 0.2);
    if (good.length > 0) {
      const minX = Math.min(...good.map((p) => p.x));
      const maxX = Math.max(...good.map((p) => p.x));
      const minY = Math.min(...good.map((p) => p.y));
      const maxY = Math.max(...good.map((p) => p.y));
      const poseW = Math.max(1, maxX - minX);
      const poseH = Math.max(1, maxY - minY);
      const scale = Math.min((targetBodyH / poseH) * 1.02, (w * 0.22) / poseW);
      const centerX = (minX + maxX) / 2;
      mapped = keypoints.map((p) => ({
        x: targetCenterX - (p.x - centerX) * scale,
        y: (p.y - maxY) * scale + targetFeetY,
        score: p.score ?? 0,
      }));
    }
  }

  if (mapped.length === 0) {
    const cx0 = targetCenterX;
    const footY = targetFeetY;
    const bodyH = targetBodyH;
    mapped = [
      { x: cx0, y: footY - bodyH * 0.92, score: 1 },
      { x: cx0 - w * 0.018, y: footY - bodyH * 0.84, score: 1 },
      { x: cx0 + w * 0.018, y: footY - bodyH * 0.84, score: 1 },
      { x: cx0 - w * 0.035, y: footY - bodyH * 0.78, score: 1 },
      { x: cx0 + w * 0.035, y: footY - bodyH * 0.78, score: 1 },
      { x: cx0 - w * 0.03, y: footY - bodyH * 0.64, score: 1 },
      { x: cx0 + w * 0.03, y: footY - bodyH * 0.64, score: 1 },
      { x: cx0 - w * 0.045, y: footY - bodyH * 0.48, score: 1 },
      { x: cx0 + w * 0.055, y: footY - bodyH * 0.42, score: 1 },
      { x: cx0 - w * 0.052, y: footY - bodyH * 0.28, score: 1 },
      { x: cx0 + w * 0.062, y: footY - bodyH * 0.26, score: 1 },
      { x: cx0 - w * 0.024, y: footY - bodyH * 0.34, score: 1 },
      { x: cx0 + w * 0.024, y: footY - bodyH * 0.34, score: 1 },
      { x: cx0 - w * 0.03, y: footY - bodyH * 0.15, score: 1 },
      { x: cx0 + w * 0.028, y: footY - bodyH * 0.13, score: 1 },
      { x: cx0 - w * 0.028, y: footY, score: 1 },
      { x: cx0 + w * 0.028, y: footY, score: 1 },
    ];
  }

  return mapped;
}

export function buildMirroredAvatarPoints(
  keypoints: Array<{ x: number; y: number; score?: number }> | undefined,
  w: number,
  h: number
): AvatarPoint[] {
  const targetFeetY = h * 0.82;
  const targetBodyH = h * 0.44;
  const targetCenterX = w * 0.5;

  let mapped: AvatarPoint[] = [];
  if (keypoints?.length) {
    const good = keypoints.filter((p) => (p.score ?? 0) > 0.2);
    if (good.length > 0) {
      const minX = Math.min(...good.map((p) => p.x));
      const maxX = Math.max(...good.map((p) => p.x));
      const minY = Math.min(...good.map((p) => p.y));
      const maxY = Math.max(...good.map((p) => p.y));
      const poseW = Math.max(1, maxX - minX);
      const poseH = Math.max(1, maxY - minY);
      const scale = Math.min((targetBodyH / poseH) * 1.05, (w * 0.22) / poseW);
      const centerX = (minX + maxX) / 2;
      mapped = keypoints.map((p) => ({
        x: targetCenterX - (p.x - centerX) * scale,
        y: (p.y - maxY) * scale + targetFeetY,
        score: p.score ?? 0,
      }));
    }
  }

  if (mapped.length === 0) {
    const cx0 = targetCenterX;
    const footY = targetFeetY;
    const bodyH = targetBodyH;
    mapped = [
      { x: cx0, y: footY - bodyH * 0.92, score: 1 },
      { x: cx0 - w * 0.018, y: footY - bodyH * 0.84, score: 1 },
      { x: cx0 + w * 0.018, y: footY - bodyH * 0.84, score: 1 },
      { x: cx0 - w * 0.035, y: footY - bodyH * 0.78, score: 1 },
      { x: cx0 + w * 0.035, y: footY - bodyH * 0.78, score: 1 },
      { x: cx0 - w * 0.03, y: footY - bodyH * 0.64, score: 1 },
      { x: cx0 + w * 0.03, y: footY - bodyH * 0.64, score: 1 },
      { x: cx0 - w * 0.045, y: footY - bodyH * 0.48, score: 1 },
      { x: cx0 + w * 0.055, y: footY - bodyH * 0.42, score: 1 },
      { x: cx0 - w * 0.052, y: footY - bodyH * 0.28, score: 1 },
      { x: cx0 + w * 0.062, y: footY - bodyH * 0.26, score: 1 },
      { x: cx0 - w * 0.024, y: footY - bodyH * 0.34, score: 1 },
      { x: cx0 + w * 0.024, y: footY - bodyH * 0.34, score: 1 },
      { x: cx0 - w * 0.03, y: footY - bodyH * 0.15, score: 1 },
      { x: cx0 + w * 0.028, y: footY - bodyH * 0.13, score: 1 },
      { x: cx0 - w * 0.028, y: footY, score: 1 },
      { x: cx0 + w * 0.028, y: footY, score: 1 },
    ];
  }

  return mapped;
}

type Pt = { x: number; y: number };

function quadPoint(t: number, p0: Pt, p1: Pt, p2: Pt): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Parabolic arc + “strobe” balls from release toward rim (side profile). */
export function drawSideProfileShootVisualization(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  releaseX: number,
  releaseY: number,
  shootingShape: number,
  wristUpVelNorm: number
): void {
  if (shootingShape < 0.12) return;

  const groundY = h * 0.88;
  const rimX = w * 0.87;
  const rimY = groundY - h * 0.2;
  const p0: Pt = {
    x: Math.min(Math.max(releaseX, w * 0.06), rimX - w * 0.12),
    y: Math.min(releaseY, groundY - h * 0.04),
  };
  const p2: Pt = { x: rimX, y: rimY };
  const midX = (p0.x + p2.x) / 2;
  const arcH = h * (0.12 + shootingShape * 0.14 + Math.min(1, wristUpVelNorm) * 0.1);
  const p1: Pt = { x: midX, y: Math.min(p0.y, p2.y) - arcH };

  ctx.save();
  ctx.globalAlpha = 0.35 + shootingShape * 0.5;

  ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
  ctx.lineWidth = Math.max(2, w * 0.0035);
  ctx.setLineDash([10, 8]);
  ctx.lineCap = "round";
  ctx.beginPath();
  const steps = 48;
  const q0 = quadPoint(0, p0, p1, p2);
  ctx.moveTo(q0.x, q0.y);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = quadPoint(t, p0, p1, p2);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(234, 88, 12, 0.92)";
  ctx.strokeStyle = "rgba(40, 20, 0, 0.35)";
  const br = Math.max(3, w * 0.011);
  for (const t of [0.08, 0.18, 0.28, 0.38, 0.5, 0.62, 0.74, 0.86, 0.94]) {
    const p = quadPoint(t, p0, p1, p2);
    ctx.beginPath();
    ctx.arc(p.x, p.y, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

export function drawBasketballAvatar(ctx: CanvasRenderingContext2D, w: number, h: number, mappedPoints: AvatarPoint[]): void {
  const ankleL = mappedPoints[15];
  const ankleR = mappedPoints[16];
  const shadowCx =
    ankleL && ankleR && ankleL.score > 0.2 && ankleR.score > 0.2
      ? (ankleL.x + ankleR.x) / 2
      : w * 0.5;
  const shadowCy =
    ankleL && ankleR && ankleL.score > 0.2 && ankleR.score > 0.2
      ? Math.max(ankleL.y, ankleR.y) + 6
      : h * 0.82 + 6;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(shadowCx, shadowCy, w * 0.065, h * 0.016, 0, 0, Math.PI * 2);
  ctx.fill();

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
    ctx.fillStyle = "rgba(194, 65, 12, 0.55)";
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(234, 88, 12, 0.95)";
  ctx.lineWidth = Math.max(3, w * 0.0045);
  ctx.lineCap = "round";
  for (const [a, b] of BASKETBALL_MOVENET_EDGES) {
    const pa = mappedPoints[a];
    const pb = mappedPoints[b];
    if (!pa || !pb || pa.score < 0.2 || pb.score < 0.2) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  for (const p of mappedPoints) {
    if (p.score < 0.2) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(3, w * 0.005), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(253, 186, 116, 0.95)";
    ctx.fill();
    ctx.strokeStyle = "rgba(7,10,16,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export type VirtualCourtBall = {
  id: string;
  /** 0–1 canvas position */
  nx: number;
  ny: number;
  /** radius as fraction of width */
  r: number;
  lastHitAt?: number;
};

export function spawnVirtualCourtBalls(): VirtualCourtBall[] {
  return [
    { id: "v1", nx: 0.42, ny: 0.66, r: 0.038 },
    { id: "v2", nx: 0.58, ny: 0.72, r: 0.034 },
    { id: "v3", nx: 0.5, ny: 0.58, r: 0.036 },
    { id: "v4", nx: 0.33, ny: 0.74, r: 0.032 },
    { id: "v5", nx: 0.67, ny: 0.64, r: 0.035 },
  ];
}

function respawnVirtualBall(b: VirtualCourtBall): VirtualCourtBall {
  return {
    ...b,
    nx: 0.26 + Math.random() * 0.48,
    ny: 0.54 + Math.random() * 0.22,
    r: 0.03 + Math.random() * 0.014,
  };
}

export function drawVirtualCourtBalls(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  balls: readonly VirtualCourtBall[],
  now: number
): void {
  for (const b of balls) {
    const x = b.nx * w;
    const y = b.ny * h;
    const rad = b.r * w;
    const pop = b.lastHitAt != null && now - b.lastHitAt < 220;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rad * (pop ? 1.35 : 1), 0, Math.PI * 2);
    const grd = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    grd.addColorStop(0, pop ? "#fff8e0" : "#fde68a");
    grd.addColorStop(0.55, "#ea580c");
    grd.addColorStop(1, "#9a3412");
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - rad * 0.25, y - rad * 0.25, rad * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * (1) Wrist very close = poke. (2) Looser radius while shooting pocket high = “shot” hit.
 */
export function tryHitVirtualCourtBalls(
  balls: VirtualCourtBall[],
  tipX: number,
  tipY: number,
  shootingShape: number,
  w: number,
  h: number,
  now: number
): { next: VirtualCourtBall[]; hits: number } {
  let hits = 0;
  const next = balls.map((b) => ({ ...b }));
  for (let i = 0; i < next.length; i++) {
    const b = next[i];
    if (b.lastHitAt != null && now - b.lastHitAt < 450) continue;
    const bx = b.nx * w;
    const by = b.ny * h;
    const rad = b.r * w;
    const d = Math.hypot(tipX - bx, tipY - by);
    const poke = d < rad * 1.25;
    const shotHit = d < rad * 2.35 && shootingShape > 0.3;
    if (poke || shotHit) {
      hits += 1;
      next[i] = { ...respawnVirtualBall(b), lastHitAt: now };
    }
  }
  return { next, hits };
}

export function drawWebcamThumbnail(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number): void {
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
}

/** Arc-style trail of dominant-hand path (canvas coords) for release visualization. */
export function drawShotTrajectory(
  ctx: CanvasRenderingContext2D,
  trail: Array<{ x: number; y: number }>,
  w: number
): void {
  if (trail.length < 2) return;
  ctx.save();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
  ctx.lineWidth = Math.max(2.5, w * 0.0045);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([8, 6]);
  ctx.shadowColor = "rgba(251, 191, 36, 0.45)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(trail[0].x, trail[0].y);
  for (let i = 1; i < trail.length; i += 1) {
    ctx.lineTo(trail[i].x, trail[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.restore();
}
