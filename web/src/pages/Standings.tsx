import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageBanner from "../components/PageBanner";
import SeasonSelect from "../components/SeasonSelect";
import { supabase } from "../supabaseClient";
import { DEFAULT_SEASON, useSeasonQuery } from "../season";
import type { Season, Standing, Team } from "../types";

const PLAYOFF_SPOTS = 4;

export default function Standings() {
  const { season, setSeason } = useSeasonQuery();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [rows, setRows] = useState<Standing[]>([]);
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

      const [sRes, tRes] = await Promise.all([
        supabase.from("standings").select("*").eq("season_id", sid).order("points", { ascending: false }).order("nrr", { ascending: false }),
        supabase.from("teams").select("*"),
      ]);
      if (sRes.error) setError(sRes.error.message);
      else setRows((sRes.data as Standing[]) ?? []);
      if (!tRes.error && tRes.data) {
        const map: Record<string, Team> = {};
        for (const t of tRes.data as Team[]) map[t.id] = t;
        setTeams(map);
      }
    })();
  }, [season, seasons, setSeason]);

  const seasonMeta = seasons.find((s) => s.id === season);
  const isCurrent = season === DEFAULT_SEASON;

  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <PageBanner variant="standings" />
      <header className="page-header page-header-row">
        <div>
          <h1>Points table</h1>
          <p className="muted">
            {isCurrent ? `Top ${PLAYOFF_SPOTS} in the playoff zone (demo).` : `Final / archived table for ${seasonMeta?.label ?? season}.`}
          </p>
        </div>
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={season} onChange={setSeason} />}
      </header>

      <div className="card table-card card-textured" style={{ padding: 0, overflow: "hidden" }}>
        <table className="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>L</th>
              <th>Pts</th>
              <th>NRR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const t = teams[r.team_id];
              const inPlayoff = isCurrent && i < PLAYOFF_SPOTS;
              return (
                <tr key={`${r.season_id}-${r.team_id}`} className={inPlayoff ? "row-playoff" : undefined}>
                  <td>{i + 1}</td>
                  <td>
                    <Link to={`/teams/${r.team_id}`} className="standings-team">
                      <span className="standings-dot" style={{ background: t?.primary_color ?? "#334155" }} />
                      <span>{t?.name ?? r.team_id}</span>
                      {inPlayoff && (
                        <span className="badge badge-q" title="Playoff zone">
                          Q
                        </span>
                      )}
                    </Link>
                  </td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.lost}</td>
                  <td>
                    <strong>{r.points}</strong>
                  </td>
                  <td className={r.nrr >= 0 ? "nrr-pos" : "nrr-neg"}>{Number(r.nrr).toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted table-footnote">P = played · W = won · L = lost · Pts = points · NRR = net run rate</p>
    </>
  );
}
