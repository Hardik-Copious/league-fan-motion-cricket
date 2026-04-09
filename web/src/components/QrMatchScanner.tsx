import { useCallback, useEffect, useRef, useState } from "react";
import { parseMatchIdFromQrText } from "../lib/parseMatchFromQr";

type Props = {
  onDecoded: (matchId: string) => void;
  onClose: () => void;
};

type BarcodeDetectorCtor = new (opts: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

export default function QrMatchScanner({ onDecoded, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [err, setErr] = useState<string | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    const BD = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!BD) {
      setErr("QR scanning needs a Chromium-based browser (BarcodeDetector API). Use Chrome or Edge, or type the Match ID.");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
        }
        const detector = new BD({ formats: ["qr_code"] });

        const loop = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              for (const c of codes) {
                const raw = c.rawValue?.trim();
                if (!raw) continue;
                const id = parseMatchIdFromQrText(raw);
                if (id) {
                  stop();
                  onDecoded(id);
                  return;
                }
              }
            } catch {
              /* frame decode noise */
            }
          }
          rafRef.current = requestAnimationFrame(() => void loop());
        };
        rafRef.current = requestAnimationFrame(() => void loop());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Camera unavailable. Allow camera or use HTTPS / localhost.");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onDecoded, stop]);

  return (
    <div className="qr-scan-modal" role="dialog" aria-label="Scan match QR">
      <div className="qr-scan-backdrop" onClick={onClose} />
      <div className="qr-scan-panel card">
        <h3>Scan Match QR</h3>
        <p className="muted small">Point the camera at the QR on the stadium screen. We only read the Match ID from the link.</p>
        {err && <p className="error">{err}</p>}
        {!err && (
          <div className="qr-scan-video-wrap">
            <video ref={videoRef} className="qr-scan-video" playsInline muted />
          </div>
        )}
        <p style={{ marginTop: "0.75rem" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </p>
      </div>
    </div>
  );
}
