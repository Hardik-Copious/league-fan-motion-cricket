import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MatchCard from "../components/MatchCard";
import PageBanner from "../components/PageBanner";
import SeasonSelect from "../components/SeasonSelect";
import { supabase } from "../supabaseClient";
import { DEFAULT_SEASON, useSeasonQuery } from "../season";
import type { MatchRow, Season, Team } from "../types";

type Filter = "all" | "live" | "scheduled" | "completed";

export default function Matches() {
  const { season, setSeason } = useSeasonQuery();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

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

      const [mRes, tRes] = await Promise.all([
        supabase.from("matches").select("*").eq("season_id", sid).order("scheduled_at", { ascending: true }),
        supabase.from("teams").select("*"),
      ]);
      if (mRes.error) setError(mRes.error.message);
      else setMatches((mRes.data as MatchRow[]) ?? []);
      if (!tRes.error && tRes.data) {
        const map: Record<string, Team> = {};
        for (const t of tRes.data as Team[]) map[t.id] = t;
        setTeams(map);
      }
    })();
  }, [season, seasons, setSeason]);

  const filtered = useMemo(() => {
    if (filter === "all") return matches;
    return matches.filter((m) => m.status === filter);
  }, [matches, filter]);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "live", label: "Live" },
    { key: "scheduled", label: "Upcoming" },
    { key: "completed", label: "Results" },
  ];

  const seasonMeta = seasons.find((s) => s.id === season);

  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <PageBanner variant="matches" />
      <header className="page-header page-header-row">
        <div>
          <h1>Schedule & results</h1>
          <p className="muted">{seasonMeta?.tagline ?? "Pick a season to browse the archive."}</p>
        </div>
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={season} onChange={setSeason} />}
      </header>

      <div className="filter-chips" role="tablist" aria-label="Match filter">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={filter === c.key}
            className={`filter-chip ${filter === c.key ? "active" : ""}`}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="match-grid">
        {filtered.map((m) => (
          <MatchCard key={m.id} match={m} home={teams[m.home_team_id]} away={teams[m.away_team_id]} />
        ))}
      </div>
      {filtered.length === 0 && <p className="muted">No matches in this filter.</p>}

      <p className="muted archive-hint">
        Browsing <strong>{seasonMeta?.label ?? season}</strong>.{" "}
        <Link to={`/standings?season=${season}`}>See points table</Link> ·{" "}
        <Link to={`/stats?season=${season}`}>Season stats</Link>
      </p>
    </>
  );
}
