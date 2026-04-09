export type TeamMerch = {
  featuredPlayer: string;
  shirtName: string;
  shirtPriceInr: number;
  adLine: string;
};

const BY_TEAM_ID: Record<string, TeamMerch> = {
  mum: {
    featuredPlayer: "Rahul Verma",
    shirtName: "MUM Home Jersey 2026",
    shirtPriceInr: 1799,
    adLine: "Fan-favorite fit with breathable match fabric.",
  },
  che: {
    featuredPlayer: "Karthik Selvan",
    shirtName: "CHE Legacy Blue Jersey",
    shirtPriceInr: 1699,
    adLine: "Classic collar edition inspired by title-winning campaigns.",
  },
  blr: {
    featuredPlayer: "Arjun Nair",
    shirtName: "BLR Strike Purple Shirt",
    shirtPriceInr: 1749,
    adLine: "Lightweight training weave with moisture-control mesh.",
  },
};

export function getTeamMerch(teamId: string, teamCode: string): TeamMerch {
  return (
    BY_TEAM_ID[teamId] ?? {
      featuredPlayer: `${teamCode} Star Player`,
      shirtName: `${teamCode} Official Player Shirt`,
      shirtPriceInr: 1499,
      adLine: "Official team merchandise for match days and fan events.",
    }
  );
}

