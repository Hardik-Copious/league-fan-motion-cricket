/** Optional override (kept for fallback use only). */
export function originFromEnv(): string | null {
  const raw = import.meta.env.VITE_PHONE_URL_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

const STATIC_PHONE_ORIGIN = "https://league-fan-motion-cricket.vercel.app";

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Static mode: always use a fixed phone origin.
 */
export function defaultPhoneOrigin(): string {
  return originFromEnv() ?? STATIC_PHONE_ORIGIN;
}

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n > 255)) return false;
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  return false;
}

function extractPrivateIpv4(candidateLine: string): string | null {
  const re = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(candidateLine)) !== null) {
    const ip = m[1];
    if (isPrivateIpv4(ip)) return ip;
  }
  return null;
}

/**
 * Best-effort LAN IPv4 when the page is opened as localhost (so phone can use the same port).
 * May return null if blocked or slow; user can set VITE_PHONE_URL_ORIGIN instead.
 */
export function discoverLanIpv4ViaIce(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection === "undefined") {
      resolve(null);
      return;
    }

    let settled = false;
    const done = (ip: string | null) => {
      if (settled) return;
      settled = true;
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      clearTimeout(timer);
      resolve(ip);
    };

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    const timer = window.setTimeout(() => done(null), 4500);

    pc.createDataChannel("o");
    void pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => done(null));

    pc.onicecandidate = (ev) => {
      if (!ev.candidate?.candidate) return;
      const ip = extractPrivateIpv4(ev.candidate.candidate);
      if (ip) done(ip);
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        window.setTimeout(() => done(null), 500);
      }
    };
  });
}

export function buildLanOriginFromIp(ip: string): string {
  const port = window.location.port;
  const protocol = window.location.protocol;
  const p = port ? `:${port}` : "";
  return `${protocol}//${ip}${p}`;
}

export function shouldTryIceDiscovery(): boolean {
  return false;
}
