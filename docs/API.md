# API Reference

All endpoints are under `/api`. Every endpoint except `/api/auth/login` and `/api/health*`
requires a valid session cookie (set by login). Responses are JSON (`{ success: true, ... }` or
`{ success: false, error: <CODE>, message: <safe text> }`) unless a `?format=csv` query parameter
is documented.

## Auth

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | `{ email, password }` → sets session cookie |
| POST | `/auth/logout` | any | clears session cookie |
| GET | `/auth/me` | any | current user + linked student profile/presence |

## Students

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/students` | staff | `?q=&department=&active=&page=&pageSize=` |
| POST | `/students` | ADMIN+ | creates User+Student+presence row atomically |
| GET | `/students/:id` | staff | |
| PATCH | `/students/:id` | ADMIN+ | |
| DELETE | `/students/:id` | SUPER_ADMIN | soft-deactivate, never a hard delete |
| POST | `/students/import` | ADMIN+ | multipart `file` field, CSV; every row validated, nothing imported silently |

## Presence

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/presence` | any | aggregate `{ inside, outside, totalActive }` |
| GET | `/presence/inside` | staff | full roster currently inside |
| GET | `/presence/student/:id` | self or staff | |

## Security — Entry (dynamic QR, student-generated, officer-scanned)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/security/sessions` | STUDENT | no body; identity from session cookie. Returns a signed, single-use entry QR bound to the caller — gate is not chosen here |
| GET | `/security/sessions/:id` | self (owner) or staff | |
| POST | `/security/sessions/:id/revoke` | STUDENT (owner only) | cancels a not-yet-scanned QR the caller generated |
| POST | `/security/scan` | staff | `{ qr: {sessionId, nonce, expiresAt, sig}, deviceIdentifier, deviceSecret }` — the officer's kiosk verifies the student's QR; gate derived from the device |

Entry failure codes: `QR_EXPIRED`, `QR_ALREADY_USED`, `INVALID_QR`, `STUDENT_NOT_FOUND`,
`STUDENT_INACTIVE`, `STUDENT_SUSPENDED`, `ALREADY_INSIDE`, `DEVICE_UNAUTHORIZED`, `GATE_INACTIVE`,
`SESSION_REVOKED`, `RATE_LIMITED`.

## Security — Exit (permanent QR, officer-generated, student-scanned)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/security/exit-codes` | staff | `{ deviceIdentifier, deviceSecret }` → idempotently returns the active exit QR for the device's gate, creating one on first use |
| POST | `/security/exit-codes/revoke` | staff | `{ deviceIdentifier, deviceSecret }` → deactivates the current exit code; the next `POST /security/exit-codes` mints a fresh one |
| POST | `/security/exit` | STUDENT | `{ qr: {exitCodeId, gateId, sig} }` — no device involved; identity from the caller's own session |

Exit failure codes: `INVALID_QR`, `EXIT_CODE_INACTIVE`, `GATE_INACTIVE`, `STUDENT_NOT_FOUND`,
`STUDENT_INACTIVE`, `STUDENT_SUSPENDED`, `ALREADY_OUTSIDE`, `RATE_LIMITED`.

## Gates & Devices

| Method | Path | Role | Notes |
|---|---|---|---|
| GET / POST | `/gates` | staff / ADMIN+ | |
| PATCH / DELETE | `/gates/:id` | ADMIN+ / SUPER_ADMIN | |
| GET / POST | `/devices` | ADMIN+ | POST returns the raw secret once |
| PATCH / DELETE | `/devices/:id` | ADMIN+ / SUPER_ADMIN | `{ active: false }` = revoke |

## Analytics & Reports

| Method | Path | Role |
|---|---|---|
| GET | `/analytics/overview` | staff |
| GET | `/analytics/occupancy` | staff (hourly entries/exits, today) |
| GET | `/analytics/entries` | staff (gate-wise activity) |
| GET | `/analytics/exits` | staff (department-wise activity) |
| GET | `/reports/daily?format=csv` | ADMIN+ |
| GET | `/reports/student/:id?format=csv` | self or staff |
| GET | `/reports/occupancy` | staff |

## Alerts & Audit

| Method | Path | Role |
|---|---|---|
| GET | `/alerts?status=OPEN` | staff |
| POST | `/alerts/:id/resolve` | staff |
| GET | `/audit-logs?page=&pageSize=&entityType=&actorUserId=` | ADMIN+ only (read-only) |

## Emergency Mode

| Method | Path | Role |
|---|---|---|
| GET | `/emergency/roster?format=csv` | staff — every access is itself audit-logged |

## Health

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | public |
| GET | `/health/database` | public |
| GET | `/health/realtime` | public |

## Realtime

`GET /api/realtime` is a WebSocket upgrade endpoint (not a normal REST route), requiring the same
session cookie. Message shape: `{ type: "student.entered" | "student.exited" |
"occupancy.updated" | "security.alert" | "gate.status_changed", payload }`. Treat every message as
a signal to refetch, not as authoritative state — see `docs/ARCHITECTURE.md`.
