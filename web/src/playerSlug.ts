/** URL-safe slug from display name (leaderboard / demo data uses ASCII names). */
export function playerNameToSlug(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "player";
}

export function playerDetailPath(teamId: string, playerName: string, season: string): string {
  return `/players/${teamId}/${playerNameToSlug(playerName)}?season=${encodeURIComponent(season)}`;
}
