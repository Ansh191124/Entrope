"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface RealtimeMessage {
  type: "connected" | "student.entered" | "student.exited" | "occupancy.updated" | "security.alert" | "gate.status_changed";
  payload: unknown;
}

/**
 * Subscribes to the realtime channel and treats every message as a
 * "something changed, refetch" signal — never applies a payload directly to
 * the UI as truth. See docs/ARCHITECTURE.md for the rationale.
 */
export function useRealtime(onMessage?: (msg: RealtimeMessage) => void) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryDelay = 1000;

    function connect() {
      if (cancelled) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/api/realtime`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as RealtimeMessage;
          if (msg.type === "occupancy.updated" || msg.type === "student.entered" || msg.type === "student.exited") {
            queryClient.invalidateQueries({ queryKey: ["presence"] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
          }
          if (msg.type === "security.alert") {
            queryClient.invalidateQueries({ queryKey: ["alerts"] });
          }
          onMessage?.(msg);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
