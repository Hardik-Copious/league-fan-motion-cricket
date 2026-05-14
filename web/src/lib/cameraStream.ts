type LegacyNavigator = Navigator & {
  webkitGetUserMedia?: (
    constraints: MediaStreamConstraints,
    success: (stream: MediaStream) => void,
    error: (err: unknown) => void
  ) => void;
  mozGetUserMedia?: (
    constraints: MediaStreamConstraints,
    success: (stream: MediaStream) => void,
    error: (err: unknown) => void
  ) => void;
  msGetUserMedia?: (
    constraints: MediaStreamConstraints,
    success: (stream: MediaStream) => void,
    error: (err: unknown) => void
  ) => void;
};

async function getUserMediaWithLegacy(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const nav = navigator as LegacyNavigator;
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const legacy = nav.webkitGetUserMedia ?? nav.mozGetUserMedia ?? nav.msGetUserMedia;
  if (legacy) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacy.call(nav, constraints, resolve, reject);
    });
  }
  throw new Error("Camera API unavailable. Open stadium on http://localhost:5173 or use HTTPS.");
}

/**
 * Prefer Logitech BRIO (or any device whose label matches /brio/i) after a short permission prime
 * so labels are visible. Falls back to laptop-style `facingMode: "user"`.
 */
export async function requestBrioOrUserFacingWebcam(): Promise<{ stream: MediaStream; label: string }> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    const stream = await getUserMediaWithLegacy({ video: { facingMode: "user" }, audio: false });
    return { stream, label: "Camera" };
  }

  try {
    const primer = await getUserMediaWithLegacy({ video: true, audio: false });
    primer.getTracks().forEach((t) => t.stop());
  } catch {
    /* no permission yet — enumerate may omit labels; still try Brio id if we had prior session */
  }

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    const stream = await getUserMediaWithLegacy({ video: { facingMode: "user" }, audio: false });
    return { stream, label: "Default camera" };
  }

  const brio = devices.find((d) => d.kind === "videoinput" && /brio/i.test(d.label));
  if (brio?.deviceId) {
    try {
      const stream = await getUserMediaWithLegacy({
        video: { deviceId: { exact: brio.deviceId } },
        audio: false,
      });
      return { stream, label: brio.label?.trim() || "Logitech BRIO" };
    } catch {
      /* unplugged or busy */
    }
  }

  const stream = await getUserMediaWithLegacy({ video: { facingMode: "user" }, audio: false });
  return { stream, label: "Built-in / default" };
}
