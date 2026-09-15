# Operations

## Health checks

- `GET /api/health` — process is up.
- `GET /api/health/database` — runs `SELECT 1` against Postgres; 503 if unreachable.
- `GET /api/health/realtime` — 503 if the WebSocket server hasn't attached (should only happen if
  you're running against plain `next dev`/`next start` instead of `npm run dev`/`npm run start`,
  which boot the custom server in `server/index.ts`).

Wire these into your platform's health-check / uptime monitoring.

## Structured logs

`src/server/lib/logger.ts` emits single-line JSON: `{ level, event, timestamp, ...fields }`,
with known-sensitive field names redacted automatically. Key `event` values to alert on:

| Event | Meaning |
|---|---|
| `LOGIN_FAILED` | wrong password or unknown email |
| `LOGIN_INACTIVE_ACCOUNT` | disabled account attempted login |
| `SCAN_REJECTED` | any rejected scan — check the `code` field for which failure |
| `ENTRY_RECORDED` / `EXIT_RECORDED` | successful scans |
| `UNHANDLED_API_ERROR` | an exception that wasn't a known `AppError` — investigate promptly |
| `SERVER_STARTED` | process boot |

Pipe stdout/stderr to your log aggregator (Datadog, CloudWatch, etc.) — no code changes needed for
basic ingestion since it's already newline-delimited JSON.

## Alerts (`alerts` table)

Raised automatically by `scan.service.ts` / `sessions.service.ts` on: reused QR, expired QR
attempt, inactive-student attempt, disabled device used, disabled gate used, suspended-student
scan attempt. View/resolve them at `/admin/alerts` or `GET /api/alerts` /
`POST /api/alerts/:id/resolve`. Severity (`INFO`/`WARNING`/`HIGH`/`CRITICAL`) is set per trigger —
tune the thresholds in `src/server/modules/security/scan.service.ts` if your environment needs
different sensitivity.

## Common operational tasks

- **Revoke a compromised device immediately**: `PATCH /api/devices/:id { "active": false }` (or
  the "Revoke" button under Admin → Gates & Devices). Takes effect on the very next request — no
  restart needed, because `authenticateDevice` and the scan transaction both re-check `active`
  live.
- **Disable a gate**: same pattern via `/api/gates/:id`.
- **Suspend a student**: currently a direct database update to `student_presence.status =
  'SUSPENDED'` (no dedicated UI/endpoint was built in this session — a natural next addition would
  be an admin action wrapping that update with an audit log entry, following the same pattern as
  `deactivateStudent`).
- **Rotate `QR_SECRET`**: safe at any time — it only invalidates QR sessions that haven't been
  scanned yet (they'll fail signature verification and need to be regenerated), not historical
  data.
- **Rotate `JWT_SECRET`**: invalidates every existing session — all users are logged out.

## Scaling notes

- The rate limiter and the WebSocket broadcast list both live in the single Node process's memory
  (`src/server/middleware/rateLimit.ts`, `src/server/realtime/broadcast.ts`). Running more than one
  instance behind a load balancer needs both moved to a shared store (Redis pub/sub for broadcast,
  Redis counters for rate limiting) — the interfaces are small and were written with that swap in
  mind.
- Prisma's connection pool size should be tuned relative to your Postgres plan's max connections
  if you run multiple instances.
