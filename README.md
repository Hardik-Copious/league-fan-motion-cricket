# League Fan (demo)

League Fan’s interactive motion cricket mode with laptop stadium host, phone bat pairing, and multiplayer feel.

Fictional league sample: **React (Vite) web**, **Flutter mobile**, **Supabase** backend. Not affiliated with any real tournament.

## Layout

| Path | Purpose |
|------|---------|
| `supabase/migrations/` | Schema, RLS, `seasons` + multi-year matches/standings/leaders, `profile_display` |
| `web/public/images/` | AI-generated hero & texture PNGs (decorative only) |
| `mobile/assets/images/` | Same images bundled for Flutter home header |
| `web/` | React + Vite + `@supabase/supabase-js` |
| `mobile/` | Flutter + `supabase_flutter` |

## 1. Supabase (cloud)

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Providers → Email**: enable email/password (or magic link).
3. **Authentication → URL configuration**: add `http://localhost:5173` under Redirect URLs for local web.
4. Apply database migrations:
   - **Option A (CLI, from repo root `league-fan-app/`):** this repo already has `supabase init` + `supabase/config.toml`. You must authenticate **on your machine** (the CLI cannot push without your token / DB password):
     ```bash
     cd league-fan-app
     npm run db:login
     # Or: export SUPABASE_ACCESS_TOKEN=...  (Dashboard → Account → Access Tokens)
     npm run db:link
     # When prompted, paste your database password (Dashboard → Project Settings → Database).
     # Non-interactive: npx supabase@latest link --project-ref zmsfjhrazepuetbcnrco -p 'YOUR_DB_PASSWORD'
     npm run db:push
     ```
     `db:link` is configured for project ref `zmsfjhrazepuetbcnrco`; change the script in `package.json` if you use another project.
   - **Option B:** **SQL Editor** → run each file in `supabase/migrations/` in filename order.

## 2. Web app

```bash
cd web
cp .env.example .env.local
# Edit .env.local: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## 3. Mobile app

Pass your project URL and **anon / publishable** key at run time:

```bash
cd mobile
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR_REF.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your_anon_key
```

**Android emulator:** `localhost` on the host is `10.0.2.2` only if you point the app at a server running on your machine. Here the app talks to **Supabase cloud**, so use the real `https://…supabase.co` URL.

## Features

- **10 fictional franchises** (city, venue, colours, captain blurb), **27 fixtures** (results + live + upcoming), **points table** with playoff “Q” markers  
- **Stats hub** (`/stats`): orange/purple-cap style leaderboards (`leaders` table)  
- Home: hero, featured match, latest results, stats snapshot  
- Match schedule filters: All / Live / Upcoming / Results  
- Sign up / sign in (email), profile + favorite team, predictions on scheduled matches (RLS)  
- Games: demo scores + leaderboard  

**Note:** Migration `20260410120000_expand_demo_league.sql` **clears** prior `teams`/`matches` seed data and **resets** `favorite_team_id`, `predictions`, and `game_sessions` (demo reset).

**Seasons:** `20260411140000_seasons_history.sql` adds `seasons` plus `season_id` on `matches`, `standings`, and `leaders`. Web uses `?season=2025` on Matches / Table / Stats. Home shows **Hall of champions** for past winners.

**Art:** Hero/texture images are **AI-generated** placeholders for a premium look — replace with licensed art for production.

## Security

- Never commit real `.env` files or the **service_role** key.  
- Clients only use the **anon / publishable** key; protect data with **RLS** (included in migrations).
