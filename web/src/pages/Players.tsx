import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageBanner from "../components/PageBanner";
import SeasonSelect from "../components/SeasonSelect";
import { normalizeLeagueLabel } from "../leagueBrand";
import { supabase } from "../supabaseClient";
import { playerDetailPath } from "../playerSlug";
import { DEFAULT_SEASON, useSeasonQuery } from "../season";
import type { Leader, Season, Team } from "../types";

type PlayerRow = {
  player_name: string;
  team_id: string;
  batting?: Leader;
  bowling?: Leader;
};

function mergeLeaders(leaders: Leader[]): PlayerRow[] {
  const m = new Map<string, PlayerRow>();
  for (const l of leaders) {
    const key = `${l.player_name}\0${l.team_id}`;
    let row = m.get(key);
    if (!row) {
      row = { player_name: l.player_name, team_id: l.team_id };
      m.set(key, row);
    }
    if (l.category === "batting") row.batting = l;
    else row.bowling = l;
  }
  return [...m.values()].sort((a, b) => a.player_name.localeCompare(b.player_name));
}

export default function Players() {
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
        const map: Record<string, Team> = {};
        for (const t of tRes.data as Team[]) map[t.id] = t;
        setTeams(map);
      }
    })();
  }, [season, seasons, setSeason]);

  const players = useMemo(() => mergeLeaders(leaders), [leaders]);
  const seasonMeta = seasons.find((s) => s.id === season);

  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <PageBanner variant="players" />
      <header className="page-header page-header-row">
        <div>
          <h1>Players</h1>
          <p className="muted">
            Featured squad members from the leaderboards — {normalizeLeagueLabel(seasonMeta?.label ?? season)}.
          </p>
        </div>
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={season} onChange={setSeason} />}
      </header>

      <div className="players-grid">
        {players.map((p) => {
          const t = teams[p.team_id];
          return (
            <Link
              key={`${p.player_name}-${p.team_id}`}
              to={playerDetailPath(p.team_id, p.player_name, season)}
              className="card player-card card-textured"
            >
              <div className="player-card-top" style={{ borderLeftColor: t?.primary_color ?? "var(--border)" }}>
                <strong className="player-card-name">{p.player_name}</strong>
                <span className="player-card-team muted">
                  <span className="player-card-dot" style={{ background: t?.primary_color ?? "#334155" }} />
                  {t?.name ?? p.team_id}
                  {t && <span className="player-card-code"> · {t.short_code}</span>}
                </span>
              </div>
              {p.batting && (
                <div className="player-card-stat">
                  <div className="player-card-stat-label">Batting</div>
                  <div>
                    <span className="player-card-main">{p.batting.main_value}</span>
                    {p.batting.sub_value && <span className="muted player-card-sub"> · {p.batting.sub_value}</span>}
                  </div>
                </div>
              )}
              {p.bowling && (
                <div className="player-card-stat">
                  <div className="player-card-stat-label">Bowling</div>
                  <div>
                    <span className="player-card-main">{p.bowling.main_value}</span>
                    {p.bowling.sub_value && <span className="muted player-card-sub"> · {p.bowling.sub_value}</span>}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {players.length === 0 && <p className="muted">No player data for this season.</p>}

      <p className="muted archive-hint">
        Rankings and caps: <Link to={`/stats?season=${season}`}>Stats hub</Link> ·{" "}
        <Link to={`/standings?season=${season}`}>Points table</Link>
      </p>
    </>
  );
}
