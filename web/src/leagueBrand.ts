export const LEAGUE_NAME = "Hogwarts Premier League";

export function normalizeLeagueLabel(label: string): string {
  return label.replace(/Demo Premier League/gi, LEAGUE_NAME);
}

