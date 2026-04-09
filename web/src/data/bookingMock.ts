/** Dummy data for ticket booking mockups (no backend). */

export type MockVenue = {
  id: string;
  name: string;
  city: string;
  capacity: number;
};

export type MockFixture = {
  id: string;
  home: string;
  away: string;
  venueId: string;
  dateLabel: string;
  timeLabel: string;
  round: string;
  basePriceInr: number;
};

export const LEAGUE_DISPLAY_NAME = "Hogwarts Premier League";

export const MOCK_VENUES: MockVenue[] = [
  { id: "hgs", name: "Great Hall Grounds", city: "Scottish Highlands", capacity: 42000 },
  { id: "qcs", name: "Quidditch Colosseum", city: "Hogsmeade", capacity: 28000 },
  { id: "fbf", name: "Forbidden Boundary Field", city: "Forest Edge", capacity: 12000 },
];

export const MOCK_FIXTURES: MockFixture[] = [
  {
    id: "hp-01",
    home: "Gryffindor Lions",
    away: "Slytherin Serpents",
    venueId: "hgs",
    dateLabel: "Sat Jun 14 · 2026",
    timeLabel: "18:30 IST",
    round: "Final",
    basePriceInr: 2499,
  },
  {
    id: "hp-02",
    home: "Ravenclaw Eagles",
    away: "Hufflepuff Badgers",
    venueId: "qcs",
    dateLabel: "Sun Jun 8 · 2026",
    timeLabel: "15:00 IST",
    round: "Semi-final",
    basePriceInr: 1899,
  },
  {
    id: "hp-03",
    home: "Gryffindor Lions",
    away: "Ravenclaw Eagles",
    venueId: "hgs",
    dateLabel: "Wed Jun 4 · 2026",
    timeLabel: "19:00 IST",
    round: "Qualifier",
    basePriceInr: 1599,
  },
  {
    id: "hp-04",
    home: "Slytherin Serpents",
    away: "Hufflepuff Badgers",
    venueId: "fbf",
    dateLabel: "Fri May 30 · 2026",
    timeLabel: "18:00 IST",
    round: "League",
    basePriceInr: 999,
  },
];

export function venueById(id: string): MockVenue | undefined {
  return MOCK_VENUES.find((v) => v.id === id);
}

export function fixtureById(id: string): MockFixture | undefined {
  return MOCK_FIXTURES.find((f) => f.id === id);
}

export const SEAT_SECTIONS = [
  { id: "north", label: "North Stand", multiplier: 1 },
  { id: "east", label: "East Pavilion", multiplier: 1.35 },
  { id: "south", label: "South Family", multiplier: 0.85 },
  { id: "west", label: "West Premium", multiplier: 1.8 },
] as const;
