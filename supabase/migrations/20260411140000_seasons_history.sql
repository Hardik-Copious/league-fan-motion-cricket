-- Past seasons, season_id on matches/standings/leaders, archive fixtures.

create table public.seasons (
  id text primary key,
  label text not null,
  year int not null,
  tagline text,
  champion_team_id text references public.teams (id),
  runner_up_team_id text references public.teams (id)
);

alter table public.seasons enable row level security;
create policy seasons_read_all on public.seasons for select using (true);

insert into public.seasons (id, label, year, tagline, champion_team_id, runner_up_team_id) values
  ('2024', 'Demo Premier League 2024', 2024, 'The inaugural chapter — floodlights and fairy tales', 'mum', 'che'),
  ('2025', 'Demo Premier League 2025', 2025, 'Spin, pace, and last-ball theatre', 'che', 'blr'),
  ('2026', 'Demo Premier League 2026', 2026, 'Current season — race to the trophy', null, null);

alter table public.matches add column season_id text;
update public.matches set season_id = '2026' where season_id is null;
alter table public.matches alter column season_id set not null;
alter table public.matches add constraint matches_season_fk foreign key (season_id) references public.seasons (id);

alter table public.standings add column season_id text;
update public.standings set season_id = '2026' where season_id is null;
alter table public.standings alter column season_id set not null;
alter table public.standings add constraint standings_season_fk foreign key (season_id) references public.seasons (id);

alter table public.standings drop constraint standings_pkey;
alter table public.standings add primary key (season_id, team_id);

-- 2025 final table (archived)
insert into public.standings (season_id, team_id, played, won, lost, points, nrr) values
  ('2025', 'che', 14, 10, 4, 20, 0.589),
  ('2025', 'blr', 14, 9, 5, 18, 0.412),
  ('2025', 'mum', 14, 9, 5, 18, 0.305),
  ('2025', 'del', 14, 8, 6, 16, 0.088),
  ('2025', 'hyd', 14, 7, 7, 14, -0.022),
  ('2025', 'pun', 14, 6, 8, 12, -0.156),
  ('2025', 'kol', 14, 5, 9, 10, -0.241),
  ('2025', 'jai', 14, 5, 9, 10, -0.298),
  ('2025', 'lkn', 14, 4, 10, 8, -0.355),
  ('2025', 'amd', 14, 3, 11, 6, -0.501);

-- 2024 final table (archived)
insert into public.standings (season_id, team_id, played, won, lost, points, nrr) values
  ('2024', 'mum', 12, 9, 3, 18, 0.721),
  ('2024', 'che', 12, 8, 4, 16, 0.498),
  ('2024', 'del', 12, 7, 5, 14, 0.201),
  ('2024', 'blr', 12, 6, 6, 12, -0.045),
  ('2024', 'hyd', 12, 6, 6, 12, -0.112),
  ('2024', 'pun', 12, 5, 7, 10, -0.198),
  ('2024', 'kol', 12, 4, 8, 8, -0.267),
  ('2024', 'jai', 12, 3, 9, 6, -0.389),
  ('2024', 'lkn', 12, 2, 10, 4, -0.512),
  ('2024', 'amd', 12, 2, 10, 4, -0.601);

-- 2025 sample matches (finals week + regular)
insert into public.matches (id, scheduled_at, venue, home_team_id, away_team_id, status, result_summary, season_id) values
  ('s25_01', '2025-03-18T14:00:00Z', 'Marine Drive Arena', 'mum', 'che', 'completed', 'MUM won by 11 runs', '2025'),
  ('s25_02', '2025-03-19T14:00:00Z', 'Marina Grounds', 'che', 'blr', 'completed', 'CHE won by 4 wickets', '2025'),
  ('s25_03', '2025-03-25T18:00:00Z', 'Tech Park Oval', 'blr', 'del', 'completed', 'BLR won by 7 runs', '2025'),
  ('s25_04', '2025-04-02T14:00:00Z', 'Capital Ring', 'del', 'hyd', 'completed', 'DEL won by 3 wickets', '2025'),
  ('s25_05', '2025-04-08T18:00:00Z', 'Charminar Stadium', 'hyd', 'pun', 'completed', 'HYD won by 15 runs', '2025'),
  ('s25_06', '2025-04-14T14:00:00Z', 'Hooghly Park', 'kol', 'jai', 'completed', 'KOL won by 2 runs', '2025'),
  ('s25_07', '2025-04-20T18:00:00Z', 'Pink City Oval', 'jai', 'lkn', 'completed', 'JAI won by 6 wickets', '2025'),
  ('s25_08', '2025-04-26T14:00:00Z', 'Gomti Green', 'lkn', 'amd', 'completed', 'LKN won by 9 runs', '2025'),
  ('s25_09', '2025-05-02T18:00:00Z', 'Sabarmati End', 'amd', 'mum', 'completed', 'MUM won by 8 wickets', '2025'),
  ('s25_10', '2025-05-28T18:00:00Z', 'Marina Grounds', 'che', 'mum', 'completed', 'CHE won the 2025 final by 5 wickets', '2025');

