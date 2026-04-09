import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import SeasonSelect from "../components/SeasonSelect";
import { getPlayerBatInfo } from "../data/playerBat";
import { playerNameToSlug } from "../playerSlug";
import { supabase } from "../supabaseClient";
import { DEFAULT_SEASON } from "../season";
import type { Leader, Season, Team } from "../types";

export default function PlayerDetail() {
  const { teamId, playerSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const season = searchParams.get("season") ?? DEFAULT_SEASON;

  const setSeason = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("season", id);
    setSearchParams(next, { replace: true });
  };

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [batting, setBatting] = useState<Leader | null>(null);
  const [bowling, setBowling] = useState<Leader | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const resolvedSeason = useMemo(() => {
    if (!seasonsLoaded) return null;
    return seasons.some((s) => s.id === season) ? season : DEFAULT_SEASON;
  }, [seasons, season, seasonsLoaded]);

  useEffect(() => {
    void (async () => {
      const sRes = await supabase.from("seasons").select("*").order("year", { ascending: false });
      setSeasons((sRes.data as Season[]) ?? []);
      setSeasonsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!seasonsLoaded || seasons.length === 0) return;
    if (!seasons.some((s) => s.id === season)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("season", DEFAULT_SEASON);
          return next;
        },
        { replace: true }
      );
    }
  }, [seasonsLoaded, seasons, season, setSearchParams]);

  useEffect(() => {
    if (!teamId || !playerSlug || resolvedSeason == null) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      setBatting(null);
      setBowling(null);
      setPlayerName(null);

      const sid = resolvedSeason;

      const [lRes, tRes] = await Promise.all([
        supabase.from("leaders").select("*").eq("season_id", sid).eq("team_id", teamId),
        supabase.from("teams").select("*").eq("id", teamId).maybeSingle(),
      ]);

      if (cancelled) return;

      if (lRes.error) {
        setError(lRes.error.message);
        setLoading(false);
        return;
      }

      if (tRes.error) {
        setError(tRes.error.message);
        setLoading(false);
        return;
      }

      setTeam(tRes.data as Team | null);

      const rows = ((lRes.data as Leader[]) ?? []).filter((l) => playerNameToSlug(l.player_name) === playerSlug);
      if (rows.length === 0) {
        setPlayerName(null);
        setLoading(false);
        return;
      }

      setPlayerName(rows[0].player_name);
      setBatting(rows.find((r) => r.category === "batting") ?? null);
      setBowling(rows.find((r) => r.category === "bowling") ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, playerSlug, resolvedSeason]);

  const seasonMeta = useMemo(() => seasons.find((s) => s.id === (resolvedSeason ?? season)), [seasons, resolvedSeason, season]);

  const batInfo = playerSlug ? getPlayerBatInfo(playerSlug) : null;

  if (!teamId || !playerSlug) {
    return <p className="muted">Invalid player URL.</p>;
  }

  if (!seasonsLoaded || resolvedSeason == null) {
    return <p className="muted">Loading…</p>;
  }

  if (error) return <p className="error">{error}</p>;
  if (loading) return <p className="muted">Loading…</p>;

  if (!playerName || !team) {
    return (
      <>
        <Link to={`/players?season=${resolvedSeason}`} className="muted">
          ← Players
        </Link>
        <header className="page-header">
          <h1>Player not found</h1>
          <p className="muted">No leaderboard entry for this name and team in {seasonMeta?.label ?? resolvedSeason}.</p>
        </header>
        <p className="muted">
          <Link to={`/players?season=${resolvedSeason}`}>Back to players</Link>
          {" · "}
          <Link to={`/stats?season=${resolvedSeason}`}>Stats hub</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <Link to={`/players?season=${resolvedSeason}`} className="muted">
        ← Players
      </Link>

      <header
        className="team-hero player-detail-hero team-hero--art-player"
        style={{
          borderLeftColor: team.primary_color,
        }}
      >
        <div className="team-hero-strip" style={{ background: team.primary_color }} />
        <div className="team-hero-inner">
          <span className="team-hero-code">{seasonMeta?.label ?? resolvedSeason}</span>
          <h1>{playerName}</h1>
          <p className="muted">
            <Link to={`/teams/${team.id}`} className="player-detail-team-link">
              <span className="player-card-dot" style={{ background: team.primary_color }} />
              {team.name} · {team.short_code}
            </Link>
          </p>
          <p className="muted player-detail-tagline">Leaderboard snapshot (demo data).</p>
        </div>
      </header>

      {batInfo && (
        <div className="card player-bat-card card-textured" style={{ marginTop: "1rem" }}>
          <h2 className="stats-panel-title">Bat profile</h2>
          <p className="player-detail-stat-main">{batInfo.batName}</p>
          <p className="muted">{batInfo.batDetail}</p>
          <p style={{ marginTop: "0.75rem" }}>
            <Link to="/book" className="btn primary">
              Book match tickets
            </Link>
          </p>
        </div>
      )}

      <div className="page-header-row" style={{ marginBottom: "1rem", alignItems: "center" }}>
        <span className="muted" style={{ fontSize: "0.9rem" }}>
          Season
        </span>
        {seasons.length > 0 && <SeasonSelect seasons={seasons} value={resolvedSeason} onChange={setSeason} />}
      </div>

      <div className="stats-grid">
        {batting && (
          <section className="card stats-panel card-textured">
            <h2 className="stats-panel-title">Batting</h2>
            <p className="muted stats-panel-sub">Orange cap board · rank {batting.rank}</p>
            <p className="player-detail-stat-main">{batting.main_value}</p>
            {batting.sub_value && <p className="muted">{batting.sub_value}</p>}
          </section>
        )}
        {bowling && (
          <section className="card stats-panel card-textured">
            <h2 className="stats-panel-title">Bowling</h2>
            <p className="muted stats-panel-sub">Purple cap board · rank {bowling.rank}</p>
            <p className="player-detail-stat-main">{bowling.main_value}</p>
            {bowling.sub_value && <p className="muted">{bowling.sub_value}</p>}
          </section>
        )}
      </div>

      {!batting && !bowling && (
        <p className="muted">No stat rows for this player in this season.</p>
      )}

      <p className="muted archive-hint">
        <Link to={`/stats?season=${resolvedSeason}`}>Full leaderboards</Link>
        {" · "}
        <Link to={`/standings?season=${resolvedSeason}`}>Points table</Link>
        {" · "}
        <Link to={`/matches?season=${resolvedSeason}`}>Matches</Link>
      </p>
    </>
  );
}
