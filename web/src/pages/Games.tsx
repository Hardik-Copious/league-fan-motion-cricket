import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import PageBanner from "../components/PageBanner";
import { MOTION_CRICKET_GAME_TYPE } from "../games/motionCricket";
import { MOTION_BASKETBALL_GAME_TYPE, MOTION_BASKETBALL_TARGET_RUSH_GAME_TYPE } from "../games/motionBasketball";
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
  const [basketballRows, setBasketballRows] = useState<Row[]>([]);
  const [targetRushRows, setTargetRushRows] = useState<Row[]>([]);
  const [previous, setPrevious] = useState<PreviousMotionMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [m, bb, tr] = await Promise.all([
        loadLeaderboard(MOTION_CRICKET_GAME_TYPE),
        loadLeaderboard(MOTION_BASKETBALL_GAME_TYPE),
        loadLeaderboard(MOTION_BASKETBALL_TARGET_RUSH_GAME_TYPE),
      ]);
      setMotionRows(m);
      setBasketballRows(bb);
      setTargetRushRows(tr);
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
        Motion games use your <strong>device camera</strong> (pose via TensorFlow.js MoveNet). Cricket can pair with a
        phone for swing events over Supabase Realtime. Only scores you save are stored in Supabase. Use{" "}
        <strong>HTTPS</strong> or <code>localhost</code> for camera and sensors.
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

      <div className="card card-textured" style={{ marginTop: "1rem" }}>
        <h2>Motion basketball (pose analytics)</h2>
        <p className="muted">
          Same camera model as motion cricket: front webcam, mirrored skeleton on a half-court canvas. Tracks{" "}
          <strong>floor zones</strong>, <strong>shot-motion peaks</strong>, <strong>squat cycles</strong>, and{" "}
          <strong>defensive stance</strong> segments for a timed drill.
        </p>
        <div className="games-actions">
          <Link to="/games/basketball" className="btn primary">
            Basketball games
          </Link>
          <span className="muted">Hub for analytics court, Target rush, and motion demos.</span>
        </div>
      </div>

      <div className="card card-textured" style={{ marginTop: "1rem" }}>
        <h2>Motion demos (webcam)</h2>
        <p className="muted small">
          <strong>Night heat</strong> is an NFS-inspired street sprint (nitro, drafting, rain, pseudo-3D).{" "}
          <strong>Motion Grand Prix</strong> is the cleaner timed circuit. Both use the same TensorFlow.js MoveNet stack as basketball.
        </p>
        <div className="games-actions">
          <Link to="/games/night-heat" className="btn primary">
            Night heat (NFS-style)
          </Link>
          <Link to="/games/motion-steering-race" className="btn">
            Motion Grand Prix (race)
          </Link>
          <Link to="/games/motion-steering" className="btn">
            Steering demo
          </Link>
          <Link to="/games/hand-virtual-input" className="btn">
            Hand keyboard
          </Link>
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
      {motionRows.length === 0 && <p className="muted">No motion cricket scores yet.</p>}
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

      <h2 style={{ marginTop: "1.5rem" }}>Leaderboard — motion basketball (analytics)</h2>
      {basketballRows.length === 0 && <p className="muted">No motion basketball scores yet.</p>}
      {basketballRows.map((r, i) => (
        <div key={r.id} className="card">
          <strong>
            #{i + 1} — {r.score} pts
          </strong>{" "}
          <span className="muted">
            · {r.display_name ?? "Player"} · {new Date(r.created_at).toLocaleString()}
          </span>
        </div>
      ))}

      <h2 style={{ marginTop: "1.5rem" }}>Leaderboard — Target rush (wins)</h2>
      {targetRushRows.length === 0 && <p className="muted">No Target rush scores yet.</p>}
      {targetRushRows.map((r, i) => (
        <div key={r.id} className="card">
          <strong>
            #{i + 1} — {r.score} pts
          </strong>{" "}
          <span className="muted">
            · {r.display_name ?? "Player"} · {new Date(r.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </>
  );
}
