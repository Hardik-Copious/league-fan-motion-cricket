import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MatchCard from "../components/MatchCard";
import { supabase } from "../supabaseClient";
import type { MatchRow, Season, Team } from "../types";

export default function TeamDetail() {
  const { id } = useParams();
  const [team, setTeam] = useState<Team | null>(null);
  const [fixtures, setFixtures] = useState<MatchRow[]>([]);
  const [seasons, setSeasons] = useState<Record<string, Season>>({});
  const [teamsMap, setTeamsMap] = useState<Record<string, Team>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const [teamRes, allMatches, allTeams, sRes] = await Promise.all([
        supabase.from("teams").select("*").eq("id", id).maybeSingle(),
        supabase.from("matches").select("*").order("scheduled_at", { ascending: false }),
        supabase.from("teams").select("*"),
        supabase.from("seasons").select("*"),
      ]);
      if (teamRes.error) setError(teamRes.error.message);
      else setTeam(teamRes.data as Team | null);
      const list = (allMatches.data as MatchRow[]) ?? [];
      const mine = list.filter((m) => m.home_team_id === id || m.away_team_id === id);
      setFixtures(mine);
      if (allTeams.data) {
        const m: Record<string, Team> = {};
        for (const t of allTeams.data as Team[]) m[t.id] = t;
        setTeamsMap(m);
      }
      if (sRes.data) {
        const sm: Record<string, Season> = {};
        for (const s of sRes.data as Season[]) sm[s.id] = s;
        setSeasons(sm);
      }
    })();
  }, [id]);

  const bySeason = useMemo(() => {
    const map = new Map<string, MatchRow[]>();
    for (const m of fixtures) {
      const sid = m.season_id ?? "2026";
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(m);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [fixtures]);

  if (error) return <p className="error">{error}</p>;
  if (!team) return <p className="muted">Loading…</p>;

  return (
    <>
      <Link to="/teams" className="muted">
        ← Teams
      </Link>

      <header
        className="team-hero team-hero--art"
        style={{
          borderLeftColor: team.primary_color,
        }}
      >
        <div className="team-hero-strip" style={{ background: team.primary_color }} />
        <div className="team-hero-inner">
          <span className="team-hero-code">{team.short_code}</span>
          <h1>{team.name}</h1>
          <p className="muted">
            {team.city ?? "—"} · Est. {team.founded_year ?? "—"}
          </p>
          <p className="muted">{team.home_venue}</p>
        </div>
      </header>

      {team.blurb && <p className="team-blurb">{team.blurb}</p>}

      {bySeason.map(([sid, list]) => {
        const meta = seasons[sid];
        const upcoming = list.filter((m) => m.status === "scheduled" || m.status === "live");
        const done = list.filter((m) => m.status === "completed");
        if (upcoming.length === 0 && done.length === 0) return null;
        return (
          <section key={sid} className="section">
            <h2 className="section-title">{meta?.label ?? `Season ${sid}`}</h2>
            {upcoming.length > 0 && (
              <>
                <h3 className="subsection-title">Upcoming & live</h3>
                <div className="match-grid">
                  {upcoming.map((m) => (
                    <MatchCard key={m.id} match={m} home={teamsMap[m.home_team_id]} away={teamsMap[m.away_team_id]} />
                  ))}
                </div>
              </>
            )}
            {done.length > 0 && (
              <>
                <h3 className="subsection-title">Results</h3>
                <div className="match-grid">
                  {done.slice(0, 12).map((m) => (
                    <MatchCard key={m.id} match={m} home={teamsMap[m.home_team_id]} away={teamsMap[m.away_team_id]} />
                  ))}
                </div>
                {done.length > 12 && (
                  <p className="muted">
                    <Link to={`/matches?season=${sid}`}>All {done.length} results for {sid} →</Link>
                  </p>
                )}
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
