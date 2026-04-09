import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import type { MatchRow, Team } from "../types";

export default function MatchDetail({ session }: { session: Session | null }) {
  const { id } = useParams();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const [mRes, tRes] = await Promise.all([
        supabase.from("matches").select("*").eq("id", id).maybeSingle(),
        supabase.from("teams").select("*"),
      ]);
      if (mRes.error) setError(mRes.error.message);
      else setMatch(mRes.data as MatchRow | null);
      if (!tRes.error && tRes.data) {
        const map: Record<string, Team> = {};
        for (const t of tRes.data as Team[]) map[t.id] = t;
        setTeams(map);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!session?.user || !id) return;
    void (async () => {
      const { data } = await supabase
        .from("predictions")
        .select("picked_team_id")
        .eq("match_id", id)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data?.picked_team_id) setPicked(data.picked_team_id);
    })();
  }, [session, id]);

  async function savePick(teamId: string) {
    setMsg(null);
    setError(null);
    if (!session?.user || !id || !match) return;
    const { error: e } = await supabase.from("predictions").upsert(
      {
        user_id: session.user.id,
        match_id: id,
        picked_team_id: teamId,
      },
      { onConflict: "user_id,match_id" }
    );
    if (e) setError(e.message);
    else {
      setPicked(teamId);
      setMsg("Prediction saved.");
    }
  }

  if (error && !match) return <p className="error">{error}</p>;
  if (!match) return <p className="muted">Loading…</p>;

  const home = teams[match.home_team_id];
  const away = teams[match.away_team_id];

  return (
    <>
      <Link to="/matches" className="muted">
        ← Matches
      </Link>
      <div className="match-detail-hero card match-detail-hero--visual">
        <div className="match-detail-head">
          <span className={`badge ${match.status === "live" ? "live" : match.status === "completed" ? "done" : ""}`}>
            {match.status === "live" ? "● Live" : match.status}
          </span>
          <span className="muted">
            {new Date(match.scheduled_at).toLocaleString()} · {match.venue}
          </span>
        </div>
        <div className="match-detail-teams">
          <div className="md-team" style={{ borderColor: home?.primary_color ?? "var(--border)" }}>
            <span className="md-dot" style={{ background: home?.primary_color }} />
            <span className="md-code">{home?.short_code ?? match.home_team_id}</span>
            <span className="md-name">{home?.name}</span>
          </div>
          <span className="md-vs">vs</span>
          <div className="md-team" style={{ borderColor: away?.primary_color ?? "var(--border)" }}>
            <span className="md-dot" style={{ background: away?.primary_color }} />
            <span className="md-code">{away?.short_code ?? match.away_team_id}</span>
            <span className="md-name">{away?.name}</span>
          </div>
        </div>
        {match.result_summary && <p className="match-detail-result">{match.result_summary}</p>}
      </div>

      {match.status === "scheduled" && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h2>Pick a winner</h2>
          {!session && <p className="muted">Sign in to save a prediction.</p>}
          {session && (
            <>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button type="button" className="btn primary" onClick={() => savePick(match.home_team_id)}>
                  {home?.name ?? "Home"}
                </button>
                <button type="button" className="btn primary" onClick={() => savePick(match.away_team_id)}>
                  {away?.name ?? "Away"}
                </button>
              </div>
              {picked && (
                <p className="muted" style={{ marginTop: "0.75rem" }}>
                  Your pick: <strong>{teams[picked]?.short_code ?? picked}</strong>
                </p>
              )}
              {msg && <p style={{ marginTop: "0.5rem" }}>{msg}</p>}
              {error && <p className="error">{error}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
