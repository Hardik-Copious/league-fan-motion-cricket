import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { requestBrioOrUserFacingWebcam } from "../lib/cameraStream";
import { supabase } from "../supabaseClient";
import { appendPreviousMatch } from "../lib/motionMatchHistory";
import {
  buildMirroredAvatarPoints,
  buildSideProfileAvatarPoints,
  drawBasketballAvatar,
  drawBasketballHalfCourt,
  drawBasketballSideProfileCourt,
  drawShotTrajectory,
  drawSideProfileShootVisualization,
  drawVirtualCourtBalls,
  drawWebcamThumbnail,
  spawnVirtualCourtBalls,
  tryHitVirtualCourtBalls,
  type VirtualCourtBall,
} from "./basketballCourtCanvas";
import {
  analyzeBasketballFrame,
  MOTION_BASKETBALL_TARGET_RUSH_GAME_TYPE,
  TARGET_RUSH_COMBO_CHAIN_MS,
  TARGET_RUSH_COMBO_MAX,
  TARGET_RUSH_COMBO_STEP,
  TARGET_RUSH_GOAL,
  TARGET_RUSH_IDLE_MS,
  TARGET_RUSH_LIVES,
  TARGET_RUSH_SECONDS,
  type CourtZone,
} from "./motionBasketball";

const ZONE_LABEL: Record<CourtZone, string> = {
  left_wing: "Left wing",
  right_wing: "Right wing",
  paint: "Paint",
  top_of_key: "Top of key",
  unknown: "—",
};

type RepKind = "shot" | "squat" | "defensive";

function basePoints(kind: RepKind): number {
  if (kind === "shot") return 14;
  if (kind === "squat") return 9;
  return 6;
}

