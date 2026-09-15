# Testing

```bash
npm run test               # all suites
npm run test:unit          # tests/unit/**       — no database needed
npm run test:integration   # tests/integration/** — needs TEST_DATABASE_URL
npm run test:concurrency   # tests/concurrency/** — needs TEST_DATABASE_URL, real parallelism
npm run test:security      # tests/security/**   — no database needed
```

`vitest.config.ts` sets `fileParallelism: false` because the integration/concurrency suites share
one physical test database and truncate it between tests (`tests/helpers/db.ts`) — running test
files in parallel would let them stomp on each other. Within a single test, concurrency is still
real (`Promise.allSettled` firing genuinely simultaneous requests) — only *files* run serially.

A `globalSetup` (`tests/globalSetup.ts`) runs once before the whole suite: it points
`DATABASE_URL` at `TEST_DATABASE_URL` and runs `prisma db push --force-reset` against it. **Never**
point `TEST_DATABASE_URL` at a database with data you care about.

## What each suite actually proves

### `unit/crypto.test.ts`
- 1000 generated nonces are all unique and high-entropy (not `Math.random`-shaped).
- A signed payload verifies; any tampering (session id swapped, garbage signature, missing
  signature) is rejected.

### `unit/rbac.test.ts`
- `requireRole` allows a role in the allow-list and throws `AppError("FORBIDDEN")` for a role
  that isn't — including the specific "officer cannot manage admins" rule from spec §5.

### `unit/errors.test.ts`
- A known `AppError` maps to its declared status/code.
- An arbitrary internal exception (including one whose message contains a fake connection string)
  never leaks its raw text into the client-facing response.

### `integration/scanFlow.test.ts`
Full ENTRY (dynamic QR, officer-scanned) → EXIT (permanent code, student-scanned) round trip with
real duration calculation; entry-QR replay, expiry (and the resulting `EXPIRED` status write), and
self-revocation (and that another student can't revoke someone else's session); disabled-device
rejection at verification time; wrong device secret; a gate disabled *after* the QR was issued; a
student deactivated between generation and verification; a suspended student (presence untouched);
a QR with a nonce swapped in (caught by signature verification); a duplicate entry attempt while
already inside (`ALREADY_INSIDE`); and that both successful and rejected scans leave an audit
trail attributed to the scanning officer.

### `integration/exitFlow.test.ts`
The permanent exit code specifically: `getOrCreateExitCode` is idempotent (same code/QR on repeat
calls); rejects an exit from a student already outside; computes stay duration correctly; the same
code independently services two different students; a revoked code is rejected
(`EXIT_CODE_INACTIVE`) and a fresh one is minted after; a tampered payload (gate id swapped) is
rejected even with a structurally valid `exitCodeId`; a suspended student is rejected without
touching presence; and the resulting audit log entry is attributed to the student themselves (no
officer is involved in a self-service exit).

### `concurrency/scanRace.test.ts` — the ones that matter most
1. **15 simultaneous entry verifications of the same dynamic QR** → exactly 1 succeeds, 14 get
   `QR_ALREADY_USED`, and the database ends up with exactly one `AccessEvent` and
   `presence.status = INSIDE` (not zero, not many).
2. **Two simultaneous entry verifications of two independently-valid dynamic QRs for the same
   student** (two different gates) → exactly one ENTRY is recorded; the other is rejected as
   `ALREADY_INSIDE` — entry is exclusive, never silently reinterpreted as an exit.
3. **10 simultaneous self-service exits by the same student using the same permanent exit code** →
   exactly one EXIT is recorded, the rest get `ALREADY_OUTSIDE`.
4. **The same permanent exit code used concurrently by two different students** → both exits
   succeed independently — reusability across students must never introduce cross-student
   interference, since the row lock is scoped per-student, not per-code.
5. A device disabled concurrently with an entry-verification attempt against it never lets a
   verification slip through after the disable has taken effect.

If you extend the scan/exit logic, re-run this suite specifically — it is the test that actually
exercises the `SELECT ... FOR UPDATE` locking rather than just the happy-path logic.

### `security/security.test.ts`
Rate limiter trips after its configured limit and tracks identifiers independently; a tampered or
expired JWT is rejected; zod schemas reject SQL-injection-shaped and malformed input before it
ever reaches a query; a QR payload cannot be forged for an arbitrary session without `QR_SECRET`.

## What's not covered by automated tests in this build

- Frontend component/interaction tests (no React Testing Library suite was added — the frontend
  was verified manually via the dev server instead; see the note in the top-level README).
- End-to-end browser tests (e.g. Playwright) exercising the full login → generate QR → camera scan
  flow through real UI interaction.
- Load/performance testing beyond the concurrency correctness tests above.
