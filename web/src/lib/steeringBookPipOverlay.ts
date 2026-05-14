/**
 * Picture-in-picture: book = wrist segment for steering.
 * When `mirrorVideo` is true, the caller draws the PiP with `scale(-1,1)`; map X with `vw - px` so the overlay
 * matches that preview. When false, the video is drawn unmirrored in the rect — map X with `px` directly.
 */
export function drawBookSteeringInVideoRect(
  ctx: CanvasRenderingContext2D,
  pLw: { x: number; y: number; score?: number } | undefined,
  pRw: { x: number; y: number; score?: number } | undefined,
  vx: number,
  vy: number,
  tw: number,
  th: number,
  vw: number,
  vh: number,
  steer: number,
  mirrorVideo = true
): void {
  const sx = (px: number) =>
    mirrorVideo ? vx + (vw - px) * (tw / vw) : vx + px * (tw / vw);
  const sy = (py: number) => vy + py * (th / vh);

  ctx.save();
  ctx.fillStyle = "rgba(8,12,20,0.55)";
  ctx.fillRect(vx, vy - 18, tw, 16);
  ctx.fillStyle = "rgba(255,248,240,0.92)";
  ctx.font = `${Math.max(9, tw * 0.07)}px sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("Book edge (wrists) → steer", vx + 4, vy - 6);

  if (
    !pLw ||
    !pRw ||
    (pLw.score ?? 0) < 0.18 ||
    (pRw.score ?? 0) < 0.18
  ) {
    ctx.fillStyle = "rgba(255,200,120,0.85)";
    ctx.font = `${Math.max(10, tw * 0.08)}px sans-serif`;
    ctx.fillText("Show both wrists + book", vx + 4, vy + th * 0.45);
    ctx.restore();
    return;
  }

  const ax = sx(pLw.x);
  const ay = sy(pLw.y);
  const bx = sx(pRw.x);
  const by = sy(pRw.y);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const ang = Math.atan2(by - ay, bx - ax);
  const len = Math.hypot(bx - ax, by - ay) + 8;

  ctx.translate(mx, my);
  ctx.rotate(ang);
  ctx.fillStyle = "rgba(200, 160, 90, 0.45)";
  ctx.strokeStyle = "rgba(255, 220, 140, 0.95)";
  ctx.lineWidth = 2.5;
  ctx.fillRect(-len / 2, -10, len, 20);
  ctx.strokeRect(-len / 2, -10, len, 20);
  ctx.strokeStyle = "rgba(255, 140, 40, 0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-len * 0.35, 0);
  ctx.lineTo(len * 0.35, 0);
  ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.fillStyle = "rgba(120, 220, 255, 0.95)";
  for (const [x, y] of [
    [ax, ay],
    [bx, by],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, tw * 0.028), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `${Math.max(9, tw * 0.065)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${(steer * 57.3).toFixed(0)}°`, vx + tw / 2, vy + th - 8);

  ctx.restore();
}
