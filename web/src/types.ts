export type Season = {
  id: string;
  label: string;
  year: number;
  tagline: string | null;
  champion_team_id: string | null;
  runner_up_team_id: string | null;
};

export type Team = {
  id: string;
  name: string;
  short_code: string;
  home_venue: string | null;
  city: string | null;
  founded_year: number | null;
  primary_color: string;
  blurb: string | null;
};

export type MatchRow = {
  id: string;
  scheduled_at: string;
  venue: string;
  home_team_id: string;
  away_team_id: string;
  status: "scheduled" | "live" | "completed";
  result_summary: string | null;
  season_id: string;
};

export type Standing = {
  season_id: string;
  team_id: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  nrr: number;
};

export type Profile = {
  id: string;
  display_name: string | null;
  favorite_team_id: string | null;
};

export type Leader = {
  id: number;
  category: "batting" | "bowling";
  rank: number;
  player_name: string;
  team_id: string;
  main_value: string;
  sub_value: string | null;
  season_id: string;
};
