# Architecture

## Layering

```
src/app/**                 Next.js App Router pages (client components) + API route handlers
src/app/api/**/route.ts    Thin HTTP adapters: parse+validate input, check session/role,
                           call exactly one server module function, map the result/error to JSON.
src/server/modules/**      All business logic. One folder per domain (auth, students, security,
                           presence, gates, devices, analytics, audit, alerts, reports). Every
                           function here is directly unit/integration-testable without an HTTP
                           server.
src/server/lib/**          Cross-cutting primitives: Prisma client singleton, JWT signing,
                           QR crypto (nonce/signature), structured logger, AppError.
src/server/middleware/**   requireSession/requireRole (RBAC) and the rate limiter — called
                           explicitly at the top of each route handler, not as Next.js
                           middleware, because they need the Node crypto/Prisma runtime.
src/middleware.ts          Edge-runtime middleware: a cheap "is there a session cookie at all"
                           redirect, purely to avoid a flash of protected UI. NOT the security
                           boundary — see docs/SECURITY.md.
src/validations/**         Zod schemas, shared between client forms and server route handlers.
server/index.ts            Custom Node server: boots Next.js and an embedded `ws` WebSocket
                           server on the same HTTP server/port.
prisma/schema.prisma       The database schema — the actual source of truth for structure.
```

Business logic never lives inside a React component or directly inside a route handler. This
means the same `verifyScan`, `verifyExit`, `createStudent`, etc. functions used by the HTTP API
are exactly what the test suite calls — there is no separate "test-only" code path.

## Request flow (entry: officer's kiosk scans a student's QR)

```
Browser (officer's kiosk, camera-decoded student QR)
   │ POST /api/security/scan  { qr: {sessionId, nonce, expiresAt, sig}, deviceIdentifier, deviceSecret }
   ▼
src/app/api/security/scan/route.ts
   │ requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER")
   │ enforceRateLimit(...)
   │ verifyScanSchema.parse(body)
   ▼
src/server/modules/security/scan.service.ts :: verifyScan(input, scannedByUserId, ip)
   │ verifyQrSignature(qr)                       → tamper check, no DB hit yet
   │ authenticateDevice(deviceIdentifier, secret) → kiosk proves itself; gate derived from device
   │ prisma.$transaction(async tx => {
   │     SELECT security_sessions ... FOR UPDATE
   │     SELECT student_presence  ... FOR UPDATE
   │     <reject ALREADY_INSIDE; otherwise proceed as ENTRY — this path never produces an EXIT>
   │     INSERT access_events / UPDATE student_presence / UPDATE security_sessions
   │     INSERT audit_logs
   │ })
   ▼
broadcast({ type: "student.entered", ... })
broadcast({ type: "occupancy.updated", ... })
   ▼
Every connected dashboard's WebSocket handler invalidates its TanStack Query cache and refetches
```

## Request flow (exit: a student scans their gate's permanent QR)

```
Browser (student's own phone, camera-decoded gate exit QR)
   │ POST /api/security/exit  { qr: {exitCodeId, gateId, sig} }   (cookie: session JWT)
   ▼
src/app/api/security/exit/route.ts
   │ requireSessionWithRole(req, "STUDENT")     → identity + role, cryptographically verified
   │ enforceRateLimit(...)
   │ verifyExitSchema.parse(body)
   ▼
src/server/modules/security/scan.service.ts :: verifyExit(input, studentUserId, studentId, ip)
   │ verifyExitQrSignature(qr)                  → tamper check, no DB hit yet — distinct signing
   │                                               namespace from the entry QR's
   │ prisma.$transaction(async tx => {
   │     SELECT exit_codes       ... FOR UPDATE  → confirm active + gateId matches
   │     SELECT student_presence ... FOR UPDATE  → resolve the CALLER's own student id, never a
   │                                                client-supplied one
   │     <reject ALREADY_OUTSIDE; otherwise proceed as EXIT — this path never produces an ENTRY>
   │     INSERT access_events / UPDATE student_presence   (exit_codes row itself is untouched)
   │     INSERT audit_logs
   │ })
   ▼
broadcast({ type: "student.exited", ... })
broadcast({ type: "occupancy.updated", ... })
   ▼
Every connected dashboard's WebSocket handler invalidates its TanStack Query cache and refetches
```

## Realtime model

The embedded WebSocket server (`server/index.ts`, `src/server/realtime/broadcast.ts`) pushes small
"something changed" events — it never pushes the full authoritative state. `useRealtime`
(`src/hooks/useRealtime.ts`) reacts by invalidating the relevant TanStack Query keys, which then
refetch from the normal REST endpoints. This is deliberate: the frontend must never treat a
realtime payload as truth to apply directly (e.g. blindly `inside += 1`), because a dropped or
out-of-order message would then permanently desync the UI from the database. Refetching the
aggregate is slightly less "instant" but cannot drift.

## Why a custom server instead of `next dev`/`next start`

The realtime channel is a raw WebSocket server that needs to share the HTTP server's TCP port
with Next.js (so there's one process, one port, one thing to deploy/monitor). Next.js doesn't
expose its underlying HTTP server for this by default, so `server/index.ts` creates the server
itself, hands requests to Next's request handler, and intercepts the `upgrade` event for
WebSocket connections at the `/api/realtime` path only.
