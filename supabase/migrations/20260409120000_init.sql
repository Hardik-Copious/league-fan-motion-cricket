-- Demo league (fictional). Apply via Supabase CLI (`supabase db push`) or SQL editor.

create extension if not exists "pgcrypto";

create table public.teams (
  id text primary key,
  name text not null,
  short_code text not null,
  home_venue text,
  primary_color text not null default '#334155',
  blurb text
);

create table public.matches (
  id text primary key,
  scheduled_at timestamptz not null,
  venue text not null,
  home_team_id text not null references public.teams (id),
  away_team_id text not null references public.teams (id),
  status text not null check (status in ('scheduled', 'live', 'completed')),
  result_summary text
);

create table public.standings (
  team_id text primary key references public.teams (id),
  played int not null default 0,
  won int not null default 0,
  lost int not null default 0,
  points int not null default 0,
  nrr numeric not null default 0
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  favorite_team_id text references public.teams (id),
  updated_at timestamptz not null default now()
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  picked_team_id text not null references public.teams (id),
  created_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  game_type text not null,
  score int not null,
  duration_ms int,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.standings enable row level security;
alter table public.profiles enable row level security;
alter table public.predictions enable row level security;
alter table public.game_sessions enable row level security;

create policy teams_read_all on public.teams for select using (true);
create policy matches_read_all on public.matches for select using (true);
create policy standings_read_all on public.standings for select using (true);

create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id);

create policy predictions_select_own on public.predictions for select using (auth.uid() = user_id);

create policy predictions_insert_own on public.predictions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.matches m where m.id = match_id and m.status = 'scheduled')
  );

create policy predictions_update_own on public.predictions for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.matches m where m.id = match_id and m.status = 'scheduled')
  );

create policy predictions_delete_own on public.predictions for delete
  using (
    auth.uid() = user_id
    and exists (select 1 from public.matches m where m.id = match_id and m.status = 'scheduled')
  );

create policy game_sessions_insert_auth on public.game_sessions for insert
  with check (auth.uid() = user_id);

create policy game_sessions_read_all on public.game_sessions for select using (true);

insert into public.teams (id, name, short_code, home_venue, primary_color, blurb) values
  ('red', 'Red City Royals', 'RCR', 'Central Stadium', '#C41E3A', 'Heart of the capital.'),
  ('blue', 'Blue Coast Titans', 'BCT', 'Harbour Ground', '#1E3A8A', 'Sea breeze and big hits.'),
  ('green', 'Green Valley Kings', 'GVK', 'Hills Arena', '#166534', 'High altitude, higher intent.'),
  ('gold', 'Gold Desert Suns', 'GDS', 'Oasis Park', '#A16207', 'Late sunsets, late drama.');

insert into public.matches (id, scheduled_at, venue, home_team_id, away_team_id, status, result_summary) values
  ('m1', '2026-04-10T14:00:00Z', 'Central Stadium', 'red', 'blue', 'completed', 'RCR won by 6 wickets'),
  ('m2', '2026-04-11T14:00:00Z', 'Hills Arena', 'green', 'gold', 'completed', 'GVK won by 22 runs'),
  ('m3', '2026-04-12T14:00:00Z', 'Harbour Ground', 'blue', 'green', 'scheduled', null),
  ('m4', '2026-04-14T14:00:00Z', 'Oasis Park', 'gold', 'red', 'scheduled', null);

insert into public.standings (team_id, played, won, lost, points, nrr) values
  ('green', 6, 4, 2, 8, 0.412),
  ('red', 6, 4, 2, 8, 0.205),
  ('blue', 6, 3, 3, 6, -0.088),
  ('gold', 6, 1, 5, 2, -0.531);
