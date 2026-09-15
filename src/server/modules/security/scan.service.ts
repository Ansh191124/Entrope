import { Prisma, type EventType } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { AppError, type ErrorCode } from "@/server/lib/errors";
import { hashNonce, verifyQrSignature, verifyExitQrSignature } from "@/server/lib/crypto";
import { authenticateDevice } from "@/server/modules/devices/devices.service";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { raiseAlert } from "@/server/modules/alerts/alerts.service";
import { broadcast } from "@/server/realtime/broadcast";
import { logger } from "@/server/lib/logger";
import type { VerifyScanInput, VerifyExitInput } from "@/validations/security";
import type { AlertSeverity, AlertType } from "@prisma/client";

interface LockedSessionRow {
  id: string;
  created_by_student: string;
  nonce_hash: string;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "REVOKED";
  expires_at: Date;
}

interface LockedPresenceRow {
  student_id: string;
  status: "OUTSIDE" | "INSIDE" | "SUSPENDED";
  current_entry_event_id: string | null;
  entered_at: Date | null;
}

type VerifyTxResult =
  | {
      ok: true;
      eventId: string;
      timestamp: Date;
      studentId: string;
    }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      alertType?: AlertType;
      alertSeverity?: AlertSeverity;
      studentId?: string;
    };

export interface VerifyResponse {
  success: true;
  verified: true;
  event: EventType;
  presence: "INSIDE" | "OUTSIDE";
  student: { id: string; name: string; enrollmentNo: string; department: string; photoUrl: string | null };
  timestamp: string;
  entryTimestamp?: string;
  durationSeconds?: number;
  gate: { id: string; name: string };
  occupancy: { inside: number; outside: number };
}

async function currentOccupancy() {
  const [insideCount, totalActive] = await Promise.all([
    prisma.studentPresence.count({ where: { status: "INSIDE" } }),
    prisma.student.count({ where: { active: true } }),
  ]);
  return { inside: insideCount, outside: Math.max(totalActive - insideCount, 0) };
}

/**
 * The single most security-critical operation in the system. An officer's
 * registered device scans a QR a student generated. Everything the client
 * sends — the QR payload AND the device credentials — is treated as
 * untrusted input to be re-derived/re-checked against the database inside
 * one locked transaction. This is also where we answer "does this student
 * actually exist and are they in good standing" before ever touching
 * presence — see docs/QR_SYSTEM.md and docs/PRESENCE_STATE_MACHINE.md.
 *
 * This path is ENTRY-only by design (§ split with verifyExit below): a
 * student who is already INSIDE gets ALREADY_INSIDE here, not a silently
 * "helpful" auto-converted exit — exiting has its own distinct mechanism.
 */
