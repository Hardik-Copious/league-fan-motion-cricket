import { useCallback, useEffect, useRef } from "react";

type Opts = {
  onSwing: (peak: number, mag: number) => void;
  enabled: boolean;
  threshold?: number;
  cooldownMs?: number;
};

/**
 * Detects a swing spike from DeviceMotion (acceleration including gravity).
 * iOS 13+ may require a user gesture before motion events fire.
 */
export function useDeviceSwing({ onSwing, enabled, threshold = 18, cooldownMs = 650 }: Opts) {
  const lastFire = useRef(0);
  const baseline = useRef({ x: 0, y: 0, z: 0 });
  const baselineN = useRef(0);

  const handler = useCallback(
    (e: DeviceMotionEvent) => {
      if (!enabled) return;
      const now = performance.now();
      if (now - lastFire.current < cooldownMs) return;

      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;

      if (baselineN.current < 10) {
        baseline.current.x += a.x;
        baseline.current.y += a.y;
        baseline.current.z += a.z;
        baselineN.current += 1;
        return;
      }
      const n = baselineN.current;
      const bx = baseline.current.x / n;
      const by = baseline.current.y / n;
      const bz = baseline.current.z / n;

      const dx = a.x - bx;
      const dy = a.y - by;
      const dz = a.z - bz;
      const peak = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

      if (peak >= threshold) {
        lastFire.current = now;
        onSwing(peak, mag);
      }
    },
    [enabled, onSwing, threshold, cooldownMs]
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("devicemotion", handler, true);
    return () => window.removeEventListener("devicemotion", handler, true);
  }, [enabled, handler]);
}

/** Request motion permission on iOS Safari (call from a click handler). */
export async function requestMotionPermission(): Promise<boolean> {
  const anyWin = window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } };
  const req = anyWin.DeviceOrientationEvent?.requestPermission;
  if (typeof req === "function") {
    try {
      const s = await req.call(anyWin.DeviceOrientationEvent);
      return s === "granted";
    } catch {
      return false;
    }
  }
  return true;
}
