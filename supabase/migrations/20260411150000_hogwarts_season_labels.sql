-- Rebrand season labels to Hogwarts Premier League (for DBs seeded with older "Demo" copy).
update public.seasons
set label = replace(label, 'Demo Premier League', 'Hogwarts Premier League')
where label like '%Demo Premier League%';

update public.seasons
set tagline = case id
  when '2024' then 'The inaugural chapter — floodlights and moving portraits'
  when '2025' then 'Spin, pace, and last-ball theatre under enchanted lights'
  when '2026' then 'Current season — race to the House Cup'
  else tagline
end
where id in ('2024', '2025', '2026');
