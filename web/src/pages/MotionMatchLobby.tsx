import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QrMatchScanner from "../components/QrMatchScanner";

type Role = "laptop" | "phone";

function makeMatchId(): string {
  const raw =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return raw.slice(0, 8).toUpperCase();
}

export default function MotionMatchLobby() {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState("");
  const [joinRole, setJoinRole] = useState<Role>("phone");
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  const [createRole, setCreateRole] = useState<Role>("laptop");
  const [scanOpen, setScanOpen] = useState(false);

  const createdHostLink = useMemo(
    () => (createdMatchId ? `/games/motion?match=${encodeURIComponent(createdMatchId)}` : ""),
    [createdMatchId]
  );
  const createdBatLink = useMemo(
    () => (createdMatchId ? `/games/bat?host=${encodeURIComponent(createdMatchId)}` : ""),
    [createdMatchId]
  );

  const onQrDecoded = useCallback(
    (id: string) => {
      setJoinId(id);
      setScanOpen(false);
      if (joinRole === "laptop") navigate(`/games/motion?match=${encodeURIComponent(id)}`);
      else navigate(`/games/bat?host=${encodeURIComponent(id)}`);
    },
    [joinRole, navigate]
  );

  function onCreate() {
    const id = makeMatchId();
    setCreatedMatchId(id);
    if (createRole === "laptop") navigate(`/games/motion?match=${encodeURIComponent(id)}`);
    else navigate(`/games/bat?host=${encodeURIComponent(id)}`);
  }

  function onJoin() {
    const id = joinId.trim().toUpperCase();
    if (!id) return;
    if (joinRole === "laptop") navigate(`/games/motion?match=${encodeURIComponent(id)}`);
    else navigate(`/games/bat?host=${encodeURIComponent(id)}`);
  }

  return (
    <>
      <Link to="/games" className="muted">
        ← Games
      </Link>
      <h1>Motion match lobby</h1>
      <p className="muted">Start a new match or join an existing one using Match ID or QR.</p>

      {scanOpen && <QrMatchScanner onDecoded={onQrDecoded} onClose={() => setScanOpen(false)} />}

      <div className="card">
        <h2>Start new match</h2>
        <p className="muted small">Creates a fresh Match ID and opens selected role immediately.</p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <label>
            <input
              type="radio"
              name="createRole"
              value="laptop"
              checked={createRole === "laptop"}
              onChange={() => setCreateRole("laptop")}
            />{" "}
            Laptop (stadium)
          </label>
          <label>
            <input
              type="radio"
              name="createRole"
              value="phone"
              checked={createRole === "phone"}
              onChange={() => setCreateRole("phone")}
            />{" "}
            Phone (bat)
          </label>
        </div>
        <p style={{ marginTop: "0.7rem" }}>
          <button type="button" className="btn primary" onClick={onCreate}>
            Start new match
          </button>
        </p>
        {createdMatchId && (
          <>
            <p className="muted small">
              Match ID: <strong>{createdMatchId}</strong>
            </p>
            <p className="muted small">Share this ID and join from any device.</p>
            <p className="muted small">
              Quick links: <code>{createdHostLink}</code> / <code>{createdBatLink}</code>
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Join existing match</h2>
        <p className="muted small">
          Use the camera to scan the QR from the stadium screen (contains the Match ID), or type the ID below.
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          <button type="button" className="btn primary" onClick={() => setScanOpen(true)}>
            Open camera &amp; scan QR
          </button>
        </p>
        <label htmlFor="join-match-id">Match ID</label>
        <input
          id="join-match-id"
          className="motion-cricket-input"
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          placeholder="Enter Match ID"
          autoComplete="off"
        />
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
          <label>
            <input
              type="radio"
              name="joinRole"
              value="laptop"
              checked={joinRole === "laptop"}
              onChange={() => setJoinRole("laptop")}
            />{" "}
            Laptop (stadium)
          </label>
          <label>
            <input
              type="radio"
              name="joinRole"
              value="phone"
              checked={joinRole === "phone"}
              onChange={() => setJoinRole("phone")}
            />{" "}
            Phone (bat)
          </label>
        </div>
        <p style={{ marginTop: "0.7rem" }}>
          <button type="button" className="btn primary" onClick={onJoin} disabled={!joinId.trim()}>
            Join match
          </button>
        </p>
      </div>
    </>
  );
}
