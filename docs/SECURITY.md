# Security Model

## Authentication

- Passwords hashed with bcrypt (cost factor 12 for real accounts; tests use a lower cost purely
  for speed).
- On login (`POST /api/auth/login`), a JWT is signed (`src/server/lib/jwt.ts`) containing `sub`
  (user id), `role`, `email`, and — for students — `studentId`. It's set as an httpOnly,
  `SameSite=Lax` cookie (`secure` when `NODE_ENV=production`), never exposed to client JS.
- `login()` compares against a fixed dummy bcrypt hash when the email doesn't exist, so the
  response shape/timing doesn't reveal which emails are registered.
- Every protected route calls `requireSession`, which re-checks the user's `active` flag on every
  request — disabling an account takes effect immediately, not just on next login.

## Authorization (RBAC)

Four roles: `SUPER_ADMIN`, `ADMIN`, `SECURITY_OFFICER`, `STUDENT`. `requireSessionWithRole(req,
...roles)` (`src/server/middleware/auth.ts`) is called at the top of every route handler that
needs it — there is no role check implied by which page rendered the request. The
`RoleGuard` client component provides a fast redirect for a better UX, but it is **not** the
security boundary: an authorization decision is only ever trusted when it comes from the server.

| Role | Can | Cannot |
|---|---|---|
| SUPER_ADMIN | Everything | — |
| ADMIN | Manage students/gates/devices, view analytics/audit logs | Delete gates/students, manage admins |
| SECURITY_OFFICER | Generate/revoke QR sessions, view occupancy/alerts/students | Manage students, gates, devices, or view audit logs |
| STUDENT | View own profile/presence/history, scan QR as themselves | Everything else |

## QR session security

See [`QR_SYSTEM.md`](QR_SYSTEM.md) for the full design. Summary of controls:

- Opaque payload (`sessionId`, `nonce`, `expiresAt`, `sig`) — no student identity inside.
- Nonce: `crypto.randomBytes(32)`, never `Math.random()`, never sequential.
- HMAC-SHA256 signature over the payload using a server-only `QR_SECRET`; verified with a
  constant-time comparison (`crypto.timingSafeEqual`) to avoid timing side-channels.
- Every field the client provides is re-validated against the database inside the scan
  transaction — the signature only proves "we issued this and it wasn't altered in transit," not
  "this is still valid right now."
- Single-use: the session row is locked (`SELECT ... FOR UPDATE`) before its status is read, so
  consumption is atomic even under concurrent scans.

## Device security

- A device authenticates with its human-assigned `deviceIdentifier` + a secret whose bcrypt hash is stored
  (`devices.device_secret_hash`); the raw secret is shown exactly once, at registration.
- The gate a session is created for is **derived from the device's own `gateId`** — never accepted
  as a separate field from the client — so a device can only ever operate the gate it's assigned
  to.
- Disabling a device (`PATCH /api/devices/:id { active: false }`) immediately blocks new session
  creation (`authenticateDevice` checks `active`) and is re-checked again on every scan of
  sessions the device already issued, in case it's disabled mid-flight.

## Rate limiting

`src/server/middleware/rateLimit.ts` implements a fixed-window limiter, keyed per scope
(`login`, `qr-generate`, `scan`) and identifier (IP, or IP+studentId for scans). It's in-memory —
fine for a single process; swap for a Redis-backed limiter before running multiple instances
behind a load balancer (see `REDIS_URL` in `.env.example`).

## Audit logging

Every security-relevant action writes to `audit_logs` via `recordAudit()`
(`src/server/modules/audit/audit.service.ts`): logins, QR session create/revoke, every scan
outcome (success and every rejection code), student/gate/device create/update/deactivate, alert
resolution, and emergency-roster access. No route in this codebase issues `UPDATE` or `DELETE`
against `audit_logs` — it is append-only by construction, not just convention.

## Database transaction safety

The scan operation (`src/server/modules/security/scan.service.ts`) is the one place correctness
truly matters. It locks the `security_sessions` row, then the `student_presence` row, in that
fixed order across every call site — a consistent lock order is what prevents deadlocks between
concurrent scans. See `tests/concurrency/scanRace.test.ts` for the tests that exercise this under
real simultaneous requests against a real Postgres instance.

## Error safety

`toSafeErrorResponse()` (`src/server/lib/errors.ts`) is the only path by which an exception
becomes an HTTP response. A known `AppError` maps to its stable `code` + a safe message. Anything
else — a Prisma constraint violation, a connection error — becomes a generic `INTERNAL_ERROR`
with no leaked detail; the real error is logged server-side via the structured logger
(`src/server/lib/logger.ts`), which itself redacts known-sensitive field names
(`password`, `token`, `nonce`, `deviceSecret`, `sig`, ...) before writing a log line.

## What this build does not do (be aware before production)

- No WAF/DDoS-layer protection — that belongs in front of the app (Cloudflare, a cloud LB), not
  in application code.
- No CSRF token — mitigated by `SameSite=Lax` cookies plus the fact that all mutating endpoints
  require a JSON body (not a simple form-encoded cross-site request), but a dedicated CSRF token
  would be a reasonable hardening step for a real deployment.
- No automated dependency-vulnerability gate in CI — run `npm audit` as part of your pipeline.
