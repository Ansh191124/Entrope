import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { attachWebSocketServer } from "../src/server/realtime/broadcast";
import { verifySessionToken, SESSION_COOKIE_NAME } from "../src/server/lib/jwt";
import { logger } from "../src/server/lib/logger";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();
const handleUpgrade = app.getUpgradeHandler();

function extractCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  // Realtime dashboard channel. Requires a valid session cookie — occupancy
  // and security-alert data is only broadcast to authenticated staff/student
  // sessions, never to anonymous connections.
  const wss = new WebSocketServer({ noServer: true });
  attachWebSocketServer(wss);

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/");
    if (pathname !== "/api/realtime") {
      // Not ours — e.g. Next's own hot-reload websocket (/_next/webpack-hmr)
      // in dev. Hand it to Next's own upgrade handler instead of destroying
      // the socket, or Fast Refresh silently breaks.
      handleUpgrade(req, socket, head);
      return;
    }

    const token = extractCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    const session = token ? verifySessionToken(token) : null;
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "connected", payload: { ok: true } }));
  });

  server.listen(port, () => {
    logger.info("SERVER_STARTED", { port, dev });
  });
});
