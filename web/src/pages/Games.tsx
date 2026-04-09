import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import PageBanner from "../components/PageBanner";
import { MOTION_CRICKET_GAME_TYPE } from "../games/motionCricket";
import { loadPreviousMatches, type PreviousMotionMatch } from "../lib/motionMatchHistory";
import { supabase } from "../supabaseClient";

type Row = {
  id: string;
  score: number;
  game_type: string;
  created_at: string;
  display_name: string | null;
};

async function loadLeaderboard(gameType: string): Promise<Row[]> {
  const { data, error: e } = await supabase
    .from("game_sessions")
    .select("id, score, game_type, created_at, user_id")
    .eq("game_type", gameType)
    .order("score", { ascending: false })
    .limit(20);
  if (e) throw new Error(e.message);
  const sessions = data ?? [];
  const ids = [...new Set(sessions.map((s: { user_id: string | null }) => s.user_id).filter(Boolean))] as string[];
  let names: Record<string, string | null> = {};
  if (ids.length) {
    const { data: profs } = await supabase.from("profile_display").select("id, display_name").in("id", ids);
    names = Object.fromEntries((profs ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name]));
  }
  return sessions.map((r: { id: string; score: number; game_type: string; created_at: string; user_id: string | null }) => ({
    id: r.id,
    score: r.score,
    game_type: r.game_type,
    created_at: r.created_at,
    display_name: r.user_id ? names[r.user_id] ?? null : null,
  }));
}

export default function Games({ session: _session }: { session: Session | null }) {
  const [motionRows, setMotionRows] = useState<Row[]>([]);
  const [previous, setPrevious] = useState<PreviousMotionMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const m = await loadLeaderboard(MOTION_CRICKET_GAME_TYPE);
      setMotionRows(m);
      setPrevious(loadPreviousMatches());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageBanner variant="games" />
      <h1>Games</h1>
      <p className="muted">
        Motion cricket uses your <strong>laptop webcam</strong> (pose) and <strong>phone sensors</strong> (swing) via
        Supabase Realtime. Only scores you save are stored in Supabase. Use <strong>HTTPS</strong> or{" "}
        <code>localhost</code> for camera and sensors.
      </p>

      <div className="card card-textured">
        <h2>Motion cricket (CricFit-style)</h2>
        <p className="muted">
          Start or join with a shared <strong>Match ID</strong>. Choose role (Laptop/Phone), enter the same ID, or scan
          the stadium QR from the lobby.
        </p>
        <div className="games-actions">
          <Link to="/games/match" className="btn primary">
            Start or Join Match
          </Link>
          <span className="muted">Lobby supports typing the Match ID or scanning a QR with the camera.</span>
        </div>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Previous motion matches</h2>
      <p className="muted small">Ended from the stadium with &quot;End match&quot; (stored on this device).</p>
      {previous.length === 0 && <p className="muted">No ended matches yet.</p>}
      {previous.map((p) => (
        <div key={`${p.matchId}-${p.endedAt}`} className="card">
          <strong>Match {p.matchId}</strong>{" "}
          <span className="muted">
            · {p.runs} runs, {p.wickets} wkts, {p.balls} balls · {new Date(p.endedAt).toLocaleString()}
          </span>
        </div>
      ))}

      <h2 style={{ marginTop: "1.5rem" }}>Leaderboard — motion cricket</h2>
      {error && <p className="error">{error}</p>}
      {motionRows.length === 0 && <p className="muted">No motion scores yet.</p>}
      {motionRows.map((r, i) => (
        <div key={r.id} className="card">
          <strong>
            #{i + 1} — {r.score} runs
          </strong>{" "}
          <span className="muted">
            · {r.display_name ?? "Player"} · {new Date(r.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </>
  );
}
