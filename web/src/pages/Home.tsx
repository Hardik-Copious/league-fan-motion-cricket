import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import MatchCard from "../components/MatchCard";
import { DEFAULT_SEASON } from "../season";
import type { Leader, MatchRow, Season, Team } from "../types";

export default function Home({ session }: { session: Session | null }) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [sRes, mRes, tRes, lRes] = await Promise.all([
        supabase.from("seasons").select("*").order("year", { ascending: false }),
        supabase.from("matches").select("*").eq("season_id", DEFAULT_SEASON).order("scheduled_at", { ascending: true }),
        supabase.from("teams").select("*"),
        supabase.from("leaders").select("*").eq("season_id", DEFAULT_SEASON).order("category", { ascending: true }).order("rank", { ascending: true }),
      ]);
      if (sRes.error) setError(sRes.error.message);
      else setSeasons((sRes.data as Season[]) ?? []);
      if (mRes.error) setError(mRes.error.message);
      else setMatches((mRes.data as MatchRow[]) ?? []);
      if (!tRes.error && tRes.data) {
        const map: Record<string, Team> = {};
        for (const t of tRes.data as Team[]) map[t.id] = t;
        setTeams(map);
      }
      if (!lRes.error && lRes.data) setLeaders((lRes.data as Leader[]) ?? []);
    })();
  }, []);

  const pastChampions = useMemo(() => seasons.filter((s) => s.champion_team_id), [seasons]);

  const featured = useMemo(() => {
    const cur = matches.filter((m) => m.season_id === DEFAULT_SEASON);
    const live = cur.find((m) => m.status === "live");
    if (live) return live;
    const next = cur.find((m) => m.status === "scheduled");
    if (next) return next;
    return [...cur].filter((m) => m.status === "completed").pop() ?? null;
  }, [matches]);

  const recentResults = useMemo(() => {
    return [...matches]
      .filter((m) => m.status === "completed")
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
      .slice(0, 4);
  }, [matches]);

  const topBat = useMemo(() => leaders.filter((l) => l.category === "batting").slice(0, 3), [leaders]);
  const topBowl = useMemo(() => leaders.filter((l) => l.category === "bowling").slice(0, 3), [leaders]);

  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <header className="hero hero--cricket">
        <div className="hero-visual" aria-hidden />
        <div className="hero-cricket-deco" aria-hidden>
          <span className="hero-cricket-ball" />
          <span className="hero-cricket-ball hero-cricket-ball--delay" />
        </div>
        <div className="hero-inner">
          <div className="hero-badge">Hogwarts Premier League · {DEFAULT_SEASON}</div>
          <p className="hero-secondary-title">Willow &amp; Wickets</p>
          <h1 className="hero-title">Where every over tells a story</h1>
          <p className="hero-sub">
            T20 league — multi-season archive, live-style match centre, stats, and fan picks. A playful fan app inspired
            by the wizarding world.
          </p>
          <div className="hero-actions">
            <Link to={`/matches?season=${DEFAULT_SEASON}`} className="btn primary">
              Full schedule
            </Link>
            <Link to={`/standings?season=${DEFAULT_SEASON}`} className="btn">
              Points table
            </Link>
            <Link to={`/stats?season=${DEFAULT_SEASON}`} className="btn">
              Stats hub
            </Link>
            <Link to={`/players?season=${DEFAULT_SEASON}`} className="btn">
              Players
            </Link>
          </div>
        </div>
      </header>

      {pastChampions.length > 0 && (
        <section className="section">
          <div className="champions-section-head">
            <h2 className="section-title">Hall of champions</h2>
            <p className="muted section-lead">Previous seasons — tap a year for archived table &amp; stats.</p>
          </div>
          <div className="champions-row">
            {pastChampions.map((s) => {
              const champ = s.champion_team_id ? teams[s.champion_team_id] : null;
              const runner = s.runner_up_team_id ? teams[s.runner_up_team_id] : null;
              return (
                <Link key={s.id} to={`/standings?season=${s.id}`} className="card champion-card champion-card-link">
                  <div className="champion-year">{s.year}</div>
                  <div className="champion-trophy" aria-hidden>
                    🏆
                  </div>
                  <div className="champion-name" style={{ color: champ?.primary_color ?? "var(--gold)" }}>
                    {champ?.name ?? "TBD"}
                  </div>
                  <div className="muted champion-sub">{s.tagline}</div>
                  {runner && (
                    <div className="champion-runner muted">
                      Runner-up: <strong>{runner.short_code}</strong>
                    </div>
                  )}
                  <span className="champion-cta">View {s.year} table →</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {featured && (
        <section className="section">
          <h2 className="section-title">{featured.status === "live" ? "Live now" : featured.status === "scheduled" ? "Next up" : "Featured"}</h2>
          <div className="section-visual-strip" aria-hidden />
          <MatchCard match={featured} home={teams[featured.home_team_id]} away={teams[featured.away_team_id]} />
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Latest results · {DEFAULT_SEASON}</h2>
          <Link to={`/matches?season=${DEFAULT_SEASON}`} className="section-link">
            All matches →
          </Link>
        </div>
        <div className="section-visual-strip" aria-hidden />
        <div className="match-grid">
          {recentResults.map((m) => (
            <MatchCard key={m.id} match={m} home={teams[m.home_team_id]} away={teams[m.away_team_id]} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Leaderboard snapshot · {DEFAULT_SEASON}</h2>
          <Link to={`/stats?season=${DEFAULT_SEASON}`} className="section-link">
            Full stats →
          </Link>
        </div>
        <div className="section-visual-strip section-visual-strip--stats" aria-hidden />
        <div className="stats-snapshot">
          <div className="card stats-snap-card card-textured">
            <h3>Runs</h3>
            <ol className="snap-list">
              {topBat.map((l) => (
                <li key={l.id}>
                  <span>{l.player_name}</span>
                  <span className="muted">{l.main_value}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card stats-snap-card card-textured">
            <h3>Wickets</h3>
            <ol className="snap-list">
              {topBowl.map((l) => (
                <li key={l.id}>
                  <span>{l.player_name}</span>
                  <span className="muted">{l.main_value}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Explore</h2>
        <div className="explore-grid">
          <Link
            to={`/players?season=${DEFAULT_SEASON}`}
            className="card explore-tile explore-tile--visual explore-tile--visual-players"
          >
            <span className="explore-icon">🏏</span>
            <strong>Players</strong>
            <span className="muted">Runs, wickets &amp; squads</span>
          </Link>
          <Link to="/teams" className="card explore-tile explore-tile--visual explore-tile--visual-teams">
            <span className="explore-icon">◎</span>
            <strong>Teams</strong>
            <span className="muted">Venues, colours, captains</span>
          </Link>
          <Link to="/games" className="card explore-tile explore-tile--visual explore-tile--visual-games">
            <span className="explore-icon">◇</span>
            <strong>Fan games</strong>
            <span className="muted">Motion cricket & leaderboard</span>
          </Link>
          <Link to="/book" className="card explore-tile explore-tile--visual explore-tile--visual-tickets">
            <span className="explore-icon">🎟</span>
            <strong>Tickets</strong>
            <span className="muted">Mock booking flow</span>
          </Link>
          {!session && (
            <Link
              to="/auth"
              className="card explore-tile explore-tile-accent explore-tile--visual explore-tile--visual-auth"
            >
              <span className="explore-icon">✦</span>
              <strong>Sign in</strong>
              <span className="muted">Predictions & profile</span>
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