export async function verifyScan(input: VerifyScanInput, scannedByUserId: string, ip: string): Promise<VerifyResponse> {
  const { qr } = input;

  // 1. Signature check — cheap, catches tampering/garbage before touching the DB.
  if (!verifyQrSignature(qr)) {
    await recordAudit({
      actorUserId: scannedByUserId,
      action: "SCAN_REJECTED",
      entityType: "SecuritySession",
      entityId: qr.sessionId,
      ipAddress: ip,
      metadata: { code: "INVALID_QR" satisfies ErrorCode },
    });
    throw new AppError("INVALID_QR", "This QR code is invalid.");
  }

  // 2. Authenticate the scanning device — never trust a bare deviceIdentifier
  // without its secret, and re-derive the gate from the device, never from
  // client input.
  const device = await authenticateDevice(input.deviceIdentifier, input.deviceSecret);

  const incomingNonceHash = hashNonce(qr.nonce);

  const result = await prisma.$transaction(async (tx): Promise<VerifyTxResult> => {
    // Lock the session row first, then the presence row — a fixed lock
    // order across every transaction avoids deadlocks between concurrent
    // scans that might otherwise lock the same two rows in reverse order.
    const sessionRows = await tx.$queryRaw<LockedSessionRow[]>(Prisma.sql`
      SELECT id, created_by_student, nonce_hash, status, expires_at
      FROM security_sessions
      WHERE id = ${qr.sessionId}
      FOR UPDATE
    `);
    const session = sessionRows[0];

    if (!session) {
      return { ok: false, code: "INVALID_QR", message: "This QR code does not exist." };
    }
    if (session.nonce_hash !== incomingNonceHash) {
      return { ok: false, code: "INVALID_QR", message: "This QR code is invalid." };
    }
    if (session.status === "REVOKED") {
      return { ok: false, code: "SESSION_REVOKED", message: "This QR code has been revoked.", studentId: session.created_by_student };
    }
    if (session.status === "CONSUMED") {
      return {
        ok: false,
        code: "QR_ALREADY_USED",
        message: "This QR code has already been used.",
        alertType: "REUSED_QR_ATTEMPT",
        alertSeverity: "HIGH",
        studentId: session.created_by_student,
      };
    }
    if (session.status === "EXPIRED" || session.expires_at.getTime() <= Date.now()) {
      if (session.status === "ACTIVE") {
        await tx.$executeRaw(Prisma.sql`UPDATE security_sessions SET status = 'EXPIRED' WHERE id = ${session.id}`);
      }
      return {
        ok: false,
        code: "QR_EXPIRED",
        message: "This QR code has expired.",
        alertType: "EXPIRED_QR_ATTEMPT",
        alertSeverity: "INFO",
        studentId: session.created_by_student,
      };
    }

    // Does this student actually exist and are they in good standing? This is
    // the "verify against the DB" step the officer's scan exists to perform.
    const student = await tx.student.findUnique({ where: { id: session.created_by_student } });
    if (!student) {
      return { ok: false, code: "STUDENT_NOT_FOUND", message: "No matching student record was found." };
    }
    if (!student.active) {
      return {
        ok: false,
        code: "STUDENT_INACTIVE",
        message: "This student account is inactive.",
        alertType: "INACTIVE_STUDENT_ATTEMPT",
        alertSeverity: "HIGH",
        studentId: student.id,
      };
    }

    // Lock (or lazily create) the student's presence row.
    let presenceRows = await tx.$queryRaw<LockedPresenceRow[]>(Prisma.sql`
      SELECT student_id, status, current_entry_event_id, entered_at
      FROM student_presence
      WHERE student_id = ${student.id}
      FOR UPDATE
    `);

    if (presenceRows.length === 0) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO student_presence (student_id, status, updated_at)
        VALUES (${student.id}, 'OUTSIDE', now())
        ON CONFLICT (student_id) DO NOTHING
      `);
      presenceRows = await tx.$queryRaw<LockedPresenceRow[]>(Prisma.sql`
        SELECT student_id, status, current_entry_event_id, entered_at
        FROM student_presence
        WHERE student_id = ${student.id}
        FOR UPDATE
      `);
    }
    const presence = presenceRows[0]!;

    if (presence.status === "SUSPENDED") {
      return {
        ok: false,
        code: "STUDENT_SUSPENDED",
        message: "This student's access has been suspended.",
        alertType: "IMPOSSIBLE_STATE_TRANSITION",
        alertSeverity: "CRITICAL",
        studentId: student.id,
      };
    }
    if (presence.status === "INSIDE") {
      return {
        ok: false,
        code: "ALREADY_INSIDE",
        message: "This student is already inside. To leave, scan the exit QR posted at the gate.",
        studentId: student.id,
      };
    }

    const now = new Date();

    const event = await tx.accessEvent.create({
      data: {
        studentId: student.id,
        gateId: device.gateId,
        deviceId: device.id,
        sessionId: session.id,
        eventType: "ENTRY",
        timestamp: now,
      },
    });

    await tx.studentPresence.update({
      where: { studentId: student.id },
      data: { status: "INSIDE", currentEntryEventId: event.id, enteredAt: now, lastGateId: device.gateId },
    });

    await tx.securitySession.update({
      where: { id: session.id },
      data: {
        status: "CONSUMED",
        consumedAt: now,
        gateId: device.gateId,
        deviceId: device.id,
        scannedByUserId,
      },
    });

    await recordAudit(
      {
        actorUserId: scannedByUserId,
        action: "ENTRY_RECORDED",
        entityType: "AccessEvent",
        entityId: event.id,
        deviceId: device.id,
        ipAddress: ip,
        metadata: { gateId: device.gateId, sessionId: session.id, studentId: student.id },
      },
      tx
    );

    return { ok: true, eventId: event.id, timestamp: now, studentId: student.id };
  }, { timeout: 10_000, maxWait: 10_000 });

  if (!result.ok) {
    logger.warn("SCAN_REJECTED", { sessionId: qr.sessionId, code: result.code, ip });
    await recordAudit({
      actorUserId: scannedByUserId,
      action: "SCAN_REJECTED",
      entityType: "SecuritySession",
      entityId: qr.sessionId,
      deviceId: device.id,
      ipAddress: ip,
      metadata: { code: result.code },
    });
    if (result.alertType) {
      await raiseAlert({
        type: result.alertType,
        severity: result.alertSeverity ?? "WARNING",
        message: `${result.code} (session ${qr.sessionId}).`,
        studentId: result.studentId,
        gateId: device.gateId,
      });
    }
    throw new AppError(result.code, result.message);
  }

  const student = await prisma.student.findUniqueOrThrow({ where: { id: result.studentId } });
  const gate = await prisma.gate.findUniqueOrThrow({ where: { id: device.gateId } });
  const occupancy = await currentOccupancy();

  logger.info("ENTRY_RECORDED", { studentId: student.id, eventId: result.eventId, ip });

  broadcast({
    type: "student.entered",
    payload: {
      studentId: student.id,
      name: student.name,
      enrollmentNo: student.enrollmentNo,
      timestamp: result.timestamp,
      gateId: gate.id,
      gateName: gate.name,
    },
  });
  broadcast({ type: "occupancy.updated", payload: occupancy });

  return {
    success: true,
    verified: true,
    event: "ENTRY",
    presence: "INSIDE",
    student: {
      id: student.id,
      name: student.name,
      enrollmentNo: student.enrollmentNo,
      department: student.department,
      photoUrl: student.photoUrl,
    },
    timestamp: result.timestamp.toISOString(),
    gate: { id: gate.id, name: gate.name },
    occupancy,
  };
}

interface LockedExitCodeRow {
  id: string;
  gate_id: string;
  active: boolean;
}

/**
 * A student scans the permanent exit QR posted/displayed at a gate, using
 * their OWN device. There is no device/officer authentication step here —
 * the exit code is meant to be publicly scannable — so the entire security
 * boundary is (a) the caller must be an authenticated student and (b) the
 * presence-row lock, which rejects a student who is already OUTSIDE. See
 * docs/QR_SYSTEM.md for the full rationale on why this is safe despite the
 * QR being permanent and unauthenticated on the reading side.
 */
export async function verifyExit(input: VerifyExitInput, studentUserId: string, studentId: string, ip: string): Promise<VerifyResponse> {
  const { qr } = input;

  if (!verifyExitQrSignature(qr)) {
    await recordAudit({
      actorUserId: studentUserId,
      action: "EXIT_REJECTED",
      entityType: "ExitCode",
      entityId: qr.exitCodeId,
      ipAddress: ip,
      metadata: { code: "INVALID_QR" satisfies ErrorCode },
    });
    throw new AppError("INVALID_QR", "This exit QR code is invalid.");
  }

  const result = await prisma.$transaction(async (tx): Promise<VerifyTxResult> => {
    const exitCodeRows = await tx.$queryRaw<LockedExitCodeRow[]>(Prisma.sql`
      SELECT id, gate_id, active
      FROM exit_codes
      WHERE id = ${qr.exitCodeId}
      FOR UPDATE
    `);
    const exitCode = exitCodeRows[0];

    if (!exitCode || exitCode.gate_id !== qr.gateId) {
      return { ok: false, code: "INVALID_QR", message: "This exit QR code does not exist." };
    }
    if (!exitCode.active) {
      return { ok: false, code: "EXIT_CODE_INACTIVE", message: "This exit QR code has been revoked." };
    }

    const gate = await tx.gate.findUnique({ where: { id: exitCode.gate_id } });
    if (!gate || !gate.active) {
      return { ok: false, code: "GATE_INACTIVE", message: "This gate is currently inactive." };
    }

    const student = await tx.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return { ok: false, code: "STUDENT_NOT_FOUND", message: "Student profile not found for this account." };
    }
    if (!student.active) {
      return {
        ok: false,
        code: "STUDENT_INACTIVE",
        message: "This student account is inactive.",
        alertType: "INACTIVE_STUDENT_ATTEMPT",
        alertSeverity: "HIGH",
        studentId: student.id,
      };
    }

    let presenceRows = await tx.$queryRaw<LockedPresenceRow[]>(Prisma.sql`
      SELECT student_id, status, current_entry_event_id, entered_at
      FROM student_presence
      WHERE student_id = ${student.id}
      FOR UPDATE
    `);
    if (presenceRows.length === 0) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO student_presence (student_id, status, updated_at)
        VALUES (${student.id}, 'OUTSIDE', now())
        ON CONFLICT (student_id) DO NOTHING
      `);
      presenceRows = await tx.$queryRaw<LockedPresenceRow[]>(Prisma.sql`
        SELECT student_id, status, current_entry_event_id, entered_at
        FROM student_presence
        WHERE student_id = ${student.id}
        FOR UPDATE
      `);
    }
    const presence = presenceRows[0]!;

    if (presence.status === "SUSPENDED") {
      return {
        ok: false,
        code: "STUDENT_SUSPENDED",
        message: "This student's access has been suspended.",
        alertType: "IMPOSSIBLE_STATE_TRANSITION",
        alertSeverity: "CRITICAL",
        studentId: student.id,
      };
    }
    if (presence.status === "OUTSIDE") {
      return {
        ok: false,
        code: "ALREADY_OUTSIDE",
        message: "You are not currently marked as inside, so there's nothing to exit from.",
        studentId: student.id,
      };
    }

    const now = new Date();
    const durationSeconds = presence.entered_at
      ? Math.max(0, Math.round((now.getTime() - presence.entered_at.getTime()) / 1000))
      : null;

    const event = await tx.accessEvent.create({
      data: {
        studentId: student.id,
        gateId: exitCode.gate_id,
        exitCodeId: exitCode.id,
        eventType: "EXIT",
        timestamp: now,
        entryEventId: presence.current_entry_event_id,
        durationSeconds,
      },
    });

    await tx.studentPresence.update({
      where: { studentId: student.id },
      data: { status: "OUTSIDE", currentEntryEventId: null, enteredAt: null, lastGateId: exitCode.gate_id },
    });

    await recordAudit(
      {
        actorUserId: studentUserId,
        action: "EXIT_RECORDED",
        entityType: "AccessEvent",
        entityId: event.id,
        ipAddress: ip,
        metadata: { gateId: exitCode.gate_id, exitCodeId: exitCode.id, studentId: student.id },
      },
      tx
    );

    return { ok: true, eventId: event.id, timestamp: now, studentId: student.id };
  }, { timeout: 10_000, maxWait: 10_000 });

  if (!result.ok) {
    logger.warn("EXIT_REJECTED", { exitCodeId: qr.exitCodeId, code: result.code, ip });
    await recordAudit({
      actorUserId: studentUserId,
      action: "EXIT_REJECTED",
      entityType: "ExitCode",
      entityId: qr.exitCodeId,
      ipAddress: ip,
      metadata: { code: result.code },
    });
    if (result.alertType) {
      await raiseAlert({
        type: result.alertType,
        severity: result.alertSeverity ?? "WARNING",
        message: `${result.code} (exit code ${qr.exitCodeId}).`,
        studentId: result.studentId,
        gateId: qr.gateId,
      });
    }
    throw new AppError(result.code, result.message);
  }

  const student = await prisma.student.findUniqueOrThrow({ where: { id: result.studentId } });
  const gate = await prisma.gate.findUniqueOrThrow({ where: { id: qr.gateId } });
  const event = await prisma.accessEvent.findUniqueOrThrow({ where: { id: result.eventId } });
  const occupancy = await currentOccupancy();

  logger.info("EXIT_RECORDED", { studentId: student.id, eventId: result.eventId, ip });

  broadcast({
    type: "student.exited",
    payload: {
      studentId: student.id,
      name: student.name,
      enrollmentNo: student.enrollmentNo,
      timestamp: result.timestamp,
      gateId: gate.id,
      gateName: gate.name,
      durationSeconds: event.durationSeconds,
    },
  });
  broadcast({ type: "occupancy.updated", payload: occupancy });

  return {
    success: true,
    verified: true,
    event: "EXIT",
    presence: "OUTSIDE",
    student: {
      id: student.id,
      name: student.name,
      enrollmentNo: student.enrollmentNo,
      department: student.department,
      photoUrl: student.photoUrl,
    },
    timestamp: result.timestamp.toISOString(),
    durationSeconds: event.durationSeconds ?? undefined,
    gate: { id: gate.id, name: gate.name },
    occupancy,
  };
}
