# The QR System

CampusGuard uses **two** QR mechanisms, deliberately shaped differently for how each is actually
used at a gate. Neither ever encodes a student's identity.

|  | Entry QR | Exit QR |
|---|---|---|
| Who generates it | The student, on their own phone | An officer, once per gate |
| Lifetime | Short (`QR_TTL_SECONDS`, default 20s) | Permanent, until revoked |
| Reuse | Single-use — consumed on first valid scan | Reusable indefinitely by design |
| Who scans it | An officer's registered kiosk device | The student themselves, on their own phone |
| Backed by | `security_sessions` table | `exit_codes` table |
| Rejects when | Already `INSIDE` (`ALREADY_INSIDE`) | Already `OUTSIDE` (`ALREADY_OUTSIDE`) |

## Entry QR

### Payload

```json
{
  "sessionId": "b1f6...-uuid",
  "nonce": "base64url-32-random-bytes",
  "expiresAt": "2026-09-15T10:42:11.000Z",
  "sig": "hex-hmac-sha256"
}
```

No student identity in this payload — it's a reference to a `security_sessions` row.
`sig = HMAC-SHA256(QR_SECRET, sessionId + "." + nonce + "." + expiresAt)`.

### Lifecycle

1. `POST /api/security/sessions` (STUDENT role, no device involved) → `createStudentQrSession()`
   (`src/server/modules/security/sessions.service.ts`):
   - confirms the caller's student profile exists and is active
   - generates a nonce, hashes it (`hashNonce`), inserts a `security_sessions` row with
     `createdByStudentId = <caller>`, `status = ACTIVE`, `expiresAt = now + QR_TTL_SECONDS` — note
     `gateId`/`deviceId` are `NULL` at this point; the student doesn't choose or know which gate
     will scan it
   - signs `{sessionId, nonce, expiresAt}` and returns it — rendered as a QR image client-side
     (`qrcode` library, purely a rendering step, no security logic)
2. The student's screen counts down locally from `expiresAt`; when it hits zero it clears the QR
   (a UX nicety — the server-side expiry check is what actually matters). It also polls the
   session's own status every 2s as a fallback for noticing "an officer already scanned this" even
   without a live WebSocket connection.
3. An officer's kiosk scans it (`/security` → **SCAN STUDENT QR**); the raw JSON is decoded
   client-side (`jsqr` reading camera frames) and POSTed, alongside the kiosk's own device
   credentials, to `POST /api/security/scan`.
4. `verifyScan()` (`src/server/modules/security/scan.service.ts`):
   - `verifyQrSignature` — rejects a forged/tampered payload before any DB access
   - `authenticateDevice(deviceIdentifier, deviceSecret)` — the kiosk proves itself; the gate is
     derived from the device's own registration, never accepted as a separate field
   - locks the `security_sessions` row, re-derives `hashNonce(nonce)` and compares it to the
     stored hash (defense in depth beyond the signature check)
   - rejects `REVOKED` → `SESSION_REVOKED`, `CONSUMED` → `QR_ALREADY_USED`, expired → `QR_EXPIRED`
     (flipping the row to `EXPIRED` in the same transaction)
   - resolves the student the session belongs to, confirms they're active
   - locks their presence row; rejects `SUSPENDED` → `STUDENT_SUSPENDED`, already `INSIDE` →
     `ALREADY_INSIDE` — **this path never falls back to recording an exit**
   - on success: writes the ENTRY `access_events` row, flips presence to `INSIDE`, marks the
     session `CONSUMED` (recording `gateId`/`deviceId`/`scannedByUserId` at this point, not
     before), and appends an audit log entry attributed to the officer

### Configuration

`QR_TTL_SECONDS` in `.env` (default 20; spec range 10–60; values outside 5–300 fall back to 20 —
see `src/server/modules/security/qrConfig.ts`).

## Exit QR

### Payload

```json
{
  "exitCodeId": "c4d9...-uuid",
  "gateId": "d650...-uuid",
  "sig": "hex-hmac-sha256"
}
```

