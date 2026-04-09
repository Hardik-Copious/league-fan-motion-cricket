import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import PageBanner from "../components/PageBanner";
import { MOTION_CRICKET_GAME_TYPE } from "../games/motionCricket";
import { supabase } from "../supabaseClient";

type Row = {
  id: string;
  score: number;
  game_type: string;
  created_at: string;
  display_name: string | null;
};

const TAP_GAME_TYPE = "tap_rally_demo";

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

export default function Games({ session }: { session: Session | null }) {
  const [motionRows, setMotionRows] = useState<Row[]>([]);
  const [tapRows, setTapRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const [m, t] = await Promise.all([loadLeaderboard(MOTION_CRICKET_GAME_TYPE), loadLeaderboard(TAP_GAME_TYPE)]);
      setMotionRows(m);
      setTapRows(t);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitDemoScore() {
    setMsg(null);
    setError(null);
    if (!session?.user) {
      setError("Sign in to submit a score.");
      return;
    }
    const score = Math.floor(Math.random() * 50) + 10;
    const { error: e } = await supabase.from("game_sessions").insert({
      user_id: session.user.id,
      game_type: TAP_GAME_TYPE,
      score,
      duration_ms: 30000,
      metadata: { source: "web_demo" },
    });
    if (e) setError(e.message);
    else {
      setMsg(`Submitted demo score: ${score}`);
      void load();
    }
  }

  return (
    <>
      <PageBanner variant="games" />
      <h1>Games</h1>
      <p className="muted">
        Motion cricket uses your <strong>laptop webcam</strong> (pose) and <strong>phone sensors</strong> (swing) via WebRTC.
        Only scores are stored in Supabase. Use <strong>HTTPS</strong> or <code>localhost</code> for camera and sensors.
      </p>

      <div className="card card-textured">
        <h2>Motion cricket (CricFit-style)</h2>
        <p className="muted">
          <strong>Stadium:</strong> open on laptop — camera + MoveNet skeleton. <strong>Bat:</strong> open the phone link
          from the stadium screen (PeerJS connects the two).
        </p>
        <div className="games-actions">
          <Link to="/games/motion" className="btn primary">
            Open stadium (laptop)
          </Link>
          <span className="muted">Phone pairs via URL shown on stadium after start.</span>
        </div>
      </div>

      <div className="card">
        <h2>Tap rally (demo)</h2>
        <p className="muted">No motion — random score for testing leaderboards.</p>
        <button type="button" className="btn primary" onClick={() => void submitDemoScore()}>
          Submit random demo score
        </button>
        {msg && <p style={{ marginTop: "0.75rem" }}>{msg}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Leaderboard — motion cricket</h2>
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

      <h2 style={{ marginTop: "1.5rem" }}>Leaderboard — tap demo</h2>
      {tapRows.length === 0 && <p className="muted">No tap scores yet.</p>}
      {tapRows.map((r, i) => (
        <div key={r.id} className="card">
          <strong>
            #{i + 1} — {r.score}
          </strong>{" "}
          <span className="muted">
            · {r.display_name ?? "Player"} · {new Date(r.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </>
  );
}
