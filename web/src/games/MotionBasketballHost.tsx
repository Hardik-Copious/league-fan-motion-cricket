import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { supabase } from "../supabaseClient";
import { requestBrioOrUserFacingWebcam } from "../lib/cameraStream";
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
  compositeDrillScore,
  DRILL_SECONDS,
  MOTION_BASKETBALL_GAME_TYPE,
  type CourtZone,
} from "./motionBasketball";

const ZONE_LABEL: Record<CourtZone, string> = {
  left_wing: "Left wing",
  right_wing: "Right wing",
  paint: "Paint",
  top_of_key: "Top of key",
  unknown: "—",
};

export default function MotionBasketballHost({ session }: { session: Session | null }) {
  const [params] = useSearchParams();
  const matchFromQuery = params.get("match")?.trim().toUpperCase() ?? "";
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<Awaited<ReturnType<typeof poseDetection.createDetector>> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const drillStartMsRef = useRef<number>(0);
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
  const ballTapsRef = useRef(0);

  const [generatedHostId] = useState<string>(() =>
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `host${Math.random().toString(36).slice(2, 14)}`)
      .slice(0, 8)
      .toUpperCase()
  );
  const hostId = matchFromQuery || generatedHostId;

  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "playing" | "done">("idle");
  const [poseError, setPoseError] = useState<string | null>(null);
  const [drillLeftSec, setDrillLeftSec] = useState(DRILL_SECONDS);
  const [liveZone, setLiveZone] = useState<CourtZone>("unknown");
  const [liveTags, setLiveTags] = useState<string[]>([]);
  const [shotReps, setShotReps] = useState(0);
  const [squatReps, setSquatReps] = useState(0);
  const [defensiveReps, setDefensiveReps] = useState(0);
  const [zoneSummary, setZoneSummary] = useState<Partial<Record<CourtZone, number>>>({});
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

  const totalScore = useMemo(
    () => compositeDrillScore({ shot: shotReps, squat: squatReps, defensive: defensiveReps }),
    [shotReps, squatReps, defensiveReps]
  );

  const pushUi = useCallback(
    (now: number, partial: Partial<{ zone: CourtZone; tags: string[]; drillLeft: number }>, force?: boolean) => {
      if (!force && now - lastUiTickRef.current < 220) return;
      lastUiTickRef.current = now;
      if (partial.zone != null) setLiveZone(partial.zone);
      if (partial.tags != null) setLiveTags(partial.tags);
      if (partial.drillLeft != null) setDrillLeftSec(partial.drillLeft);
      setShotReps(shotRepRef.current);
      setSquatReps(squatRepRef.current);
      setDefensiveReps(defensiveRepRef.current);
      setZoneSummary({ ...zoneMsRef.current });
    },
    []
  );

  const saveDeviceHistoryIfNeeded = useCallback(() => {
    if (deviceHistorySavedRef.current) return;
    deviceHistorySavedRef.current = true;
    appendPreviousMatch({
      matchId: hostId,
      runs: compositeDrillScore({
        shot: shotRepRef.current,
        squat: squatRepRef.current,
        defensive: defensiveRepRef.current,
      }),
      wickets: 0,
      balls: shotRepRef.current + squatRepRef.current + defensiveRepRef.current,
    });
  }, [hostId]);

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
      ballTapsRef.current = 0;

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

          const domRw = kp?.[10];
          const domLw = kp?.[9];
          const useR = (domRw?.score ?? 0) >= (domLw?.score ?? 0);
          const wy = useR ? domRw?.y : domLw?.y;
          const prevY = prevDomWristYRef.current;
          let wristUpVelNorm = 0;
          if (wy != null && prevY != null) {
            wristUpVelNorm = Math.min(1, Math.max(0, (prevY - wy) / (h * 0.03)));
          }

          if (playingRef.current && drillStartMsRef.current > 0) {
            const elapsed = (now - drillStartMsRef.current) / 1000;
            const left = Math.max(0, Math.ceil(DRILL_SECONDS - elapsed));

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

            if (elapsed >= DRILL_SECONDS) {
              playingRef.current = false;
              saveDeviceHistoryIfNeeded();
              setPhase("done");
              pushUi(now, { drillLeft: 0, zone: analytics.zone, tags: analytics.tags }, true);
            } else {
              pushUi(now, { zone: analytics.zone, tags: analytics.tags, drillLeft: left });
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
            if (hits > 0) ballTapsRef.current += hits;
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

          // Analytics HUD on canvas
          const elapsed = playingRef.current && drillStartMsRef.current > 0 ? (now - drillStartMsRef.current) / 1000 : 0;
          const leftSec = Math.max(0, Math.ceil(DRILL_SECONDS - elapsed));
          ctx.fillStyle = "rgba(7,10,16,0.72)";
          ctx.fillRect(12, 12, w * 0.36, h * 0.2);
          ctx.fillStyle = "rgba(255,248,240,0.95)";
          ctx.font = `${Math.max(12, Math.floor(w * 0.018))}px sans-serif`;
          ctx.fillText(`Zone: ${ZONE_LABEL[analytics.zone]}`, 22, 34);
          ctx.font = `${Math.max(11, Math.floor(w * 0.014))}px sans-serif`;
          const tagLine = analytics.tags.slice(0, 3).join(" · ") || "Scanning pose…";
          ctx.fillStyle = "rgba(253, 224, 200, 0.9)";
          ctx.fillText(tagLine, 22, 58);
          ctx.fillStyle = "rgba(255,255,255,0.88)";
          ctx.fillText(`Shots ${shotRepRef.current} · Squats ${squatRepRef.current} · Stance ${defensiveRepRef.current} · Balls ${ballTapsRef.current}`, 22, 82);
          ctx.fillText(playingRef.current ? `Clock ${leftSec}s` : "Press Start drill", 22, 106);

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

  function startDrill() {
    deviceHistorySavedRef.current = false;
    shotRepRef.current = 0;
    squatRepRef.current = 0;
    defensiveRepRef.current = 0;
    defensiveHoldMsRef.current = 0;
    zoneMsRef.current = {};
    lastShotAtRef.current = 0;
    prevDomWristYRef.current = null;
    squatArmedRef.current = false;
    lastFrameMsRef.current = 0;
    trajTrailRef.current = [];
    ballTapsRef.current = 0;
    virtualBallsRef.current = spawnVirtualCourtBalls();
    drillStartMsRef.current = performance.now();
    playingRef.current = true;
    setPhase("playing");
    setDrillLeftSec(DRILL_SECONDS);
    setShotReps(0);
    setSquatReps(0);
    setDefensiveReps(0);
    setZoneSummary({});
    setLiveTags([]);
    setLiveZone("unknown");
  }

  function endDrillEarly() {
    playingRef.current = false;
    saveDeviceHistoryIfNeeded();
    setPhase("done");
    setDrillLeftSec(0);
    pushUi(performance.now(), { drillLeft: 0 }, true);
  }

  async function submitScore() {
    setSubmitErr(null);
    setSubmitMsg(null);
    if (!session?.user) {
      setSubmitErr("Sign in to save your score.");
      return;
    }
    const score = compositeDrillScore({ shot: shotReps, squat: squatReps, defensive: defensiveReps });
    const { error } = await supabase.from("game_sessions").insert({
      user_id: session.user.id,
      game_type: MOTION_BASKETBALL_GAME_TYPE,
      score,
      duration_ms: DRILL_SECONDS * 1000,
      metadata: {
        source: "motion_basketball_host",
        shot_reps: shotReps,
        squat_reps: squatReps,
        defensive_reps: defensiveReps,
        zone_ms: zoneSummary,
      },
    });
    if (error) setSubmitErr(error.message);
    else setSubmitMsg("Score saved to leaderboard.");
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
      <h1>Motion basketball — analytics court</h1>
      <p className="muted">
        Same setup as motion cricket: <strong>webcam</strong> (prefers Logitech <strong>BRIO</strong> when its name
        appears in device list, otherwise built-in <code>facingMode: &quot;user&quot;</code>), <strong>MoveNet</strong>{" "}
        pose on-device, mirrored athlete on a half-court projection. The drill scores{" "}
        <strong>release peaks</strong> (pocket + upward wrist burst), <strong>squat depth cycles</strong>, and{" "}
        <strong>defensive holds</strong> (wide base + knee bend). Enable <strong>Side profile (2D)</strong> for a shooter-on-the-left,
        hoop-on-the-right view with a <strong>parabolic shot arc</strong> (like a physics side view). Turn on <strong>shot trail / arc</strong>{" "}
        to visualize release — on the half-court it traces the wrist; in side profile it draws the flight path toward the rim.
      </p>
      <p className="muted small">
        Session ID: <strong>{hostId}</strong> (optional — share from{" "}
        <Link to="/games/match">Match Lobby</Link> if you use the same flow as cricket).
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
          <button type="button" className="btn primary" onClick={startDrill}>
            Start {DRILL_SECONDS}s drill
          </button>
        </p>
      )}

      {(phase === "playing" || phase === "done") && (
        <div className="card motion-cricket-scoreboard">
          <div>
            <strong>Score:</strong> {totalScore} &nbsp;
            <strong>Clock:</strong> {phase === "playing" ? `${drillLeftSec}s` : "0s"} &nbsp;
            <strong>Zone:</strong> {ZONE_LABEL[liveZone]}
          </div>
          <p className="muted small">
            Reps — shots: {shotReps}, squats: {squatReps}, defensive: {defensiveReps}
          </p>
          {liveTags.length > 0 && <p className="motion-cricket-feedback">{liveTags.join(" · ")}</p>}
          <p className="muted small">
            Floor tint shows where you spent time (paint vs wings). Metrics are heuristics for fun training, not medical
            advice.
          </p>
          {Object.keys(zoneSummary).length > 0 && (
            <ul className="muted small" style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
              {(Object.entries(zoneSummary) as [CourtZone, number][]).map(([z, ms]) =>
                ms > 0 ? (
                  <li key={z}>
                    {ZONE_LABEL[z]}: {(ms / 1000).toFixed(1)}s
                  </li>
                ) : null
              )}
            </ul>
          )}
          {phase === "playing" && (
            <p style={{ marginTop: "0.75rem" }}>
              <button type="button" className="btn" onClick={endDrillEarly}>
                End drill & save to device history
              </button>
            </p>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="card">
          <h2>Drill complete</h2>
          <p>
            Total <strong>{totalScore}</strong> points ({shotReps} shot peaks, {squatReps} squats, {defensiveReps}{" "}
            defensive segments).
          </p>
          <button type="button" className="btn primary" onClick={() => void submitScore()} disabled={!session}>
            Save score
          </button>
          {!session && <p className="muted">Sign in to save.</p>}
          {submitMsg && <p>{submitMsg}</p>}
          {submitErr && <p className="error">{submitErr}</p>}
          <p style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn" onClick={startDrill}>
              Run again
            </button>
            <span className="muted small" style={{ marginLeft: "0.5rem" }}>
              Or return to camera ready state via refresh if you need to reset the stream.
            </span>
          </p>
        </div>
      )}
    </>
  );
}
