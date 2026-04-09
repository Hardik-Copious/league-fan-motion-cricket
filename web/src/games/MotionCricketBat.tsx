import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { requestMotionPermission, useDeviceSwing } from "./useDeviceSwing";
import type { BatToHostMessage, HostToBatMessage } from "./motionCricket";
import { supabase } from "../supabaseClient";

export default function MotionCricketBat() {
  const [params] = useSearchParams();
  const hostFromQuery = params.get("host")?.trim() ?? "";
  const [hostId, setHostId] = useState(hostFromQuery.toUpperCase());
  const [peerReady] = useState(true);
  const [connStatus, setConnStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const [motionOn, setMotionOn] = useState(false);
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [lastAck, setLastAck] = useState<string | null>(null);
  const [score, setScore] = useState({ runs: 0, wickets: 0, balls: 0 });
  const [deliveryState, setDeliveryState] = useState<"idle" | "incoming">("idle");
  const isConnectedRef = useRef(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const welcomeTimeoutRef = useRef<number | null>(null);
  const autoConnectTriedRef = useRef(false);

  const sendToHost = useCallback((msg: BatToHostMessage) => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({
      type: "broadcast",
      event: "bat_msg",
      payload: msg,
    });
  }, []);

  const sendSwing = useCallback(
    (peak: number, mag: number) => {
      if (connStatus !== "open") return;
      sendToHost({ type: "swing", t: Date.now(), peak, mag });
    },
    [connStatus, sendToHost]
  );

  const sendNextBall = useCallback(() => {
    if (connStatus !== "open") return;
    sendToHost({ type: "next_ball", t: Date.now() });
    setDeliveryState("incoming");
    setLastAck("Ball requested…");
  }, [connStatus, sendToHost]);

  const sendStartInnings = useCallback(() => {
    if (connStatus !== "open") return;
    sendToHost({ type: "start_innings", t: Date.now() });
    setDeliveryState("idle");
    setLastAck("Innings start requested");
  }, [connStatus, sendToHost]);

  useDeviceSwing({
    onSwing: sendSwing,
    enabled: motionOn && connStatus === "open",
    threshold: 10,
    cooldownMs: 200,
  });

  const disconnectFromHost = useCallback(() => {
    isConnectedRef.current = false;
    if (welcomeTimeoutRef.current) {
      window.clearTimeout(welcomeTimeoutRef.current);
      welcomeTimeoutRef.current = null;
    }
    if (channelRef.current) {
      sendToHost({ type: "disconnect_request", t: Date.now() });
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setConnStatus("idle");
    setDeliveryState("idle");
    setLastAck("Disconnected");
  }, [sendToHost]);

  const connectToHost = useCallback(() => {
    const trimmed = hostId.trim();
    if (!trimmed) {
      setConnStatus("error");
      setLastAck("Enter a valid Host ID.");
      return;
    }
    if (welcomeTimeoutRef.current) {
      window.clearTimeout(welcomeTimeoutRef.current);
      welcomeTimeoutRef.current = null;
    }
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    isConnectedRef.current = false;
    setConnStatus("connecting");
    setLastAck("Joining session...");
    const channel = supabase.channel(`motion:${trimmed}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "host_msg" }, ({ payload }) => {
      const msg = payload as HostToBatMessage;
      if (msg?.type === "welcome") {
        if (welcomeTimeoutRef.current) {
          window.clearTimeout(welcomeTimeoutRef.current);
          welcomeTimeoutRef.current = null;
        }
        isConnectedRef.current = true;
        setConnStatus("open");
        setLastAck(`Connected — ${msg.maxBalls} balls`);
      }
      if (msg?.type === "host_disconnected") {
        isConnectedRef.current = false;
        setConnStatus("idle");
        setLastAck(msg.reason ?? "Host disconnected");
        setDeliveryState("idle");
        return;
      }
      if (msg?.type === "ack") {
        setLastAck(`+${msg.runsThisBall} runs · total ${msg.totalRuns} · ball ${msg.ball}`);
      }
      if (msg?.type === "ball_started") {
        setDeliveryState("incoming");
        setLastAck(`Ball ${msg.ball} incoming`);
      }
      if (msg?.type === "ball_result") {
        setDeliveryState("idle");
        setScore({ runs: msg.totalRuns, wickets: msg.wickets, balls: msg.ball });
        setLastAck(
          `Ball ${msg.ball}: ${msg.outcome}${msg.outcome === "bowled" ? " (wicket)" : ""} · +${msg.runs}`
        );
      }
      if (msg?.type === "score_sync") {
        setScore({ runs: msg.runs, wickets: msg.wickets, balls: msg.balls });
      }
    });

    void channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        sendToHost({ type: "join_request", t: Date.now() });
        if (welcomeTimeoutRef.current) window.clearTimeout(welcomeTimeoutRef.current);
        welcomeTimeoutRef.current = window.setTimeout(() => {
          if (!isConnectedRef.current) {
            setConnStatus("error");
            setLastAck("Could not connect. Check Host ID and try again.");
            if (channelRef.current) {
              void supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }
          }
        }, 8000);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        isConnectedRef.current = false;
        setConnStatus("error");
        setLastAck("Channel connection failed.");
      } else if (status === "CLOSED") {
        isConnectedRef.current = false;
        setConnStatus("idle");
      }
    });
  }, [hostId, sendToHost]);

  useEffect(() => {
    if (autoConnectTriedRef.current) return;
    if (!hostFromQuery) return;
    if (connStatus !== "idle") return;
    autoConnectTriedRef.current = true;
    connectToHost();
  }, [connStatus, connectToHost, hostFromQuery]);

  useEffect(() => {
    return () => {
      if (welcomeTimeoutRef.current) window.clearTimeout(welcomeTimeoutRef.current);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, []);

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
      {!hostFromQuery && <p className="error">No Match ID found. Join from <Link to="/games/match">Match Lobby</Link>.</p>}
      {!!hostFromQuery && <p className="muted small">Match ID: <strong>{hostId}</strong></p>}

      <div className="card">
        <p className="muted small">
          Connection status: {connStatus} {peerReady ? "" : "(starting…)"}
        </p>
        {connStatus === "error" && <p className="error">Could not connect this Match ID. Rejoin from Match Lobby.</p>}
        {connStatus === "open" && (
          <button type="button" className="btn" onClick={disconnectFromHost}>
            Leave match
          </button>
        )}
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
        {motionOn && (
          <p className="muted">Swing the phone during the ball’s approach — the stadium scores only when swing lines up with bat contact.</p>
        )}
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
