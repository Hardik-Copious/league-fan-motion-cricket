import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageBanner from "../components/PageBanner";
import SeasonSelect from "../components/SeasonSelect";
import { supabase } from "../supabaseClient";
import { playerDetailPath } from "../playerSlug";
import { DEFAULT_SEASON, useSeasonQuery } from "../season";
import type { Leader, Season, Team } from "../types";

export default function Stats() {
  const { season, setSeason } = useSeasonQuery();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const sRes = await supabase.from("seasons").select("*").order("year", { ascending: false });
      setSeasons((sRes.data as Season[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (seasons.length === 0) return;
    void (async () => {
      const sid = seasons.some((s) => s.id === season) ? season : DEFAULT_SEASON;
      if (sid !== season) setSeason(sid);

      const [lRes, tRes] = await Promise.all([
        supabase.from("leaders").select("*").eq("season_id", sid).order("category", { ascending: true }).order("rank", { ascending: true }),
        supabase.from("teams").select("*"),
      ]);
      if (lRes.error) setError(lRes.error.message);
      else setLeaders((lRes.data as Leader[]) ?? []);
      if (!tRes.error && tRes.data) {
        const m: Record<string, Team> = {};
        for (const t of tRes.data as Team[]) m[t.id] = t;
        setTeams(m);
      }
    })();
  }, [season, seasons, setSeason]);

  const { batting, bowling } = useMemo(() => {
    return {
      batting: leaders.filter((l) => l.category === "batting"),
      bowling: leaders.filter((l) => l.category === "bowling"),
    };
  }, [leaders]);

  const seasonMeta = seasons.find((s) => s.id === season);

  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <PageBanner variant="stats" />
      <header className="page-header page-header-row">
        <div>
          <h1>Stats & awards</h1>
          <p className="muted">Orange & purple cap style boards — {seasonMeta?.label ?? season}.</p>
        </div>
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={season} onChange={setSeason} />}
      </header>

      <div className="stats-grid">
        <section className="card stats-panel card-textured">
          <h2 className="stats-panel-title">Orange cap race</h2>
          <p className="muted stats-panel-sub">Most runs (sample)</p>
          <ul className="leader-list">
            {batting.map((l) => (
              <li key={l.id} className="leader-row">
                <span className="leader-rank">{l.rank}</span>
                <div className="leader-info">
                  <strong>
                    <Link to={playerDetailPath(l.team_id, l.player_name, season)}>{l.player_name}</Link>
                  </strong>
                  <span className="muted">
                    <Link to={`/teams/${l.team_id}`}>{teams[l.team_id]?.short_code ?? l.team_id}</Link>
                  </span>
                </div>
                <div className="leader-stats">
                  <span className="leader-main">{l.main_value}</span>
                  {l.sub_value && <span className="muted leader-sub">{l.sub_value}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card stats-panel card-textured">
          <h2 className="stats-panel-title">Purple cap race</h2>
          <p className="muted stats-panel-sub">Most wickets (sample)</p>
          <ul className="leader-list">
            {bowling.map((l) => (
              <li key={l.id} className="leader-row">
                <span className="leader-rank">{l.rank}</span>
                <div className="leader-info">
                  <strong>
                    <Link to={playerDetailPath(l.team_id, l.player_name, season)}>{l.player_name}</Link>
                  </strong>
                  <span className="muted">
                    <Link to={`/teams/${l.team_id}`}>{teams[l.team_id]?.short_code ?? l.team_id}</Link>
                  </span>
                </div>
                <div className="leader-stats">
                  <span className="leader-main">{l.main_value}</span>
                  {l.sub_value && <span className="muted leader-sub">{l.sub_value}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="muted archive-hint">
        <Link to={`/players?season=${season}`}>All players this season</Link>
      </p>
    </>
  );
}
