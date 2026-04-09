/**
 * Extract Match ID from scanned QR text (full URL or query fragment).
 */
export function parseMatchIdFromQrText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  try {
    const u = new URL(t, typeof window !== "undefined" ? window.location.origin : "https://localhost");
    const host = u.searchParams.get("host")?.trim();
    if (host) return host.toUpperCase();
    const match = u.searchParams.get("match")?.trim();
    if (match) return match.toUpperCase();
  } catch {
    /* ignore */
  }

  const hostEq = /[?&#]host=([^&]+)/i.exec(t);
  if (hostEq?.[1]) return decodeURIComponent(hostEq[1]).toUpperCase().replace(/\s/g, "");
  const matchEq = /[?&#]match=([^&]+)/i.exec(t);
  if (matchEq?.[1]) return decodeURIComponent(matchEq[1]).toUpperCase().replace(/\s/g, "");

  const upper = t.toUpperCase().replace(/\s/g, "");

  if (/^[A-Z0-9]{4,16}$/.test(upper)) {
    return upper;
  }

  return null;
}