export default function BasketballTargetRushHost({ session }: { session: Session | null }) {
  const [params] = useSearchParams();
  const matchFromQuery = params.get("match")?.trim().toUpperCase() ?? "";
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof poseDetection.createDetector>> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const runStartMsRef = useRef(0);
  const playingRef = useRef(false);
  const zoneMsRef = useRef<Partial<Record<CourtZone, number>>>({});
  const shotRepRef = useRef(0);
  const squatRepRef = useRef(0);
  const defensiveRepRef = useRef(0);
  const defensiveHoldMsRef = useRef(0);
  const lastShotAtRef = useRef(0);
  const prevDomWristYRef = useRef<number | null>(null);
  const squatArmedRef = useRef(false);
  const lastUiTickRef = useRef(0);
  const lastFrameMsRef = useRef(0);
  const deviceHistorySavedRef = useRef(false);
  const trajTrailRef = useRef<Array<{ x: number; y: number }>>([]);
  const showTrajectoryRef = useRef(true);
  const sideProfileRef = useRef(false);
  const virtualBallsRef = useRef<VirtualCourtBall[]>(spawnVirtualCourtBalls());

  const gameScoreRef = useRef(0);
  const livesRef = useRef(TARGET_RUSH_LIVES);
  const comboRef = useRef(1);
  const maxComboRef = useRef(1);
  const repCountRef = useRef(0);
  const lastAnyRepAtRef = useRef(0);
  const graceUntilRef = useRef(0);

  const [generatedHostId] = useState<string>(() =>
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `host${Math.random().toString(36).slice(2, 14)}`)
      .slice(0, 8)
      .toUpperCase()
  );
  const hostId = matchFromQuery || generatedHostId;

  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "playing" | "won" | "lost">("idle");
  const [poseError, setPoseError] = useState<string | null>(null);
  const [clockSec, setClockSec] = useState(TARGET_RUSH_SECONDS);
  const [gameScore, setGameScore] = useState(0);
  const [lives, setLives] = useState(TARGET_RUSH_LIVES);
  const [combo, setCombo] = useState(1);
  const [liveZone, setLiveZone] = useState<CourtZone>("unknown");
  const [liveTags, setLiveTags] = useState<string[]>([]);
  const [shotReps, setShotReps] = useState(0);
  const [squatReps, setSquatReps] = useState(0);
  const [defensiveReps, setDefensiveReps] = useState(0);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);
  const [sideways, setSideways] = useState(false);
  const [showTrajectory, setShowTrajectory] = useState(true);

  useEffect(() => {
    showTrajectoryRef.current = showTrajectory;
  }, [showTrajectory]);

  useEffect(() => {
    sideProfileRef.current = sideways;
  }, [sideways]);

  useEffect(() => {
    const v = videoRef.current;
    const s = streamRef.current;
    if (!v || !s) return;
    if (v.srcObject !== s) v.srcObject = s;
    void v.play().catch(() => {});
  }, [phase]);

  const outcome = useMemo(() => (phase === "won" ? "win" : phase === "lost" ? "loss" : null), [phase]);

  const pushUi = useCallback(
    (now: number, partial: Partial<{ zone: CourtZone; tags: string[]; clock: number }>, force?: boolean) => {
      if (!force && now - lastUiTickRef.current < 220) return;
      lastUiTickRef.current = now;
      if (partial.zone != null) setLiveZone(partial.zone);
      if (partial.tags != null) setLiveTags(partial.tags);
      if (partial.clock != null) setClockSec(partial.clock);
      setGameScore(gameScoreRef.current);
      setLives(livesRef.current);
      setCombo(comboRef.current);
      setShotReps(shotRepRef.current);
      setSquatReps(squatRepRef.current);
      setDefensiveReps(defensiveRepRef.current);
    },
    []
  );

  const registerRep = useCallback((kind: RepKind, now: number) => {
    const prevT = lastAnyRepAtRef.current;
    if (repCountRef.current === 0) {
      comboRef.current = 1;
    } else if (prevT > 0 && now - prevT < TARGET_RUSH_COMBO_CHAIN_MS) {
      comboRef.current = Math.min(TARGET_RUSH_COMBO_MAX, comboRef.current + TARGET_RUSH_COMBO_STEP);
    } else {
      comboRef.current = 1;
    }
    repCountRef.current += 1;
    lastAnyRepAtRef.current = now;
    const add = Math.round(basePoints(kind) * comboRef.current);
    gameScoreRef.current += add;
    maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
  }, []);

  const endGame = useCallback(
    (result: "won" | "lost", now: number) => {
      playingRef.current = false;
      if (!deviceHistorySavedRef.current) {
        deviceHistorySavedRef.current = true;
        appendPreviousMatch({
          matchId: hostId,
          runs: gameScoreRef.current,
          wickets: result === "won" ? 1 : 0,
          balls: shotRepRef.current + squatRepRef.current + defensiveRepRef.current,
        });
      }
      setPhase(result);
      pushUi(now, { clock: 0 }, true);
    },
    [hostId, pushUi]
  );

  async function startArena() {
    setPhase("loading");
    setPoseError(null);
    try {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();

      const { stream, label } = await requestBrioOrUserFacingWebcam();
      streamRef.current = stream;
      setCameraLabel(label);

      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }

      const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      });
      detectorRef.current = detector;
      virtualBallsRef.current = spawnVirtualCourtBalls();

      const loop = async () => {
        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const det = detectorRef.current;
          if (!video || !canvas || !det || video.readyState < 2) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;

          canvas.width = w;
          canvas.height = h;

          const now = performance.now();

          const sideProfile = sideProfileRef.current;
          if (sideProfile) {
            drawBasketballSideProfileCourt(ctx, w, h, zoneMsRef.current);
          } else {
            drawBasketballHalfCourt(ctx, w, h, zoneMsRef.current);
          }

          const poses = await det.estimatePoses(video, { flipHorizontal: false });
          const kp = poses[0]?.keypoints;
          const analytics = analyzeBasketballFrame(kp, w, h);

          const domRw0 = kp?.[10];
          const domLw0 = kp?.[9];
          const useR0 = (domRw0?.score ?? 0) >= (domLw0?.score ?? 0);
          const wy = useR0 ? domRw0?.y : domLw0?.y;
          const prevY = prevDomWristYRef.current;
          let wristUpVelNorm = 0;
          if (wy != null && prevY != null) {
            wristUpVelNorm = Math.min(1, Math.max(0, (prevY - wy) / (h * 0.03)));
          }

          if (playingRef.current && runStartMsRef.current > 0) {
            const elapsed = (now - runStartMsRef.current) / 1000;
            const left = Math.max(0, Math.ceil(TARGET_RUSH_SECONDS - elapsed));

            const shot0 = shotRepRef.current;
            const squat0 = squatRepRef.current;
            const def0 = defensiveRepRef.current;

            const prevF = lastFrameMsRef.current;
            lastFrameMsRef.current = now;
            const dt = prevF ? Math.min(100, Math.max(0, now - prevF)) : 16;

            const z = analytics.zone;
            if (z !== "unknown") {
              zoneMsRef.current[z] = (zoneMsRef.current[z] ?? 0) + dt;
            }

            if (analytics.tags.includes("defensive_shape")) {
              defensiveHoldMsRef.current += dt;
              if (defensiveHoldMsRef.current >= 2800) {
                defensiveHoldMsRef.current = 0;
                defensiveRepRef.current += 1;
              }
            } else {
              defensiveHoldMsRef.current = Math.max(0, defensiveHoldMsRef.current - dt * 0.5);
            }

            const hipN = analytics.hipToAnkleNorm;
            if (hipN != null) {
              if (!squatArmedRef.current && hipN < 0.34) squatArmedRef.current = true;
              if (squatArmedRef.current && hipN > 0.5) {
                squatRepRef.current += 1;
                squatArmedRef.current = false;
              }
            }

            if (wy != null && prevY != null && analytics.shootingShape > 0.42) {
              const upVel = prevY - wy;
              if (upVel > h * 0.014 && now - lastShotAtRef.current > 700) {
                shotRepRef.current += 1;
                lastShotAtRef.current = now;
              }
            }

            if (shotRepRef.current > shot0) registerRep("shot", now);
            if (squatRepRef.current > squat0) registerRep("squat", now);
            if (defensiveRepRef.current > def0) registerRep("defensive", now);

            if (playingRef.current && gameScoreRef.current >= TARGET_RUSH_GOAL) {
              endGame("won", now);
            } else if (playingRef.current && elapsed >= TARGET_RUSH_SECONDS) {
              endGame(gameScoreRef.current >= TARGET_RUSH_GOAL ? "won" : "lost", now);
            } else if (
              playingRef.current &&
              now >= graceUntilRef.current &&
              lastAnyRepAtRef.current > 0 &&
              now - lastAnyRepAtRef.current > TARGET_RUSH_IDLE_MS
            ) {
              livesRef.current -= 1;
              lastAnyRepAtRef.current = now;
              comboRef.current = 1;
              if (livesRef.current <= 0) {
                endGame("lost", now);
              }
            }

            if (playingRef.current) {
              pushUi(now, { zone: analytics.zone, tags: analytics.tags, clock: left });
            }
          }

          if (wy != null) prevDomWristYRef.current = wy;

          const mappedPoints = sideProfile
            ? buildSideProfileAvatarPoints(kp, w, h)
            : buildMirroredAvatarPoints(kp, w, h);

          const rwm = mappedPoints[10];
          const lwm = mappedPoints[9];
          const useRm = (rwm?.score ?? 0) >= (lwm?.score ?? 0);
          const tipM = useRm ? rwm : lwm;
          if (tipM && tipM.score > 0.16) {
            const { next, hits } = tryHitVirtualCourtBalls(
              virtualBallsRef.current,
              tipM.x,
              tipM.y,
              analytics.shootingShape,
              w,
              h,
              now
            );
            virtualBallsRef.current = next;
            if (hits > 0 && playingRef.current) {
              const add = hits * Math.max(1, Math.round(2 * comboRef.current));
              gameScoreRef.current += add;
            }
          }
          drawVirtualCourtBalls(ctx, w, h, virtualBallsRef.current, now);

          if (showTrajectoryRef.current && analytics.shootingShape > 0.22) {
            const rw = mappedPoints[10];
            const lw = mappedPoints[9];
            const useRm = (rw?.score ?? 0) >= (lw?.score ?? 0);
            const tip = useRm ? rw : lw;
            if (tip && tip.score > 0.18) {
              const t = trajTrailRef.current;
              const last = t[t.length - 1];
              if (!last || Math.hypot(last.x - tip.x, last.y - tip.y) > Math.max(3, w * 0.002)) {
                t.push({ x: tip.x, y: tip.y });
                if (t.length > 56) t.shift();
              }
            }
          } else if (showTrajectoryRef.current && trajTrailRef.current.length > 0 && analytics.shootingShape < 0.12) {
            if (Math.random() < 0.08) trajTrailRef.current.shift();
          }

          drawBasketballAvatar(ctx, w, h, mappedPoints);
          if (showTrajectoryRef.current) {
            if (sideProfile) {
              const rw = mappedPoints[10];
              const lw = mappedPoints[9];
              const useRm = (rw?.score ?? 0) >= (lw?.score ?? 0);
              const tip = useRm ? rw : lw;
              if (tip && tip.score > 0.15) {
                drawSideProfileShootVisualization(
                  ctx,
                  w,
                  h,
                  tip.x,
                  tip.y,
                  analytics.shootingShape,
                  wristUpVelNorm
                );
              }
            } else if (trajTrailRef.current.length > 1) {
              drawShotTrajectory(ctx, trajTrailRef.current, w);
            }
          }

          const elapsedHud = playingRef.current && runStartMsRef.current > 0 ? (now - runStartMsRef.current) / 1000 : 0;
          const leftHud = Math.max(0, Math.ceil(TARGET_RUSH_SECONDS - elapsedHud));
          ctx.fillStyle = "rgba(7,10,16,0.78)";
          ctx.fillRect(12, 12, w * 0.44, h * 0.27);
          ctx.fillStyle = "rgba(255,248,240,0.96)";
          ctx.font = `${Math.max(12, Math.floor(w * 0.018))}px sans-serif`;
          ctx.fillText(`Target ${TARGET_RUSH_GOAL} pts · You ${gameScoreRef.current}`, 22, 36);
          ctx.font = `${Math.max(11, Math.floor(w * 0.014))}px sans-serif`;
          ctx.fillStyle = "rgba(253, 224, 200, 0.92)";
          ctx.fillText(`Lives ${livesRef.current} · Combo ×${comboRef.current.toFixed(2)}`, 22, 60);
          ctx.fillStyle = "rgba(255,255,255,0.88)";
          ctx.fillText(`Zone: ${ZONE_LABEL[analytics.zone]}`, 22, 84);
          const tagLine = analytics.tags.slice(0, 2).join(" · ") || "—";
          ctx.fillText(tagLine, 22, 106);
          ctx.fillStyle = "rgba(200,220,255,0.88)";
          ctx.fillText("Orange balls: touch wrist close, or looser radius in shooting pocket", 22, 126);
          ctx.fillStyle = "rgba(255,255,255,0.88)";
          ctx.fillText(
            playingRef.current ? `Clock ${leftHud}s · Idle ${Math.max(0, Math.floor((TARGET_RUSH_IDLE_MS - (now - lastAnyRepAtRef.current)) / 1000))}s` : "Press Start run",
            22,
            148
          );

          drawWebcamThumbnail(ctx, video, w, h);
        } finally {
          rafRef.current = requestAnimationFrame(loop);
        }
      };

      lastFrameMsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
      setPhase("ready");
    } catch (e) {
      setPoseError(e instanceof Error ? e.message : "Camera or model failed");
      setPhase("idle");
    }
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function startRun() {
    deviceHistorySavedRef.current = false;
    shotRepRef.current = 0;
    squatRepRef.current = 0;
    defensiveRepRef.current = 0;
    defensiveHoldMsRef.current = 0;
    lastShotAtRef.current = 0;
    prevDomWristYRef.current = null;
    squatArmedRef.current = false;
    lastFrameMsRef.current = 0;
    zoneMsRef.current = {};
    gameScoreRef.current = 0;
    livesRef.current = TARGET_RUSH_LIVES;
    comboRef.current = 1;
    maxComboRef.current = 1;
    repCountRef.current = 0;
    const t0 = performance.now();
    runStartMsRef.current = t0;
    lastAnyRepAtRef.current = t0;
    graceUntilRef.current = t0 + 3500;
    trajTrailRef.current = [];
    virtualBallsRef.current = spawnVirtualCourtBalls();
    playingRef.current = true;
    setPhase("playing");
    setClockSec(TARGET_RUSH_SECONDS);
    setGameScore(0);
    setLives(TARGET_RUSH_LIVES);
    setCombo(1);
    setShotReps(0);
    setSquatReps(0);
    setDefensiveReps(0);
    setLiveTags([]);
    setLiveZone("unknown");
  }

  function quitEarly() {
    if (!playingRef.current) return;
    playingRef.current = false;
    if (!deviceHistorySavedRef.current) {
      deviceHistorySavedRef.current = true;
      appendPreviousMatch({
        matchId: hostId,
        runs: gameScoreRef.current,
        wickets: 0,
        balls: shotRepRef.current + squatRepRef.current + defensiveRepRef.current,
      });
    }
    setPhase("lost");
    pushUi(performance.now(), { clock: 0 }, true);
  }

  async function submitScore() {
    setSubmitErr(null);
    setSubmitMsg(null);
    if (!session?.user) {
      setSubmitErr("Sign in to save your score.");
      return;
    }
    if (outcome !== "win") {
      setSubmitErr("Only winning runs are saved to this leaderboard.");
      return;
    }
    const { error } = await supabase.from("game_sessions").insert({
      user_id: session.user.id,
      game_type: MOTION_BASKETBALL_TARGET_RUSH_GAME_TYPE,
      score: gameScore,
      duration_ms: TARGET_RUSH_SECONDS * 1000,
      metadata: {
        source: "basketball_target_rush",
        shot_reps: shotReps,
        squat_reps: squatReps,
        defensive_reps: defensiveReps,
        max_combo: maxComboRef.current,
      },
    });
    if (error) setSubmitErr(error.message);
    else setSubmitMsg("Score saved to Target Rush leaderboard.");
  }

  return (
    <>
      <p className="muted">
        <Link to="/games" className="muted">
          ← Games
        </Link>
        {" · "}
        <Link to="/games/basketball" className="muted">
          All basketball games
        </Link>
      </p>
      <h1>Target rush</h1>
      <p className="muted">
        Reach <strong>{TARGET_RUSH_GOAL}</strong> points in <strong>{TARGET_RUSH_SECONDS}s</strong>. Same reps as analytics
        (shot motion, squat cycle, defensive hold) but points scale with a <strong>combo multiplier</strong> when reps
        land close together. You have <strong>{TARGET_RUSH_LIVES} lives</strong>: stay idle too long (
        {Math.round(TARGET_RUSH_IDLE_MS / 1000)}s with no rep) and you lose one. Opening grace: 3.5s. Uses your{" "}
        <strong>Logitech BRIO</strong> automatically when the browser lists it by name; otherwise the default webcam.
        Turn on <strong>Side profile (2D)</strong> for shooter left / hoop right with a parabolic arc; use <strong>shot trail</strong> for wrist trace on the half-court or the flight arc in profile.
      </p>
      <p className="muted small">
        Session ID: <strong>{hostId}</strong> ·{" "}
        <Link to="/games/match">Match Lobby</Link>
      </p>
      {cameraLabel && phase !== "idle" && (
        <p className="muted small">
          Active camera: <strong>{cameraLabel}</strong>
        </p>
      )}

      {phase === "idle" && (
        <button type="button" className="btn primary" onClick={() => void startArena()}>
          Start camera & pose
        </button>
      )}
      {phase === "loading" && <p className="muted">Loading camera and MoveNet…</p>}
      {poseError && <p className="error">{poseError}</p>}

      {phase !== "idle" && (
        <div className="card" style={{ marginTop: "0.6rem" }}>
          <label className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginRight: "1.25rem" }}>
            <input type="checkbox" checked={sideways} onChange={(e) => setSideways(e.target.checked)} />
            Side profile (2D): shooter left, hoop right, parabolic arc
          </label>
          <label className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <input type="checkbox" checked={showTrajectory} onChange={(e) => setShowTrajectory(e.target.checked)} />
            Show shot trail / arc
          </label>
        </div>
      )}

      {phase !== "idle" && (
        <div className="basketball-wrapper">
          <div className="motion-cricket-stage card">
            <video ref={videoRef} className="motion-cricket-feed" playsInline muted />
            <canvas ref={canvasRef} className="motion-cricket-canvas" />
          </div>
        </div>
      )}

      {phase === "ready" && (
        <p style={{ marginTop: "1rem" }}>
          <button type="button" className="btn primary" onClick={startRun}>
            Start run
          </button>
        </p>
      )}

      {phase === "playing" && (
        <div className="card motion-cricket-scoreboard">
          <div>
            <strong>Score:</strong> {gameScore} / {TARGET_RUSH_GOAL} &nbsp;
            <strong>Clock:</strong> {clockSec}s &nbsp;
            <strong>Lives:</strong> {lives} &nbsp;
            <strong>Combo:</strong> ×{combo.toFixed(2)}
          </div>
          <p className="muted small">
            Reps — shots: {shotReps}, squats: {squatReps}, defensive: {defensiveReps} · Zone: {ZONE_LABEL[liveZone]}
          </p>
          {liveTags.length > 0 && <p className="motion-cricket-feedback">{liveTags.join(" · ")}</p>}
          <p style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn" onClick={quitEarly}>
              End run (counts as loss)
            </button>
          </p>
        </div>
      )}

      {(phase === "won" || phase === "lost") && (
        <div className="card">
          <h2>{phase === "won" ? "You cleared the target" : "Run over"}</h2>
          <p>
            Score <strong>{gameScore}</strong> (goal {TARGET_RUSH_GOAL}). Reps: {shotReps} / {squatReps} /{" "}
            {defensiveReps}.
          </p>
          {phase === "won" && (
            <>
              <button type="button" className="btn primary" onClick={() => void submitScore()} disabled={!session}>
                Save score (wins only)
              </button>
              {!session && <p className="muted">Sign in to save.</p>}
              {submitMsg && <p>{submitMsg}</p>}
              {submitErr && <p className="error">{submitErr}</p>}
            </>
          )}
          <p style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn" onClick={startRun}>
              Play again
            </button>
          </p>
        </div>
      )}
    </>
  );
}
