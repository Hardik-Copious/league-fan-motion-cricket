/** Stored in `game_sessions.game_type` for leaderboard rows. */
export const MOTION_BASKETBALL_GAME_TYPE = "motion_basketball_v1";

/** Drill length (seconds) — mirrors a timed “quarter” rep block. */
export const DRILL_SECONDS = 90;

export type CourtZone = "left_wing" | "right_wing" | "paint" | "top_of_key" | "unknown";

export type KeypointLite = { x: number; y: number; score?: number };

const IDX = {
  nose: 0,
  lShoulder: 5,
  rShoulder: 6,
  lElbow: 7,
  rElbow: 8,
  lWrist: 9,
  rWrist: 10,
  lHip: 11,
  rHip: 12,
  lKnee: 13,
  rKnee: 14,
  lAnkle: 15,
  rAnkle: 16,
} as const;

function angleAtDeg(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const bax = ax - bx;
  const bay = ay - by;
  const bcx = cx - bx;
  const bcy = cy - by;
  const dot = bax * bcx + bay * bcy;
  const mag = Math.hypot(bax, bay) * Math.hypot(bcx, bcy);
  if (mag < 1e-6) return 180;
  const c = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(c) * 180) / Math.PI;
}

function dist(a: KeypointLite, b: KeypointLite): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Normalized horizontal “court” position from visible pose (0 = frame left, 1 = right). */
export function poseCenterNormX(
  kp: ReadonlyArray<{ x: number; y: number; score?: number }> | undefined,
  frameW: number
): number | null {
  if (!kp?.length || !frameW) return null;
  const good = kp.filter((p) => (p.score ?? 0) > 0.2);
  if (good.length < 6) return null;
  const minX = Math.min(...good.map((p) => p.x));
  const maxX = Math.max(...good.map((p) => p.x));
  const cx = (minX + maxX) / 2;
  return cx / frameW;
}

/**
 * Map normalized torso center (0–1) to a broadcast-style half-court zone.
 * Camera is frontal; lateral motion in frame ≈ left/right floor space.
 */
export function zoneFromNormX(normX: number | null): CourtZone {
  if (normX == null) return "unknown";
  if (normX < 0.36) return "left_wing";
  if (normX > 0.64) return "right_wing";
  if (normX >= 0.42 && normX <= 0.58) return "paint";
  return "top_of_key";
}

export type FrameAnalytics = {
  zone: CourtZone;
  tags: string[];
  stanceWidthRatio: number | null;
  kneeFlexDeg: { left: number | null; right: number | null };
  /** 0–1 higher = more “shooting pocket” shape on dominant side */
  shootingShape: number;
  hipToAnkleNorm: number | null;
};

function pickDominantSide(kp: ReadonlyArray<{ x: number; y: number; score?: number }>): "right" | "left" {
  const rw = kp[IDX.rWrist];
  const lw = kp[IDX.lWrist];
  const rs = kp[IDX.rShoulder];
  const ls = kp[IDX.lShoulder];
  const rScore = (rw.score ?? 0) + (rs.score ?? 0);
  const lScore = (lw.score ?? 0) + (ls.score ?? 0);
  return rScore >= lScore ? "right" : "left";
}