Also no student identity — and also no nonce or expiry, because it isn't meant to expire.
`sig = HMAC-SHA256(QR_SECRET, "EXIT." + exitCodeId + "." + gateId)` — a distinct signing
namespace (`"EXIT."` prefix) from the entry QR's, so a signature valid for one can never be
replayed as the other even if the two payload shapes happened to collide.

### Lifecycle

1. `POST /api/security/exit-codes` (staff role, device-authenticated) →
   `getOrCreateExitCode()` (`src/server/modules/security/exitCode.service.ts`):
   - authenticates the officer's kiosk device exactly like the entry flow
   - looks for an existing `active` `exit_codes` row for that device's gate; if none exists,
     creates one — **idempotent**, so reopening this screen later returns the same QR, not a new
     one, which matters because the QR may be printed and posted on a wall
   - signs `{exitCodeId, gateId}` and returns it for display/printing
2. `POST /api/security/exit-codes/revoke` deactivates the current code (e.g. the poster was
   stolen/defaced); the next `POST /api/security/exit-codes` call then mints a fresh one.
3. A student who is currently inside scans the posted/displayed QR with their own phone
   (`/student` → **SCAN TO EXIT**) and POSTs the decoded payload — with no device credentials — to
   `POST /api/security/exit`.
4. `verifyExit()` (`src/server/modules/security/scan.service.ts`):
   - `verifyExitQrSignature` — rejects a forged/tampered payload before any DB access
   - locks the `exit_codes` row, confirms it exists, its `gateId` matches the payload's (catching
     a tampered/swapped `gateId`), and it's still `active` → else `EXIT_CODE_INACTIVE`
   - confirms the referenced gate is still active → else `GATE_INACTIVE`
   - resolves the **caller's own** student record from their session (never a client-supplied id),
     confirms they're active
   - locks their presence row; rejects `SUSPENDED` → `STUDENT_SUSPENDED`, already `OUTSIDE` →
     `ALREADY_OUTSIDE`
   - on success: writes the EXIT `access_events` row (with `exitCodeId` set, `sessionId` and
     `deviceId` left `NULL` since no session or kiosk was involved), computes the stay duration,
     flips presence to `OUTSIDE`, and appends an audit log entry attributed to the **student**
     themselves (there's no officer in this transaction to attribute it to)
   - the `exit_codes` row itself is **not** mutated on a successful scan — it stays `active` and
     ready for the next student

## Why neither can be attacked the obvious ways

| Attack | Entry QR | Exit QR |
|---|---|---|
| Photograph/screenshot and use it later | TTL expiry + single-use consumption defeat this | N/A by design — it's *meant* to be photographed and reused; see below |
| Guess a future code's id | 256-bit random nonce is what's actually secret here; `sessionId`/`exitCodeId` are DB-generated UUIDs, not brute-forceable either | Same — `exitCodeId` is a UUID, and possession of it grants no identity anyway |
| Forge a payload for an arbitrary id | Requires `QR_SECRET` to produce a valid `sig` | Same, in the `"EXIT."`-prefixed namespace |
| Claim to be a different student | No student field in the request body — identity comes solely from the caller's authenticated session | Same |
| Use the wall-posted exit QR to fake an entry, or vice versa | N/A | Distinct signing namespace + distinct DB table means an exit QR can never validate against the entry endpoint or vice versa |
| Repeatedly scan the exit QR to rack up fake exits | N/A | The second and every subsequent scan while already `OUTSIDE` is rejected (`ALREADY_OUTSIDE`) — reusability doesn't mean repeatability for the same student |

## Why the backend, not the QR or the client, decides ENTRY vs. EXIT

See [`PRESENCE_STATE_MACHINE.md`](PRESENCE_STATE_MACHINE.md). Short version: neither the student
generating an entry QR nor the officer generating an exit QR labels it "this is an entry" or
"this is an exit" — the *endpoint* (`/api/security/scan` vs. `/api/security/exit`) plus the
student's current presence at the moment the transaction locks their row is what determines the
outcome, and each endpoint refuses to produce the other's outcome rather than silently
reinterpreting the scan.