-- 2024 sample matches
insert into public.matches (id, scheduled_at, venue, home_team_id, away_team_id, status, result_summary, season_id) values
  ('s24_01', '2024-03-20T14:00:00Z', 'Marine Drive Arena', 'mum', 'del', 'completed', 'MUM won by 6 runs', '2024'),
  ('s24_02', '2024-03-22T18:00:00Z', 'Marina Grounds', 'che', 'hyd', 'completed', 'CHE won by 2 wickets', '2024'),
  ('s24_03', '2024-03-28T14:00:00Z', 'Tech Park Oval', 'blr', 'kol', 'completed', 'BLR won by 14 runs', '2024'),
  ('s24_04', '2024-04-05T18:00:00Z', 'Capital Ring', 'del', 'pun', 'completed', 'DEL won by 4 wickets', '2024'),
  ('s24_05', '2024-04-12T14:00:00Z', 'Fields Arena', 'pun', 'che', 'completed', 'CHE won by 7 runs', '2024'),
  ('s24_06', '2024-04-18T18:00:00Z', 'Hooghly Park', 'kol', 'mum', 'completed', 'MUM won by 3 wickets', '2024'),
  ('s24_07', '2024-04-24T14:00:00Z', 'Pink City Oval', 'jai', 'blr', 'completed', 'BLR won by 1 run', '2024'),
  ('s24_08', '2024-05-01T18:00:00Z', 'Charminar Stadium', 'hyd', 'del', 'completed', 'HYD won Super Over', '2024'),
  ('s24_09', '2024-05-10T14:00:00Z', 'Marine Drive Arena', 'mum', 'che', 'completed', 'MUM won Qualifier 1 by 9 runs', '2024'),
  ('s24_10', '2024-05-26T18:00:00Z', 'Marine Drive Arena', 'mum', 'che', 'completed', 'MUM won the 2024 final by 4 wickets', '2024');

-- Per-season leaders (archive)
alter table public.leaders add column season_id text;
update public.leaders set season_id = '2026' where season_id is null;
alter table public.leaders alter column season_id set not null;
alter table public.leaders add constraint leaders_season_fk foreign key (season_id) references public.seasons (id);

insert into public.leaders (category, rank, player_name, team_id, main_value, sub_value, season_id) values
  ('batting', 1, 'Karthik Selvan', 'che', '512 runs', 'Avg 42.7 · SR 141', '2025'),
  ('batting', 2, 'Rahul Verma', 'mum', '498 runs', 'Avg 45.3 · SR 149', '2025'),
  ('batting', 3, 'Arjun Nair', 'blr', '467 runs', 'Avg 38.9 · SR 158', '2025'),
  ('batting', 4, 'Vikram Singh', 'del', '431 runs', 'Avg 39.2 · SR 142', '2025'),
  ('batting', 5, 'Imran Qureshi', 'hyd', '398 runs', 'Avg 36.2 · SR 146', '2025'),
  ('bowling', 1, 'Sanjay Krishnan', 'che', '24 wickets', 'Econ 6.9', '2025'),
  ('bowling', 2, 'Yash Patel', 'blr', '21 wickets', 'Econ 7.3', '2025'),
  ('bowling', 3, 'Farhan Ali', 'hyd', '18 wickets', 'Econ 7.6', '2025'),
  ('bowling', 4, 'Aman Khurana', 'del', '17 wickets', 'Econ 8.1', '2025'),
  ('bowling', 5, 'Rohit Menon', 'mum', '16 wickets', 'Econ 8.4', '2025');

insert into public.leaders (category, rank, player_name, team_id, main_value, sub_value, season_id) values
  ('batting', 1, 'Rahul Verma', 'mum', '589 runs', 'Avg 49.1 · SR 155', '2024'),
  ('batting', 2, 'Karthik Selvan', 'che', '534 runs', 'Avg 44.5 · SR 136', '2024'),
  ('batting', 3, 'Vikram Singh', 'del', '476 runs', 'Avg 43.3 · SR 139', '2024'),
  ('batting', 4, 'Arjun Nair', 'blr', '445 runs', 'Avg 37.1 · SR 162', '2024'),
  ('batting', 5, 'Dev Banerjee', 'kol', '401 runs', 'Avg 36.5 · SR 151', '2024'),
  ('bowling', 1, 'Sanjay Krishnan', 'che', '26 wickets', 'Econ 6.6', '2024'),
  ('bowling', 2, 'Yash Patel', 'blr', '22 wickets', 'Econ 7.0', '2024'),
  ('bowling', 3, 'Pradeep Rao', 'mum', '19 wickets', 'Econ 7.8', '2024'),
  ('bowling', 4, 'Imran Qureshi', 'hyd', '18 wickets', 'Econ 7.4', '2024'),
  ('bowling', 5, 'Harpreet Gill', 'pun', '17 wickets', 'Econ 8.0', '2024');
