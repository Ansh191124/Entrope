# CampusGuard

**QR-Based Campus Security & Real-Time Occupancy Management System**

CampusGuard is a security/access-control system, not an attendance app. It tracks who is
physically inside a campus or building right now, using short-lived, single-use, server-issued
QR sessions scanned by authenticated students at staffed gates. The backend — never the
frontend, never the QR code itself — is the single source of truth for who is inside.

---

## Table of contents

- [What is CampusGuard?](#what-is-campusguard)
- [Core concept](#core-concept)
- [How the system works](#how-the-system-works)
- [Entry example](#entry-example)
- [Exit example](#exit-example)
- [Why neither QR can be abused](#why-neither-qr-can-be-abused)
- [Architecture](#architecture)
- [Database architecture](#database-architecture)
- [Presence state machine](#presence-state-machine)
- [Security model](#security-model)
- [API documentation](#api-documentation)
- [Installation](#installation)
- [Database setup](#database-setup)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Production checklist](#production-checklist)
- [Troubleshooting](#troubleshooting)
- [Future improvements](#future-improvements)
- [What's implemented vs. best-effort / deferred](#whats-implemented-vs-best-effort--deferred)

---

## What is CampusGuard?

Traditional QR attendance systems generate one static QR code per student and call it "secure."
That QR is a bearer credential: anyone with a photo of it can mark someone else present, replay
it indefinitely, or forge one with a guessable student ID. CampusGuard rejects that model, but
also splits ENTRY and EXIT into two deliberately different mechanisms, each shaped for how it's
actually used at a real gate:

- **ENTRY** — a student generates their own short-lived, single-use QR on their phone; a security
  officer's registered kiosk scans it to verify the student against the database and record the
  entry. The QR never carries the student's identity in the clear — it's an opaque reference to a
  session — and it dies the instant it's used.
- **EXIT** — a security officer displays or prints a **permanent** QR for their gate (on a screen,
  or posted on the wall). A student scans *that* themselves, on their own phone, while logged in,
  to mark themselves as leaving. This QR is reusable by design — it's meant to sit on a wall for
  months — because it never carries anyone's identity either: it only ever says "this is the exit
  QR for Gate X." What makes self-service exit safe is that the *scanning* side must be an
  authenticated student, and the backend still refuses to "exit" someone who isn't currently
  marked inside.

In both directions, the backend — never the frontend, never the QR itself — is the single source
of truth for who is inside, and every state transition happens inside one locked database
transaction.

## Core concept

```
ENTRY                                          EXIT
─────                                          ────
Student (their own phone)                      Security Officer (their kiosk)
    │ generates                                    │ generates/displays once
    ▼                                               ▼
Dynamic Security Session                       Permanent Exit Code
(random nonce, TTL 10-60s,                     (no expiry, reusable,
 single-use, no identity inside)                no identity inside)
    │ signed & rendered as QR                       │ signed & rendered as QR
    ▼                                               ▼
Officer's registered device scans it           Student scans it themselves
    │                                               │
    ▼                                               ▼
Backend: signature → device auth →             Backend: signature → gate active →
  session active/unexpired/unconsumed            code active → caller is an
  → student exists & active                       authenticated, active student
    │                                               │
    ▼                                               ▼
Reject if already INSIDE                       Reject if already OUTSIDE
    │                                               │
    ▼                                               ▼
Atomic: write ENTRY event → flip presence      Atomic: write EXIT event → flip presence
  → consume session → audit log                  → audit log (exit code stays reusable)
    │                                               │
    └───────────────────┬───────────────────────────┘
                         ▼
          Realtime broadcast → dashboards update without a page refresh
```

## How the system works

**Entry:**
1. A security officer opens the gate console (`/security`) and, once, configures the kiosk with
   a registered device identifier + secret (issued by an admin under **Gates & Devices**).
2. A student, logged into their own account, opens `/student` and taps **GENERATE ENTRY QR**. The
   server mints a session bound to that student with a random nonce and returns a signed,
   short-lived QR payload — the gate is deliberately not chosen here; it's whichever device ends
   up scanning it.
3. The officer's kiosk scans it (`/security` → **SCAN STUDENT QR**). The client decodes the QR
   locally and POSTs the raw payload plus the kiosk's own device credentials to
   `POST /api/security/scan`.
4. The server authenticates the device (deriving the gate from the device's own registration,
   never from client input), verifies the HMAC signature, then — inside one locked transaction —
   re-validates everything against the database: session exists, is `ACTIVE`, hasn't expired.
   It looks up the student the session belongs to, confirms they're active, locks their presence
   row, and rejects with `ALREADY_INSIDE` if they're already in. Otherwise it writes the ENTRY
   event, flips presence to `INSIDE`, marks the session `CONSUMED`, and appends an audit log entry
   — all in the same transaction.
5. The result broadcasts over WebSocket; every open dashboard refetches the affected data.

**Exit:**
1. From the same configured kiosk, the officer's console also shows a permanent **Exit QR** for
   its gate (created lazily on first use, fetched idempotently after that) — displayed on screen
   or printed and posted at the exit.
2. A student who is currently inside scans *that* QR with their own phone (`/student` →
   **SCAN TO EXIT**) and POSTs it to `POST /api/security/exit` — no device credentials involved,
   since the scanning side is the student, not a kiosk.
3. The server verifies the signature, confirms the referenced exit code is active and belongs to
   an active gate, resolves the caller's own student record (never a client-supplied id), locks
   their presence row, and rejects with `ALREADY_OUTSIDE` if they're not currently inside.
   Otherwise it writes the EXIT event (with computed stay duration), flips presence to `OUTSIDE`,
   and appends an audit log entry attributed to the student themselves.
4. The exit code itself is untouched — it stays valid for the next student, until an officer
   explicitly revokes/regenerates it.

## Entry example

```
Student generates their entry QR → officer's kiosk scans it (student is currently OUTSIDE)

Response:
  ENTRY SUCCESSFUL — verified
  Student:  John Doe (CG2024001)
  Time:     10:42:31 AM
  Gate:     Main Gate
  Current Occupancy: 148 inside / 52 outside
```

## Exit example

```
Student scans the exit QR posted at Main Gate (they are currently INSIDE)

Response:
  EXIT RECORDED
  Student:  John Doe (CG2024001)
  Entered:  09:12:41 AM
  Exited:   04:42:15 PM
  Duration: 7h 29m
  Current Occupancy: 147 inside / 53 outside
```

Neither flow lets the client declare "this is an entry" or "this is an exit." The entry path
rejects an already-inside student outright rather than silently reinterpreting the scan as an
exit; the exit path rejects an already-outside student the same way. See
[`docs/PRESENCE_STATE_MACHINE.md`](docs/PRESENCE_STATE_MACHINE.md) for the full transition table.

## Why neither QR can be abused

**The dynamic entry QR:**
- **TTL** — every session carries a server-issued `expiresAt` (default 20s, checked against the
  server clock inside the transaction, never the client-supplied timestamp). An expired session is
  also flipped to `EXPIRED` in the same transaction so it's visibly dead, not just silently rejected.
- **Nonce** — a 256-bit value from Node's `crypto.randomBytes` (never `Math.random`, never
  sequential), hashed before storage.
- **Single-use consumption** — the session row is locked with `SELECT ... FOR UPDATE` before its
  `status` is checked; a second scan of the same QR, even arriving at the same instant, sees
  `CONSUMED` (or loses the row-lock race and gets it a moment later).
- **No identity inside** — the payload is `{sessionId, nonce, expiresAt, sig}`; the student is
  resolved server-side from the session record, never from anything the scanning device sends.

**The permanent exit QR:**
- **Deliberately not secret** — it's designed to be posted publicly, so there is no TTL or
  single-use property to defeat in the first place. Its signature only proves it's a genuine,
  unmodified CampusGuard exit QR for a specific gate — it proves nothing about who's scanning it.
- **The real boundary is the scanner's own login** — whoever scans it can only ever mark
  *themselves* as exited, because the student identity comes from their own authenticated
  session, never from the QR or the request body.
- **Presence is still checked** — scanning it while already `OUTSIDE` is rejected
  (`ALREADY_OUTSIDE`); scanning it while `SUSPENDED` is rejected (`STUDENT_SUSPENDED`). A
  photocopy of the poster can't manufacture a fake exit for someone who never entered.

**Both share:** HMAC-SHA256 signatures under a server-only `QR_SECRET` (verified with
`crypto.timingSafeEqual`), so a forged or tampered payload fails before any database row is read.

## Architecture

```
 Browser (student / officer / admin)
        │
        ▼
 Next.js App Router  (pages under src/app/**)
        │  fetch()
        ▼
 API Route Handlers  (src/app/api/**/route.ts — thin, no business logic)
        │  calls
        ▼
 Server Modules      (src/server/modules/** — auth, students, security (sessions,
        │             scan, exitCode), presence, gates, devices, analytics, audit, alerts)
        │  Prisma
        ▼
 PostgreSQL           (prisma/schema.prisma, row-level locking for the scan transaction)
        │
        ▼
 Realtime broadcast   (embedded ws server in server/index.ts)
        │
        ▼
 Dashboards           (TanStack Query refetch on realtime "something changed" signal)
```

Business logic never lives inside a React component or an API route handler — every route calls
into a `server/modules/<domain>/*.service.ts` function, so the same logic is reachable
identically from tests.

## Database architecture

See [`docs/DATABASE.md`](docs/DATABASE.md) for full column-by-column documentation. Summary of
tables (`prisma/schema.prisma` is the source of truth):

| Table | Purpose |
|---|---|
| `users` | Login identity + role (RBAC) for every account, staff or student |
| `students` | Student profile fields (enrollment no., department, course, etc.) |
| `student_presence` | **Authoritative** current INSIDE/OUTSIDE/SUSPENDED state — one row per student |
| `gates` | Physical gates (Main Gate, Hostel Gate, ...) |
| `devices` | Registered scanning kiosks, each bound to exactly one gate, secret stored as a bcrypt hash |
| `security_sessions` | The dynamic, single-use ENTRY QR sessions — nonce hash, status, expiry |
| `exit_codes` | The permanent, reusable EXIT QR per gate — no expiry, revocable/regenerable |
| `access_events` | Immutable ENTRY/EXIT ledger, one row per verified scan |
| `audit_logs` | Append-only forensic trail of every security-relevant action |
| `alerts` | Security alerts raised by suspicious scan patterns |
| `system_settings` | Key/value runtime configuration |

## Presence state machine

```
        entry QR verified (student was OUTSIDE)
   ┌──────────────────────────────────────────┐
   │                                          ▼
OUTSIDE                                    INSIDE
   ▲                                          │
   └──────────────────────────────────────────┘
        exit QR verified (student was INSIDE)

SUSPENDED is a separate, sticky state: a scan while SUSPENDED is always rejected
(STUDENT_SUSPENDED) and never changes presence. Neither flow accepts a client-declared
"I want to ENTER/EXIT" input: the entry path rejects outright if presence is already
INSIDE (ALREADY_INSIDE); the exit path rejects outright if presence is already
OUTSIDE (ALREADY_OUTSIDE). "Duplicate entry" and "duplicate exit" are structurally
impossible outcomes, not just validated-against ones.
```

See [`docs/PRESENCE_STATE_MACHINE.md`](docs/PRESENCE_STATE_MACHINE.md) for the full transition
table and the concurrency argument for why it holds under simultaneous scans.

## Security model

Full detail in [`docs/SECURITY.md`](docs/SECURITY.md). Highlights:

- **Authentication** — bcrypt-hashed passwords, JWT session token in an httpOnly, `SameSite=Lax`
  cookie (`secure` in production). No client-readable auth state.
- **Authorization (RBAC)** — `SUPER_ADMIN`, `ADMIN`, `SECURITY_OFFICER`, `STUDENT`, enforced in
  every route handler via `requireSessionWithRole` — never inferred from the UI.
- **QR security** — see [Why neither QR can be abused](#why-neither-qr-can-be-abused) above
  and [`docs/QR_SYSTEM.md`](docs/QR_SYSTEM.md).
- **Device security** — devices authenticate with a bcrypt-hashed secret and are only ever
  involved on the entry side (the kiosk scanning a student's dynamic QR); disabling a device
  (§25, e.g. reported stolen) immediately blocks new sessions and is re-checked on every scan of
  sessions it already issued. The exit side has no device in the loop at all — see
  [`docs/QR_SYSTEM.md`](docs/QR_SYSTEM.md) for why that's still safe.
- **Rate limiting** — per-identifier fixed-window limiter on login, QR generation, entry
  verification, and exit endpoints (`src/server/middleware/rateLimit.ts`).
- **Audit logging** — every login, QR/exit-code generation or revocation, entry/exit verification
  (success and rejection), student/gate/device mutation, and emergency-roster access is recorded
  in `audit_logs`, which no route ever updates or deletes.
- **Transaction safety** — both the entry (`scan.service.ts::verifyScan`) and exit
  (`scan.service.ts::verifyExit`) operations lock their respective session/code row and the
  presence row with `SELECT ... FOR UPDATE` inside one Postgres transaction; see the concurrency
  tests in `tests/concurrency/`.
- **Error safety** — `toSafeErrorResponse` (`src/server/lib/errors.ts`) guarantees raw
  exception text (stack traces, DB constraint messages, connection strings) never reaches a
  client response; only a stable error code and a safe message do.

## API documentation

Full reference in [`docs/API.md`](docs/API.md). Every endpoint requires an authenticated session
(httpOnly cookie) except `/api/auth/login` and `/api/health*`.

## Installation

Requires Node.js 20+ and PostgreSQL 14+ (either via Docker or a native install).

```bash
git clone <this-repo>
cd Project-Entrop
npm install
cp .env.example .env
# edit .env — set JWT_SECRET and QR_SECRET (e.g. `openssl rand -hex 32` for each)
```

## Database setup

**Option A — Docker (recommended for local dev):**

```bash
docker compose up -d
npx prisma migrate dev
npm run prisma:seed
```

If this fails with `unable to get image ... failed to connect to the docker API at
npipe:////./pipe/dockerDesktopLinuxEngine`, Docker Desktop is installed but its engine isn't
running yet. On a fresh install it needs a one-time interactive setup (accept the license
agreement, pick the WSL2 backend) that only completes by opening the Docker Desktop app itself and
clicking through it once — this can't be scripted. Open Docker Desktop, wait for it to report
"running," then retry `docker compose up -d`. If you'd rather not deal with Docker Desktop at all,
use Option B below instead — the two are interchangeable, and both use `localhost:5432` by
default, so **pick one, not both**: running Docker's Postgres while a native install is also bound
to port 5432 fails with a port-already-in-use error, not a helpful one.

**Option B — a native PostgreSQL install:** create two databases (`campusguard` and
`campusguard_test`) and point `DATABASE_URL` / `TEST_DATABASE_URL` in `.env` at them, then run the
same `prisma migrate dev` / `prisma:seed` commands. On Windows without Docker, `winget install
PostgreSQL.PostgreSQL.16` works well; the installer's default superuser password is worth noting
down since you'll need it to create the two databases above.

Seeding creates ~120 fictional students across 5 departments, 6 gates with one kiosk device each,
and four staff accounts (credentials printed to the console — see
[`prisma/seed.ts`](prisma/seed.ts)). No real personal data is used anywhere in the seed.

## Development

```bash
npm run dev          # custom server: Next.js + embedded WebSocket, http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

The dev server is a small custom Node server (`server/index.ts`) rather than plain
`next dev`, because the realtime channel is a raw `ws` WebSocket server sharing the same HTTP
server and port — there is no separate realtime process to run.

## Testing

```bash
npm run test              # everything
npm run test:unit         # crypto, RBAC, error-safety — no DB required
npm run test:integration  # full ENTRY/EXIT flows, every rejection path
npm run test:concurrency  # the property the whole system depends on — see below
npm run test:security     # rate limiting, JWT tampering, injection-shaped input, QR forgery
```

Integration/concurrency tests run against a **dedicated** `campusguard_test` database
(`TEST_DATABASE_URL`) that is schema-pushed and truncated automatically — never point it at data
you care about. See [`docs/TESTING.md`](docs/TESTING.md) for what each suite actually proves,
including the concurrency test that fires 15 simultaneous scans of the same QR and asserts exactly
one succeeds.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full walkthrough (Vercel for the app,
managed Postgres for the database, environment variable checklist, and how to swap in real
Supabase Auth/Realtime instead of the built-in JWT/WebSocket implementation if you prefer that).
**This repository has not been deployed to a live cloud environment as part of this build** — no
cloud account/credentials were available in the environment it was built in. The steps are
documented and are the same steps you'd run yourself.

## Production checklist

- [ ] HTTPS terminated in front of the app (cookies are marked `secure` in production, which
      requires it)
- [ ] `JWT_SECRET` / `QR_SECRET` are long, random, and unique per environment (never reuse the
      `.env.example` placeholders)
- [ ] Production secrets are provided via your platform's secret manager, not committed
- [ ] Automated database backups configured
- [ ] Rate limiting moved from the in-memory limiter to a shared store (Redis) if you run more
      than one app instance
- [ ] Row Level Security (RLS) enabled if you migrate to Supabase-managed Postgres
- [ ] Audit logging retention/export policy decided
- [ ] Every device has been registered through the admin UI (no shared/default credentials)
- [ ] Monitoring + error tracking wired to `/api/health`, `/api/health/database`,
      `/api/health/realtime`
- [ ] Concurrency tests (`npm run test:concurrency`) passing against the target Postgres version
- [ ] QR replay tests (`npm run test:integration`) passing
- [ ] `npm audit` re-run and dependencies (especially `next`) updated to their latest patched
      release — see the note in [What's implemented vs. best-effort](#whats-implemented-vs-best-effort--deferred)

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `QR_SECRET is not configured` error | `.env` missing/incomplete — copy `.env.example` and fill in real secrets |
| Prisma errors on startup | `DATABASE_URL` unreachable — confirm Postgres is running (`docker compose ps`, or the native service if you used Option B) |
| `unable to get image ... failed to connect to the docker API` | Docker Desktop isn't running / hasn't finished its one-time interactive setup — see [Database setup](#database-setup) Option A, or switch to Option B |
| `docker compose up -d` fails with a port-in-use error on 5432 | A native Postgres install is already bound to that port — pick one setup, not both (see Option A above) |
| WebSocket keeps reconnecting in the browser console | Make sure you're running `npm run dev` (the custom server), not plain `next dev` |
| Camera scanner shows "Camera access denied" | Browser needs HTTPS or `localhost` + camera permission granted |
| CSV import rejects every row | Check the header row matches exactly: `enrollmentNo,name,email,department,course,year,semester` (`phone`, `section` optional) |
| Concurrency tests fail intermittently | Confirm `TEST_DATABASE_URL` points at a real dedicated Postgres instance, not a mock — the whole point of that suite is real row locking |
| "Install" doesn't appear on the student page | Chrome/Android only fires `beforeinstallprompt` over HTTPS (or `localhost`) once its own installability/engagement heuristics are met — it can take a few visits. iOS Safari has no such prompt at all; use Share → Add to Home Screen there instead |

## Student PWA

The student experience (`/student`) is installable as a Progressive Web App — students can add it
to their phone's home screen and it opens full-screen, no browser chrome. This is packaging, not a
separate codebase: it's the same `/student` page, React Query, and API calls documented above.

- **Manifest** — `src/app/manifest.ts` (Next.js auto-serves it at `/manifest.webmanifest` and links
  it from every page). `start_url` points at `/student` specifically.
- **Icons** — generated at request time via `next/og`'s `ImageResponse` (`src/app/icon-192.png/`,
  `icon-512.png/`, `apple-touch-icon.png/`), not static files, so there's nothing to regenerate by
  hand if the brand mark changes — edit `src/app/_icon/shieldIcon.tsx` once.
- **Service worker** — `public/sw.js`, registered by `src/components/pwa/RegisterServiceWorker.tsx`
  in the root layout. It caches only the static app shell; it explicitly never touches anything
  under `/api/` — presence status and QR/exit-code verification must always hit the network live,
  never a stale cache, since this is a security system, not a content site.
- **Install prompt** — `src/hooks/useInstallPrompt.ts` wraps the `beforeinstallprompt` event so the
  student page can show its own "Install" banner instead of waiting on the browser's default UI.

## Student native mobile app

[`mobile/`](mobile/) is a separate, true native app (Expo/React Native) — not the PWA above —
covering the same student features: status, Generate Entry QR, Scan to Exit, history. It's its
own project (own `package.json`, own TypeScript project, explicitly excluded from this project's
`tsconfig.json`/ESLint config so the two never cross-contaminate each other's type-checking) that
talks to this same backend over HTTP.

Since a mobile app can't read the web app's httpOnly session cookie, it authenticates via a
separate `POST /api/auth/mobile-login` endpoint (STUDENT accounts only) that returns the JWT in
the response body for the app to store in the device's secure storage and send back as
`Authorization: Bearer <token>` — see `src/server/middleware/auth.ts`, which accepts either the
cookie (web) or this header (mobile) to resolve the caller's identity. The existing web login
flow is untouched.

See [`mobile/README.md`](mobile/README.md) for setup and how to run it on a phone via Expo Go.

## Future improvements

- RFID/NFC as an alternative credential alongside QR
- Visitor management (temporary, more restricted sessions for non-students)
- Biometric secondary verification for high-security gates
- Structured emergency-evacuation mode (headcount confirmation workflow, not just a roster)
- Push notifications to students on entry/exit
- Publishing the native mobile app (`mobile/`) to the App Store / Play Store via EAS Build (needs
  an Expo account — the app itself is ready, this is just the publishing step)
- Anomaly detection on scan patterns beyond the current rule-based alerts

## What's implemented vs. best-effort / deferred

Built and tested in this session:

- The full two-mechanism QR security core: student-generated single-use ENTRY sessions
  (officer-scanned, device-authenticated) and officer-generated permanent EXIT codes
  (student-scanned, presence-checked) — HMAC-signed opaque payloads, TTL expiry on the entry side,
  replay/tamper rejection on both — with unit, integration, and **concurrency** tests proving the
  atomic-transaction guarantees under simultaneous scans in both directions.
- RBAC across all four roles, enforced server-side on every route.
- Students/gates/devices CRUD, CSV import with per-row validation reporting.
- Presence tracking, occupancy aggregation, realtime broadcast over WebSocket.
- Audit logging (append-only) and rule-based security alerts.
- Analytics overview + hourly/gate/department breakdowns, daily/student/occupancy reports with
  CSV export, Emergency Mode roster + export.
- Dashboards for all four roles (Super Admin/Admin, Security Officer, Student), with a working
  camera-based QR scanner used on both the entry-verification side (officer) and the exit side
  (student).
- Health endpoints, structured logging, rate limiting, `.env.example`, this documentation set.
- Student experience packaged as an installable PWA (manifest, generated icons, app-shell service
  worker that never caches `/api/*`, custom install prompt).
- A separate native mobile app (`mobile/`, Expo/React Native) covering the same student features,
  authenticating via a new bearer-token endpoint that leaves the web app's cookie-based login
  untouched — verified via clean strict-mode typecheck and a successful Android + iOS Metro bundle
  export, plus the backend's bearer-auth path exercised directly against the running server.

Best-effort or explicitly out of scope for this session:

- **No live cloud deployment was performed** — no Vercel/cloud database account was available in
  the build environment. `docs/DEPLOYMENT.md` documents the exact steps.
- **PDF export** was not implemented (CSV export was, for every report); adding a PDF renderer
  (e.g. a headless-Chromium or PDFKit pipeline) is a follow-up.
- **Formal WCAG 2.1 AA audit** was not performed; the UI follows accessible patterns (semantic
  HTML, labeled inputs, focus states, status conveyed by icon+text+color) but has not been run
  through an automated or manual accessibility audit tool.
- `npm audit` currently reports advisories against `next`/`vitest` whose listed "fixed" versions
  (`16.3.5`, `5.0.0`) do not yet exist as published releases at the time of this build — the
  latest actually-published patch releases are pinned instead. Re-run `npm audit` before
  production and upgrade once real fixed versions ship.
- The in-memory rate limiter and WebSocket broadcast are single-process; horizontal scaling needs
  a shared store (Redis) for both, as noted in the production checklist.
- **The mobile app's actual on-device UI/camera scanning was not visually verified** — there's no
  phone or simulator available in this environment. The code compiles, typechecks, and bundles
  cleanly for both platforms, and every backend endpoint it calls was verified directly, but you
  should run it via Expo Go (see `mobile/README.md`) to confirm the on-device experience.
- The mobile app has not been built into an installable APK/IPA or published anywhere (needs an
  Expo account for EAS Build) — it currently only runs via the Expo Go development client.
