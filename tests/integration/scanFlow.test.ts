import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { resetDatabase } from "../helpers/db";
import { createDevice, createGate, createStaffUser, createStudent } from "../helpers/factories";
import { createStudentQrSession, revokeOwnSession } from "@/server/modules/security/sessions.service";
import { getOrCreateExitCode } from "@/server/modules/security/exitCode.service";
import { verifyScan, verifyExit } from "@/server/modules/security/scan.service";

async function expectAppError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected AppError(${code}) but the call succeeded`);
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
  }
}

describe("Scan flow — student generates, officer verifies (the ENTRY/EXIT security core)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("performs a full ENTRY (dynamic QR, officer-scanned) then EXIT (permanent code, student-scanned) flow", async () => {
    const officer = await createStaffUser("SECURITY_OFFICER");
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    const entryResult = await verifyScan(
      { qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret },
      officer.id,
      "127.0.0.1"
    );

    expect(entryResult.event).toBe("ENTRY");
    expect(entryResult.presence).toBe("INSIDE");
    expect(entryResult.occupancy.inside).toBe(1);

    const presenceAfterEntry = await prisma.studentPresence.findUnique({ where: { studentId: student.id } });
    expect(presenceAfterEntry?.status).toBe("INSIDE");

    // Entering again via the dynamic-QR path is now rejected — that path is ENTRY-only.
    const { qr: duplicateEntryQr } = await createStudentQrSession(student.id, "127.0.0.1");
    await expectAppError(
      verifyScan({ qr: duplicateEntryQr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "ALREADY_INSIDE"
    );

    // Exit uses the gate's permanent exit code instead, scanned by the student themselves.
    const { qr: exitQr } = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    const exitResult = await verifyExit({ qr: exitQr }, student.userId, student.id, "127.0.0.1");

    expect(exitResult.event).toBe("EXIT");
    expect(exitResult.presence).toBe("OUTSIDE");
    expect(exitResult.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(exitResult.occupancy.inside).toBe(0);

    const presenceAfterExit = await prisma.studentPresence.findUnique({ where: { studentId: student.id } });
    expect(presenceAfterExit?.status).toBe("OUTSIDE");
    expect(presenceAfterExit?.currentEntryEventId).toBeNull();
  });

  it("rejects replaying an already-consumed QR (single-use enforcement)", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    const scanInput = { qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret };
    await verifyScan(scanInput, officer.id, "127.0.0.1");

    await expectAppError(verifyScan(scanInput, officer.id, "127.0.0.1"), "QR_ALREADY_USED");
  });

  it("rejects an expired QR and marks the underlying session EXPIRED", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { session, qr } = await createStudentQrSession(student.id, "127.0.0.1");
    // Force the session into the past without going through the normal TTL wait.
    await prisma.securitySession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expectAppError(
      verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "QR_EXPIRED"
    );

    const updated = await prisma.securitySession.findUnique({ where: { id: session.id } });
    expect(updated?.status).toBe("EXPIRED");
  });

  it("rejects a QR the student revoked themselves before it was scanned", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { session, qr } = await createStudentQrSession(student.id, "127.0.0.1");
    await revokeOwnSession(session.id, student.userId, student.id, "127.0.0.1");

    await expectAppError(
      verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "SESSION_REVOKED"
    );
  });

  it("refuses to let a student revoke another student's QR session", async () => {
    const student = await createStudent();
    const otherStudent = await createStudent();
    const { session } = await createStudentQrSession(student.id, "127.0.0.1");

    await expectAppError(
      revokeOwnSession(session.id, otherStudent.userId, otherStudent.id, "127.0.0.1"),
      "FORBIDDEN"
    );
  });

  it("refuses to verify a scan with a disabled device", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id, { active: false });
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    await expectAppError(
      verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "DEVICE_UNAUTHORIZED"
    );
  });

  it("refuses to verify a scan with the wrong device secret", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    await expectAppError(
      verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: "totally-wrong-secret" }, officer.id, "127.0.0.1"),
      "DEVICE_UNAUTHORIZED"
    );
  });

  it("rejects a scan attempted through a gate that has been disabled", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    await prisma.gate.update({ where: { id: gate.id }, data: { active: false } });

    await expectAppError(
      verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "GATE_INACTIVE"
    );
  });

  it("refuses to generate a QR for an inactive student", async () => {
    const student = await createStudent({ active: false });
    await expectAppError(createStudentQrSession(student.id, "127.0.0.1"), "STUDENT_INACTIVE");
  });

  it("rejects a scan when the student was deactivated after generating the QR but before it was scanned", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    await prisma.student.update({ where: { id: student.id }, data: { active: false } });

    await expectAppError(
      verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "STUDENT_INACTIVE"
    );
  });

  it("rejects a scan for a suspended student without changing their presence", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent({ presenceStatus: "SUSPENDED" });

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    await expectAppError(
      verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "STUDENT_SUSPENDED"
    );

    const presence = await prisma.studentPresence.findUnique({ where: { studentId: student.id } });
    expect(presence?.status).toBe("SUSPENDED");
  });

  it("rejects a QR payload with a tampered nonce even if the session id and signature line up structurally", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    // Attacker swaps in a different nonce but can't re-sign the payload without
    // QR_SECRET, so the HMAC signature check fails before any DB row is even read.
    const forged = { ...qr, nonce: "forged-nonce-forged-nonce-forged-nonce" };
    await expectAppError(
      verifyScan({ qr: forged, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officer.id, "127.0.0.1"),
      "INVALID_QR"
    );
  });

  it("records an audit log entry attributed to the scanning officer for both successful and rejected scans", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();

    const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
    const scanInput = { qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret };
    await verifyScan(scanInput, officer.id, "127.0.0.1");
    await expectAppError(verifyScan(scanInput, officer.id, "127.0.0.1"), "QR_ALREADY_USED");

    const logs = await prisma.auditLog.findMany({ where: { actorUserId: officer.id } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("ENTRY_RECORDED");
    expect(actions).toContain("SCAN_REJECTED");
  });
});
