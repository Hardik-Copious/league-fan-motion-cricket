import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Peer, { type DataConnection } from "peerjs";
import { requestMotionPermission, useDeviceSwing } from "./useDeviceSwing";
import type { HostToBatMessage } from "./motionCricket";

export default function MotionCricketBat() {
  const [params] = useSearchParams();
  const hostFromQuery = params.get("host")?.trim() ?? "";
  const [hostId, setHostId] = useState(hostFromQuery);
  const [peerReady, setPeerReady] = useState(false);
  const [connStatus, setConnStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const [motionOn, setMotionOn] = useState(false);
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [lastAck, setLastAck] = useState<string | null>(null);
  const [score, setScore] = useState({ runs: 0, wickets: 0, balls: 0 });
  const [deliveryState, setDeliveryState] = useState<"idle" | "incoming">("idle");

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  const sendSwing = useCallback((peak: number, mag: number) => {
    const conn = connRef.current;
    if (!conn?.open) return;
    conn.send({ type: "swing", t: Date.now(), peak, mag });
  }, []);

  const sendNextBall = useCallback(() => {
    const conn = connRef.current;
    if (!conn?.open) return;
    conn.send({ type: "next_ball", t: Date.now() });
    setDeliveryState("incoming");
    setLastAck("Ball requested…");
  }, []);

  const sendStartInnings = useCallback(() => {
    const conn = connRef.current;
    if (!conn?.open) return;
    conn.send({ type: "start_innings", t: Date.now() });
    setDeliveryState("idle");
    setLastAck("Innings start requested");
  }, []);

  useDeviceSwing({
    onSwing: sendSwing,
    enabled: motionOn && connStatus === "open",
    threshold: 10,
    cooldownMs: 250,
  });

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on("open", () => setPeerReady(true));
    peer.on("error", () => setConnStatus("error"));
    return () => {
      connRef.current?.close();
      peer.destroy();
    };
  }, []);

  useEffect(() => {
    if (!peerReady || !hostId) {
      if (!hostId) setConnStatus("idle");
      return;
    }
    setConnStatus("connecting");
    const peer = peerRef.current;
    if (!peer) return;

    const conn = peer.connect(hostId, { reliable: true });
    connRef.current = conn;

    conn.on("open", () => {
      setConnStatus("open");
    });
    conn.on("data", (data: unknown) => {
      const msg = data as HostToBatMessage;
      if (msg?.type === "ack") {
        setLastAck(`+${msg.runsThisBall} runs · total ${msg.totalRuns} · ball ${msg.ball}`);
      }
      if (msg?.type === "welcome") {
        setLastAck(`Ready — ${msg.maxBalls} balls`);
      }
      if (msg?.type === "ball_started") {
        setDeliveryState("incoming");
        setLastAck(`Ball ${msg.ball} incoming — swing now`);
      }
      if (msg?.type === "ball_result") {
        setDeliveryState("idle");
        setScore({ runs: msg.totalRuns, wickets: msg.wickets, balls: msg.ball });
        setLastAck(`Ball ${msg.ball}: ${msg.outcome} · +${msg.runs}`);
      }
      if (msg?.type === "score_sync") {
        setScore({ runs: msg.runs, wickets: msg.wickets, balls: msg.balls });
      }
    });
    conn.on("close", () => {
      setConnStatus("idle");
      connRef.current = null;
    });
    conn.on("error", () => setConnStatus("error"));

    return () => {
      conn.close();
    };
  }, [peerReady, hostId]);

  async function enableMotion() {
    setPermissionHint(null);
    const ok = await requestMotionPermission();
    if (!ok) {
      setPermissionHint("Motion permission denied. On iOS, use Safari and tap again.");
      return;
    }
    setMotionOn(true);
  }

  return (
    <>
      <h1>Motion cricket — bat (phone)</h1>
      <p className="muted">
        Tap <strong>Next Ball</strong> to deliver. Bat contact is auto-detected from your live pose on laptop.
      </p>

      <div className="card">
        <label htmlFor="hostid">Stadium Peer ID (from laptop)</label>
        <input
          id="hostid"
          className="motion-cricket-input"
          value={hostId}
          onChange={(e) => setHostId(e.target.value.trim())}
          placeholder="Paste host ID"
          autoComplete="off"
        />
        <p className="muted small">
          Status: {connStatus} {peerReady ? "" : "(starting…)"}
        </p>
        {connStatus === "error" && <p className="error">Could not connect. Check ID and try again.</p>}
      </div>

      <div className="card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="button" className="btn primary" onClick={sendStartInnings} disabled={connStatus !== "open"}>
            Start Innings
          </button>
          <button type="button" className="btn primary" onClick={sendNextBall} disabled={connStatus !== "open"}>
            Next Ball
          </button>
        </div>
        {connStatus !== "open" && <p className="muted small">Connect to stadium first to enable controls.</p>}

        <p className="muted small">Delivery: {deliveryState === "incoming" ? "Incoming…" : "Waiting for next ball"}</p>
        <button type="button" className="btn primary" onClick={() => void enableMotion()} disabled={motionOn}>
          {motionOn ? "Motion active" : "Enable motion sensor"}
        </button>
        {permissionHint && <p className="error">{permissionHint}</p>}
        {motionOn && <p className="muted">Motion is optional in overlap mode.</p>}
        {lastAck && <p className="motion-cricket-feedback">{lastAck}</p>}
        <p className="muted small">
          Score: {score.runs}/{score.wickets} · Ball {score.balls}
        </p>
      </div>

      <p className="muted">
        <Link to="/games">Back to games</Link>
      </p>
    </>
  );
}
