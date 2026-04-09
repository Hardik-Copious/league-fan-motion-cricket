/** P2P messages: phone → laptop */
export type BatToHostMessage =
  | { type: "swing"; t: number; peak: number; mag: number }
  | { type: "start_innings"; t: number }
  | { type: "next_ball"; t: number }
  | { type: "ping"; t: number };

export type HostToBatMessage =
  | { type: "ack"; runsThisBall: number; totalRuns: number; ball: number; out: boolean }
  | { type: "welcome"; maxBalls: number }
  | { type: "ball_started"; ball: number; speed: number; etaMs: number }
  | { type: "ball_result"; ball: number; runs: number; outcome: "hit" | "miss" | "late" | "edge"; totalRuns: number; wickets: number }
  | { type: "score_sync"; runs: number; wickets: number; balls: number };

export const MOTION_CRICKET_GAME_TYPE = "motion_cricket_v1";
export const MAX_BALLS = 12;

/** Map IMU spike magnitude to runs 0–6 (arcade). */
export function runsFromPeak(peak: number): number {
  const n = Math.min(1, Math.max(0, (peak - 12) / 28));
  const u = Math.random();
  if (n < 0.25) return u < 0.55 ? 0 : u < 0.85 ? 1 : 2;
  if (n < 0.55) return [0, 1, 2, 3, 4][Math.min(4, Math.floor(u * 5))];
  if (n < 0.8) return [2, 3, 4, 4, 6][Math.min(4, Math.floor(u * 5))];
  return u < 0.65 ? 6 : u < 0.9 ? 4 : 6;
}
