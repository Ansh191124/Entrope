import type { WebSocket, WebSocketServer } from "ws";

export type RealtimeEventType =
  | "student.entered"
  | "student.exited"
  | "occupancy.updated"
  | "security.alert"
  | "gate.status_changed";

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: unknown;
}

// The custom server (see server/index.ts) assigns this once it boots the
// WebSocket server. Kept as a module-level singleton so any server module
// can broadcast without needing the server instance threaded through it.
let wss: WebSocketServer | null = null;

export function attachWebSocketServer(server: WebSocketServer) {
  wss = server;
}

export function isRealtimeAttached(): boolean {
  return wss !== null;
}

/**
 * Push an event to every connected dashboard. Clients treat this as a
 * "something changed, refetch the affected aggregate" signal rather than an
 * authoritative payload to blindly apply — see docs/ARCHITECTURE.md.
 */
export function broadcast(event: RealtimeEvent): void {
  if (!wss) return; // no-op outside the custom server (e.g. in unit tests)
  const message = JSON.stringify(event);
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}
