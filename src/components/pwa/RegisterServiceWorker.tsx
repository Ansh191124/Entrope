"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker (public/sw.js). Renders nothing. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal — the app works fine without an active service worker,
      // it just won't be installable/offline-resilient.
    });
  }, []);

  return null;
}
