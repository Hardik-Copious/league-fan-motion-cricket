import { Link, useSearchParams } from "react-router-dom";

export default function BasketballGames() {
  const [params] = useSearchParams();
  const matchQ = params.get("match")?.trim();
  const matchSuffix = matchQ ? `?match=${encodeURIComponent(matchQ)}` : "";

  return (
    <>
      <Link to="/games" className="muted">
        ← Games
      </Link>
      <h1>Motion basketball</h1>
      {matchQ && (
        <p className="muted small">
          Match ID: <strong>{matchQ.toUpperCase()}</strong>
        </p>
      )}
      <p className="muted">
        Pick a mode below. Each uses the same front camera and MoveNet pose pipeline; new games can be added here over
        time.
      </p>

      <div className="card card-textured" style={{ marginTop: "1rem" }}>
        <h2>Analytics court</h2>
        <p className="muted">
          Timed drill: zone dwell, shot peaks, squat cycles, defensive holds — no win/lose, best for exploration and
          steady reps.
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          <Link to={`/games/motion-basketball${matchSuffix}`} className="btn primary">
            Open analytics court
          </Link>
        </p>
      </div>

      <div className="card card-textured" style={{ marginTop: "1rem" }}>
        <h2>Target rush</h2>
        <p className="muted">
          Hit a point goal before the clock ends. Chain reps for a combo multiplier; lose lives if you go idle too long.
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          <Link to={`/games/basketball/target-rush${matchSuffix}`} className="btn primary">
            Play Target rush
          </Link>
        </p>
      </div>

      <div className="card card-textured" style={{ marginTop: "1rem" }}>
        <h2>Motion steering (demo)</h2>
        <p className="muted small">
          Webcam + MoveNet: rounded wheel overlay and lane car, steered by wrists vs shoulders.
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          <Link to="/games/motion-steering" className="btn primary">
            Open steering demo
          </Link>
        </p>
      </div>

      <div className="card card-textured" style={{ marginTop: "1rem" }}>
        <h2>Hand virtual keyboard</h2>
        <p className="muted small">
          In-page cursor + keyboard; pinch pose for click / long pinch for doubled insert (see on-page legend).
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          <Link to="/games/hand-virtual-input" className="btn primary">
            Open hand keyboard
          </Link>
        </p>
      </div>

      <p className="muted small" style={{ marginTop: "1.25rem" }}>
        Shared match ID: use <Link to="/games/match">Match Lobby</Link> with Motion basketball selected, then open a mode
        from here (optional <code>?match=</code> on each route).
      </p>
    </>
  );
}
