export type PreviousMotionMatch = {
  matchId: string;
  endedAt: string;
  runs: number;
  wickets: number;
  balls: number;
};

const KEY = "league_fan_motion_previous_matches_v1";

export function loadPreviousMatches(): PreviousMotionMatch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is PreviousMotionMatch =>
          r != null &&
          typeof r === "object" &&
          typeof (r as PreviousMotionMatch).matchId === "string" &&
          typeof (r as PreviousMotionMatch).endedAt === "string"
      )
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function appendPreviousMatch(entry: Omit<PreviousMotionMatch, "endedAt"> & { endedAt?: string }): void {
  const endedAt = entry.endedAt ?? new Date().toISOString();
  const next: PreviousMotionMatch = {
    matchId: entry.matchId,
    endedAt,
    runs: entry.runs,
    wickets: entry.wickets,
    balls: entry.balls,
  };
  const prev = loadPreviousMatches();
  const filtered = prev.filter((p) => p.matchId !== next.matchId);
  filtered.unshift(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, 30)));
  } catch {
    /* quota */
  }
}
