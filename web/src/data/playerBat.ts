/** Player gear/sponsor mock data (extend as needed). */
export type PlayerEquipmentInfo = {
  batName: string;
  batDetail: string;
  helmetName: string;
  helmetDetail: string;
  sponsorName: string;
  sponsorDetail: string;
  ticketNote: string;
};

const BY_SLUG: Record<string, PlayerEquipmentInfo> = {
  // Example slugs — adjust to match real `playerSlug` values from your seed data
  "virat-kohli": {
    batName: "MRF VK18",
    batDetail: "Full-profile willow, mid sweet spot — similar to the retail VK line.",
    helmetName: "Shrey Masterguard 2.0",
    helmetDetail: "Steel grill, reinforced backplate for short-ball protection.",
    sponsorName: "Nimbus Sports",
    sponsorDetail: "Primary bat sticker and training partner for elite match prep.",
    ticketNote: "Best viewing: East Pavilion for square-of-wicket power-hitting angles.",
  },
  "rohit-sharma": {
    batName: "CEAT Hitman",
    batDetail: "Long blade profile tuned for timing over the line.",
    helmetName: "Masuri Vision Series",
    helmetDetail: "Classic shell fit with lightweight jaw guard.",
    sponsorName: "Auror Cricket Labs",
    sponsorDetail: "Match-day analytics and swing-tracking collaboration.",
    ticketNote: "Premium recommendation: West Stand for lofted drives to long-on.",
  },
};

export function getPlayerEquipmentInfo(playerSlug: string): PlayerEquipmentInfo {
  return (
    BY_SLUG[playerSlug] ?? {
      batName: "League Pro Willow",
      batDetail: "Match-grade English willow, league-standard profile.",
      helmetName: "League Shield X",
      helmetDetail: "Balanced protection shell with adjustable grill.",
      sponsorName: "HPL Official Gear",
      sponsorDetail: "Official training and match-equipment partner.",
      ticketNote: "Choose center stands for balanced batting and bowling visibility.",
    }
  );
}