/** Single-frame biomechanical hints from MoveNet keypoints (video pixel space). */
export function analyzeBasketballFrame(
  kp: ReadonlyArray<{ x: number; y: number; score?: number }> | undefined,
  frameW: number,
  frameH: number
): FrameAnalytics {
  const empty: FrameAnalytics = {
    zone: "unknown",
    tags: [],
    stanceWidthRatio: null,
    kneeFlexDeg: { left: null, right: null },
    shootingShape: 0,
    hipToAnkleNorm: null,
  };
  if (!kp || kp.length < 17 || !frameW || !frameH) return empty;

  const cx = poseCenterNormX(kp, frameW);
  const zone = zoneFromNormX(cx);

  const lh = kp[IDX.lHip];
  const rh = kp[IDX.rHip];
  const lk = kp[IDX.lKnee];
  const rk = kp[IDX.rKnee];
  const la = kp[IDX.lAnkle];
  const ra = kp[IDX.rAnkle];

  let stanceWidthRatio: number | null = null;
  let kneeFlexDeg = { left: null as number | null, right: null as number | null };
  let hipToAnkleNorm: number | null = null;

  if (lh && rh && la && ra && dist(lh, rh) > 1e-3) {
    if ((lh.score ?? 0) > 0.2 && (rh.score ?? 0) > 0.2 && (la.score ?? 0) > 0.2 && (ra.score ?? 0) > 0.2) {
      stanceWidthRatio = dist(la, ra) / dist(lh, rh);
    }
  }

  if (
    (lh.score ?? 0) > 0.2 &&
    (rh.score ?? 0) > 0.2 &&
    (lk.score ?? 0) > 0.2 &&
    (rk.score ?? 0) > 0.2 &&
    (la.score ?? 0) > 0.2 &&
    (ra.score ?? 0) > 0.2
  ) {
    kneeFlexDeg.left = 180 - angleAtDeg(lh.x, lh.y, lk.x, lk.y, la.x, la.y);
    kneeFlexDeg.right = 180 - angleAtDeg(rh.x, rh.y, rk.x, rk.y, ra.x, ra.y);
    const hipMidY = (lh.y + rh.y) / 2;
    const ankleMidY = (la.y + ra.y) / 2;
    const torso = Math.max(1, Math.abs(kp[IDX.nose]?.y ?? hipMidY) - hipMidY);
    hipToAnkleNorm = (ankleMidY - hipMidY) / torso;
  }

  const tags: string[] = [];
  if (stanceWidthRatio != null && stanceWidthRatio > 1.12) tags.push("wide_base");
  const lfL = kneeFlexDeg.left;
  const lfR = kneeFlexDeg.right;
  if (lfL != null && lfR != null && lfL > 18 && lfR > 18 && stanceWidthRatio != null && stanceWidthRatio > 1.08) {
    tags.push("defensive_shape");
  }

  const dom = pickDominantSide(kp);
  let shootingShape = 0;
  if (dom === "right") {
    const rs = kp[IDX.rShoulder];
    const re = kp[IDX.rElbow];
    const rw = kp[IDX.rWrist];
    if ((rs.score ?? 0) > 0.22 && (re.score ?? 0) > 0.22 && (rw.score ?? 0) > 0.22) {
      const elbowLift = Math.max(0, (rs.y - re.y) / Math.max(40, frameH * 0.06));
      const wristAboveHip = Math.max(0, (rh.y - rw.y) / Math.max(40, frameH * 0.08));
      shootingShape = Math.min(1, 0.55 * Math.tanh(elbowLift) + 0.45 * Math.tanh(wristAboveHip));
      if (elbowLift > 0.35 && wristAboveHip > 0.2) tags.push("shooting_pocket_r");
    }
  } else {
    const ls = kp[IDX.lShoulder];
    const le = kp[IDX.lElbow];
    const lw = kp[IDX.lWrist];
    if ((ls.score ?? 0) > 0.22 && (le.score ?? 0) > 0.22 && (lw.score ?? 0) > 0.22) {
      const elbowLift = Math.max(0, (ls.y - le.y) / Math.max(40, frameH * 0.06));
      const wristAboveHip = Math.max(0, (lh.y - lw.y) / Math.max(40, frameH * 0.08));
      shootingShape = Math.min(1, 0.55 * Math.tanh(elbowLift) + 0.45 * Math.tanh(wristAboveHip));
      if (elbowLift > 0.35 && wristAboveHip > 0.2) tags.push("shooting_pocket_l");
    }
  }

  if (hipToAnkleNorm != null && hipToAnkleNorm < 0.42) tags.push("low_hips");

  return {
    zone,
    tags,
    stanceWidthRatio,
    kneeFlexDeg,
    shootingShape,
    hipToAnkleNorm,
  };
}

/** Arcade-style points for leaderboard from rep counters. */
export function compositeDrillScore(reps: { shot: number; squat: number; defensive: number }): number {
  return reps.shot * 10 + reps.squat * 6 + reps.defensive * 4;
}

/** Leaderboard + Supabase `game_sessions.game_type` for Target Rush mode. */
export const MOTION_BASKETBALL_TARGET_RUSH_GAME_TYPE = "motion_basketball_target_rush_v1";

export const TARGET_RUSH_SECONDS = 90;
/** Points needed before the clock ends to win. */
export const TARGET_RUSH_GOAL = 180;
export const TARGET_RUSH_LIVES = 3;
/** No rep for this long → lose one life. */
export const TARGET_RUSH_IDLE_MS = 11000;
/** Reps within this window chain the combo multiplier. */
export const TARGET_RUSH_COMBO_CHAIN_MS = 4200;
export const TARGET_RUSH_COMBO_MAX = 2.25;
export const TARGET_RUSH_COMBO_STEP = 0.14;
