-- Expanded fictional T20 league: more teams, fixtures, standings, leaderboards.
-- Clears prior seed rows (predictions, sessions, matches, standings, teams) — demo only.

alter table public.teams
  add column if not exists city text,
  add column if not exists founded_year int;

create table if not exists public.leaders (
  id int generated always as identity primary key,
  category text not null check (category in ('batting', 'bowling')),
  rank int not null,
  player_name text not null,
  team_id text not null references public.teams (id) on delete cascade,
  main_value text not null,
  sub_value text
);

alter table public.leaders enable row level security;

drop policy if exists leaders_read_all on public.leaders;
create policy leaders_read_all on public.leaders for select using (true);

-- Clear user-linked rows that reference matches / teams
update public.profiles set favorite_team_id = null where favorite_team_id is not null;
delete from public.predictions;
delete from public.game_sessions;
delete from public.matches;
delete from public.standings;
delete from public.leaders;
delete from public.teams;

insert into public.teams (id, name, short_code, home_venue, city, founded_year, primary_color, blurb) values
  ('mum', 'Mumbai Mariners', 'MUM', 'Marine Drive Arena', 'Mumbai', 2019, '#0c4a6e', 'Coastal grit and death-over nerve. Captain: Rahul Verma.'),
  ('del', 'Delhi Daggers', 'DEL', 'Capital Ring', 'Delhi', 2019, '#7f1d1d', 'Powerplay hunters who press every run. Captain: Vikram Singh.'),
  ('blr', 'Bengaluru Beacons', 'BLR', 'Tech Park Oval', 'Bengaluru', 2020, '#14532d', 'Spin-friendly decks, data-driven fields. Captain: Arjun Nair.'),
  ('che', 'Chennai Cyclones', 'CHE', 'Marina Grounds', 'Chennai', 2019, '#f59e0b', 'Spin, squeeze, and soul. Captain: Karthik Selvan.'),
  ('hyd', 'Hyderabad Heat', 'HYD', 'Charminar Stadium', 'Hyderabad', 2020, '#ea580c', 'Pace cartel with a sun-baked home. Captain: Imran Qureshi.'),
  ('kol', 'Kolkata Comets', 'KOL', 'Hooghly Park', 'Kolkata', 2019, '#6b21a8', 'Left-arm chaos and Eden-style noise. Captain: Dev Banerjee.'),
  ('pun', 'Punjab Pulse', 'PUN', 'Fields Arena', 'Mohali', 2020, '#dc2626', 'Six-happy openers and fearless chases. Captain: Harpreet Gill.'),
  ('jai', 'Jaipur Jewels', 'JAI', 'Pink City Oval', 'Jaipur', 2021, '#db2777', 'Turning tracks, wristy middle order. Captain: Ravi Rathore.'),
  ('lkn', 'Lucknow Lions', 'LKN', 'Gomti Green', 'Lucknow', 2022, '#0d9488', 'Balanced XI, clutch finishers. Captain: Ayaan Khan.'),
  ('amd', 'Ahmedabad Aces', 'AMD', 'Sabarmati End', 'Ahmedabad', 2022, '#1d4ed8', 'New franchise energy, sharp fielding. Captain: Neel Shah.');

