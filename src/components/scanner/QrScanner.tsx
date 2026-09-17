"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrScannerProps {
  onDecoded: (raw: string) => void;
  onClose: () => void;
  label?: string;
}

/**
 * Reads camera frames and decodes a QR code client-side. The decoded text is
 * handed to the caller as an opaque string — this component has no idea
 * what's inside it and performs no validation; that all happens server-side.
 * Used by the security officer console to scan a student-generated QR.
 */
export function QrScanner({ onDecoded, onClose, label = "Scan student QR" }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const decodedRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId: number;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser doesn't support camera access. Try Chrome, Edge, or Safari.");
        return;
      }

      // Prefer a rear/environment camera (phones, tablets) but fall back to
      // whatever camera is available — laptops typically only expose a
      // single front-facing webcam, which some browsers reject outright if
      // "environment" is requested as the only option.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (err) {
          const name = err instanceof Error ? err.name : "";
          const message =
            name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access for this site in your browser settings and reload."
              : name === "NotFoundError"
                ? "No camera was found on this device."
                : name === "NotReadableError"
                  ? "The camera is already in use by another app. Close it and try again."
                  : "Camera access denied or unavailable. Check the browser's camera permission for this kiosk.";
          setError(message);
          return;
        }
      }

      try {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanLoop();
      } catch {
        setError("Camera access denied or unavailable. Check the browser's camera permission for this kiosk.");
      }
    }

    function scanLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || decodedRef.current) {
        rafId = requestAnimationFrame(scanLoop);
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && !decodedRef.current) {
            decodedRef.current = true;
            onDecoded(code.data);
            return;
          }
        }
      }
      rafId = requestAnimationFrame(scanLoop);
    }

    start();
    return () => {
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <div className="flex w-full max-w-sm items-center justify-between pb-4 text-white">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4" /> {label}
        </span>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose} aria-label="Close scanner">
          <X className="h-5 w-5" />
        </Button>
      </div>
      {error ? (
        <p className="max-w-sm text-center text-sm text-white">{error}</p>
      ) : (
        <video ref={videoRef} className="w-full max-w-sm rounded-lg" playsInline muted />
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
