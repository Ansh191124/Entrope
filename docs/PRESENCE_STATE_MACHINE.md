# Presence State Machine

## States

- `OUTSIDE` — default state; the student is not currently inside.
- `INSIDE` — the student has an open entry (`current_entry_event_id` points at the ENTRY
  `access_events` row, `entered_at` is set).
- `SUSPENDED` — access disabled by an administrator; sticky, never auto-transitions.

## Transitions

```
        entry QR verified via /api/security/scan (OUTSIDE)
   ┌────────────────────────────────────────────────────┐
   │                                                    ▼
OUTSIDE ◄──────────────────────────────────────────── INSIDE
        exit QR verified via /api/security/exit (INSIDE)

SUSPENDED: any scan on either endpoint while in this state is rejected outright
           (STUDENT_SUSPENDED) and never changes presence. Entry/exit into or out
           of SUSPENDED happens only through an administrator action, not a scan.
```

## The rule that matters: neither endpoint accepts a client-declared event type

An entry scan request (`/api/security/scan`) carries only the QR payload
(`sessionId`, `nonce`, `expiresAt`, `sig`) plus device credentials; an exit scan request
(`/api/security/exit`) carries only `{exitCodeId, gateId, sig}`. Neither has an
`"eventType": "ENTRY"`-shaped field anywhere, and if one existed, the server would ignore it. Each
endpoint reads `student_presence.status` **inside its own locked transaction** and enforces
exactly one legal transition:

```ts
// verifyScan() — entry only
if (presence.status === "INSIDE") return ALREADY_INSIDE;
// else OUTSIDE → proceed with ENTRY

// verifyExit() — exit only
if (presence.status === "OUTSIDE") return ALREADY_OUTSIDE;
// else INSIDE → proceed with EXIT
```

This is a deliberate reading of "do not trust the frontend to determine ENTRY/EXIT" taken to a
stricter conclusion than a single auto-detecting endpoint would give you: rather than one endpoint
that silently reinterprets "you're already inside, so this must be an exit," CampusGuard uses two
endpoints, each of which does exactly one thing and refuses to do the other. A student who wants
to enter always goes through the entry mechanism; wanting to leave always goes through the exit
mechanism. There is no representation of "the requested event type" anywhere in either request for
a client to lie about, and there is no ambiguity for the server to resolve on the client's behalf.

## `ALREADY_INSIDE` / `ALREADY_OUTSIDE` are real, reachable outcomes

Unlike an earlier iteration of this design (a single QR/endpoint that auto-derived ENTRY vs. EXIT
from presence, where these two codes were structurally unreachable), splitting entry and exit into
distinct mechanisms makes them the *expected* rejection for the ordinary "wrong button" case: a
student who is already inside and generates another entry QR gets `ALREADY_INSIDE` when an officer
scans it; a student who is already outside and scans the exit QR again gets `ALREADY_OUTSIDE`.
Neither is treated as suspicious on its own — no alert is raised for either — since it's the
expected result of an out-of-order tap, not an attack.

## `SUSPENDED`

A `SUSPENDED` student's scans are always rejected on both endpoints, checked *after* the
session/device/exit-code and gate checks but *before* any event is created — so a suspended
student's scan attempt (a) doesn't consume their entry QR ambiguously (it does still get consumed
on the entry path, since the QR was validly issued and scanned — only the presence check fails)
and (b) is guaranteed not to touch presence or the access-event ledger. It also raises an
`IMPOSSIBLE_STATE_TRANSITION` alert, since this generally warrants a human look.

## Concurrency guarantee

**Entry** (`verifyScan`): the `security_sessions` row and the `student_presence` row are locked
with `SELECT ... FOR UPDATE` inside the same transaction, session first then presence (a fixed
order prevents deadlocks). This means:

- Two simultaneous scans of the **same** entry QR serialize on the session-row lock; only one can
  see `status = ACTIVE` — the other sees `CONSUMED` (or the expiry check fires first) and is
  rejected.
- Two simultaneous scans of **different, both-valid** entry QRs for the **same student** (e.g. two
  gates) serialize on the presence-row lock; whichever transaction commits first performs the
  ENTRY, and the second — now reading the updated `INSIDE` row — is correctly rejected as
  `ALREADY_INSIDE`. Exactly one ENTRY is ever recorded, never two, never zero.

**Exit** (`verifyExit`): the `exit_codes` row and the `student_presence` row are locked the same
way. Because the exit code is intentionally reusable, this has to handle a subtly different case
correctly:

- Two simultaneous exit scans by the **same student** using the **same permanent exit code**
  serialize on the presence-row lock; the first commits the EXIT, the second sees `OUTSIDE` and is
  rejected as `ALREADY_OUTSIDE`.
- Two simultaneous exit scans by **two different students** using the **same permanent exit code**
  never contend with each other at all — they lock two different `student_presence` rows — and
  both succeed independently. Reusability of the exit code was the whole point; it must not
  introduce any cross-student interference, and the lock is scoped per-student, not per-code, so
  it doesn't.

`tests/concurrency/scanRace.test.ts` exercises all of these against a real Postgres database with
real simultaneous requests (not mocked), asserting on the final row counts, not just on individual
response codes.