insert into public.matches (id, scheduled_at, venue, home_team_id, away_team_id, status, result_summary) values
  ('m01', '2026-03-22T14:00:00Z', 'Marine Drive Arena', 'mum', 'del', 'completed', 'MUM won by 8 runs'),
  ('m02', '2026-03-22T18:00:00Z', 'Tech Park Oval', 'blr', 'che', 'completed', 'CHE won by 3 wickets'),
  ('m03', '2026-03-23T14:00:00Z', 'Charminar Stadium', 'hyd', 'kol', 'completed', 'HYD won by 12 runs'),
  ('m04', '2026-03-23T18:00:00Z', 'Fields Arena', 'pun', 'jai', 'completed', 'PUN won by 5 wickets'),
  ('m05', '2026-03-24T14:00:00Z', 'Gomti Green', 'lkn', 'amd', 'completed', 'LKN won by 1 run'),
  ('m06', '2026-03-24T18:00:00Z', 'Capital Ring', 'del', 'blr', 'completed', 'BLR won by 22 runs'),
  ('m07', '2026-03-25T14:00:00Z', 'Marina Grounds', 'che', 'hyd', 'completed', 'CHE won by 7 wickets'),
  ('m08', '2026-03-25T18:00:00Z', 'Hooghly Park', 'kol', 'pun', 'completed', 'KOL won by 4 wickets'),
  ('m09', '2026-03-26T14:00:00Z', 'Pink City Oval', 'jai', 'mum', 'completed', 'MUM won by 6 wickets'),
  ('m10', '2026-03-26T18:00:00Z', 'Sabarmati End', 'amd', 'del', 'completed', 'DEL won by 9 runs'),
  ('m11', '2026-03-27T14:00:00Z', 'Marine Drive Arena', 'mum', 'hyd', 'completed', 'MUM won by 2 wickets'),
  ('m12', '2026-03-27T18:00:00Z', 'Tech Park Oval', 'blr', 'kol', 'completed', 'BLR won by 15 runs'),
  ('m13', '2026-03-28T14:00:00Z', 'Marina Grounds', 'che', 'pun', 'completed', 'CHE won by 18 runs'),
  ('m14', '2026-03-28T18:00:00Z', 'Gomti Green', 'lkn', 'jai', 'completed', 'JAI won by 3 wickets'),
  ('m15', '2026-03-29T14:00:00Z', 'Fields Arena', 'pun', 'amd', 'completed', 'PUN won by 11 runs'),
  ('m16', '2026-03-29T18:00:00Z', 'Capital Ring', 'del', 'lkn', 'completed', 'DEL won by 4 wickets'),
  ('m17', '2026-03-30T14:00:00Z', 'Hooghly Park', 'kol', 'che', 'completed', 'CHE won by 6 runs'),
  ('m18', '2026-03-30T18:00:00Z', 'Pink City Oval', 'jai', 'hyd', 'completed', 'HYD won by 8 wickets'),
  ('m19', '2026-04-02T14:00:00Z', 'Sabarmati End', 'amd', 'blr', 'completed', 'BLR won by 7 wickets'),
  ('m20', '2026-04-02T18:00:00Z', 'Marine Drive Arena', 'mum', 'kol', 'completed', 'MUM won by 5 runs'),
  ('m21', '2026-04-05T14:00:00Z', 'Tech Park Oval', 'blr', 'lkn', 'live', 'Live — BLR 112/2 (12.4)'),
  ('m22', '2026-04-05T18:00:00Z', 'Marine Drive Arena', 'mum', 'che', 'scheduled', null),
  ('m23', '2026-04-06T14:00:00Z', 'Charminar Stadium', 'hyd', 'pun', 'scheduled', null),
  ('m24', '2026-04-06T18:00:00Z', 'Hooghly Park', 'kol', 'amd', 'scheduled', null),
  ('m25', '2026-04-07T14:00:00Z', 'Pink City Oval', 'jai', 'del', 'scheduled', null),
  ('m26', '2026-04-07T18:00:00Z', 'Gomti Green', 'lkn', 'pun', 'scheduled', null),
  ('m27', '2026-04-08T19:30:00Z', 'Sabarmati End', 'amd', 'che', 'scheduled', null);

insert into public.standings (team_id, played, won, lost, points, nrr) values
  ('mum', 7, 6, 1, 12, 0.812),
  ('che', 8, 6, 2, 12, 0.445),
  ('blr', 8, 5, 3, 10, 0.301),
  ('del', 7, 4, 3, 8, -0.052),
  ('hyd', 7, 4, 3, 8, -0.088),
  ('pun', 7, 4, 3, 8, -0.124),
  ('kol', 7, 3, 4, 6, -0.215),
  ('jai', 7, 2, 5, 4, -0.367),
  ('lkn', 7, 2, 5, 4, -0.401),
  ('amd', 7, 1, 6, 2, -0.533);

insert into public.leaders (category, rank, player_name, team_id, main_value, sub_value) values
  ('batting', 1, 'Rahul Verma', 'mum', '428 runs', 'Avg 61.1 · SR 152'),
  ('batting', 2, 'Karthik Selvan', 'che', '401 runs', 'Avg 57.3 · SR 138'),
  ('batting', 3, 'Arjun Nair', 'blr', '389 runs', 'Avg 48.6 · SR 161'),
  ('batting', 4, 'Vikram Singh', 'del', '356 runs', 'Avg 50.9 · SR 144'),
  ('batting', 5, 'Imran Qureshi', 'hyd', '338 runs', 'Avg 48.3 · SR 149'),
  ('bowling', 1, 'Sanjay Krishnan', 'che', '19 wickets', 'Econ 6.8'),
  ('bowling', 2, 'Yash Patel', 'blr', '17 wickets', 'Econ 7.1'),
  ('bowling', 3, 'Rahul Verma', 'mum', '14 wickets', 'Econ 8.2 — part-time'),
  ('bowling', 4, 'Farhan Ali', 'hyd', '14 wickets', 'Econ 7.9'),
  ('bowling', 5, 'Dev Banerjee', 'kol', '13 wickets', 'Econ 8.0');
