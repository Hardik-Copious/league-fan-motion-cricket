/** Demo bat attribution per player slug (extend as needed). */
export type PlayerBatInfo = {
  batName: string;
  batDetail: string;
};

const BY_SLUG: Record<string, PlayerBatInfo> = {
  // Example slugs — adjust to match real `playerSlug` values from your seed data
  "virat-kohli": {
    batName: "MRF VK18",
    batDetail: "Full-profile willow, mid sweet spot — similar to the retail VK line.",
  },
  "rohit-sharma": {
    batName: "CEAT Hitman",
    batDetail: "Long blade profile tuned for timing over the line.",
  },
};

export function getPlayerBatInfo(playerSlug: string): PlayerBatInfo {
  return (
    BY_SLUG[playerSlug] ?? {
      batName: "League Pro Willow",
      batDetail: "Match-grade English willow, league-standard profile.",
    }
  );
}
