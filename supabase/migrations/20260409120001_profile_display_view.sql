-- Minimal columns for leaderboards (avoids exposing favorite_team_id to everyone)
create or replace view public.profile_display as
  select id, display_name from public.profiles;

grant select on public.profile_display to anon, authenticated;
