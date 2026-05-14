import type { Hand } from "@tensorflow-models/hand-pose-detection";

function d(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** MediaPipe hand landmark indices */
const THUMB_MCP = 2;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

function digitExtended(
  kp: Array<{ x: number; y: number }>,
  mcp: number,
  pip: number,
  tip: number,
  stretch = 1.06
): boolean {
  return d(kp[tip], kp[mcp]) > d(kp[pip], kp[mcp]) * stretch;
}

function thumbExtended(kp: Array<{ x: number; y: number }>): boolean {
  return d(kp[THUMB_TIP], kp[THUMB_MCP]) > d(kp[THUMB_IP], kp[THUMB_MCP]) * 1.05;
}

/** Count extended digits (0–5) for one detected hand. */
export function countExtendedFingersPerHand(hand: Hand): number {
  if ((hand.score ?? 0) < 0.35) return 0;
  const kp = hand.keypoints;
  if (!kp || kp.length < 21) return 0;
  let n = 0;
  if (thumbExtended(kp)) n += 1;
  if (digitExtended(kp, INDEX_MCP, INDEX_PIP, INDEX_TIP)) n += 1;
  if (digitExtended(kp, MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP)) n += 1;
  if (digitExtended(kp, RING_MCP, RING_PIP, RING_TIP)) n += 1;
  if (digitExtended(kp, PINKY_MCP, PINKY_PIP, PINKY_TIP)) n += 1;
  return n;
}

/** Largest extended-finger count on any single hand (avoids 1+1 on two hands counting as “two fingers”). */
export function maxExtendedFingerCount(hands: Hand[]): number {
  let m = 0;
  for (const h of hands) {
    m = Math.max(m, countExtendedFingersPerHand(h));
  }
  return m;
}

/** 0 = hover (no click), 1 = single-finger click mode, 2 = two-or-more long-click mode */
export function fingerGestureLevel(total: number): 0 | 1 | 2 {
  if (total <= 0) return 0;
  if (total === 1) return 1;
  return 2;
}

export function dominantIndexTipMirrored(
  hands: Hand[],
  videoW: number
): { x: number; y: number } | null {
  const usable = hands.filter((h) => (h.score ?? 0) > 0.35 && h.keypoints?.length >= 9);
  if (usable.length === 0) return null;
  const best = usable.reduce((a, b) => ((a.score ?? 0) >= (b.score ?? 0) ? a : b));
  const tip = best.keypoints[INDEX_TIP];
  if (!tip) return null;
  return { x: videoW - tip.x, y: tip.y };
}
