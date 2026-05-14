import { BASKETBALL_MOVENET_EDGES } from "../games/basketballCourtCanvas";

/**
 * Draw MoveNet body skeleton inside a picture-in-picture rect (mirrored X like selfie cursor).
 */
export function drawMoveNetBodyInVideoRect(
  ctx: CanvasRenderingContext2D,
  kp: Array<{ x: number; y: number; score?: number }> | undefined,
  vx: number,
  vy: number,
  tw: number,
  th: number,
  vw: number,
  vh: number
): void {
  if (!kp?.length) return;
  const sx = (px: number) => vx + (vw - px) * (tw / vw);
  const sy = (py: number) => vy + py * (th / vh);

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(100, 210, 255, 0.88)";
  ctx.lineWidth = Math.max(1.5, tw * 0.012);
  for (const [ai, bi] of BASKETBALL_MOVENET_EDGES) {
    const pa = kp[ai];
    const pb = kp[bi];
    if (!pa || !pb) continue;
    if ((pa.score ?? 0) < 0.12 || (pb.score ?? 0) < 0.12) continue;
    ctx.beginPath();
    ctx.moveTo(sx(pa.x), sy(pa.y));
    ctx.lineTo(sx(pb.x), sy(pb.y));
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 200, 140, 0.92)";
  for (let i = 0; i < kp.length; i++) {
    const p = kp[i];
    if ((p.score ?? 0) < 0.15) continue;
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), Math.max(2, tw * 0.014), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
