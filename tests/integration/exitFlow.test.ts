import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { resetDatabase } from "../helpers/db";
import { createDevice, createGate, createStaffUser, createStudent } from "../helpers/factories";
import { createStudentQrSession } from "@/server/modules/security/sessions.service";
import { getOrCreateExitCode, revokeExitCode } from "@/server/modules/security/exitCode.service";
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

async function markInside(student: { id: string; userId: string }, device: { deviceIdentifier: string }, rawSecret: string, officerId: string) {
  const { qr } = await createStudentQrSession(student.id, "127.0.0.1");
  await verifyScan({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: rawSecret }, officerId, "127.0.0.1");
}

describe("Exit flow — permanent gate QR, self-scanned by the student", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("is idempotent: repeated requests for the same gate return the same exit code, not a new one each time", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);

    const first = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    const second = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");

    expect(second.exitCode.id).toBe(first.exitCode.id);
    expect(second.qr.sig).toBe(first.qr.sig);
  });

  it("rejects an exit attempt from a student who is already outside", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent(); // starts OUTSIDE

    const { qr } = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    await expectAppError(verifyExit({ qr }, student.userId, student.id, "127.0.0.1"), "ALREADY_OUTSIDE");
  });

  it("marks a student outside and computes their stay duration when they are inside", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();
    await markInside(student, device, rawSecret, officer.id);

    const { qr } = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    const result = await verifyExit({ qr }, student.userId, student.id, "127.0.0.1");

    expect(result.event).toBe("EXIT");
    expect(result.presence).toBe("OUTSIDE");
    expect(result.durationSeconds).toBeGreaterThanOrEqual(0);

    const presence = await prisma.studentPresence.findUnique({ where: { studentId: student.id } });
    expect(presence?.status).toBe("OUTSIDE");
  });

  it("the exit code is reusable: a second, different student can use the SAME exit code independently", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const studentA = await createStudent();
    const studentB = await createStudent();
    await markInside(studentA, device, rawSecret, officer.id);
    await markInside(studentB, device, rawSecret, officer.id);

    const { qr } = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    await verifyExit({ qr }, studentA.userId, studentA.id, "127.0.0.1");
    await verifyExit({ qr }, studentB.userId, studentB.id, "127.0.0.1");

    const presenceA = await prisma.studentPresence.findUnique({ where: { studentId: studentA.id } });
    const presenceB = await prisma.studentPresence.findUnique({ where: { studentId: studentB.id } });
    expect(presenceA?.status).toBe("OUTSIDE");
    expect(presenceB?.status).toBe("OUTSIDE");
  });

  it("rejects a scan of a revoked exit code", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();
    await markInside(student, device, rawSecret, officer.id);

    const { qr } = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    await revokeExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");

    await expectAppError(verifyExit({ qr }, student.userId, student.id, "127.0.0.1"), "EXIT_CODE_INACTIVE");
  });

  it("issues a fresh exit code after the previous one is revoked", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);

    const before = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    await revokeExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    const after = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");

    expect(after.exitCode.id).not.toBe(before.exitCode.id);
  });

  it("rejects a tampered exit QR (gate id swapped) even though the exitCodeId is valid", async () => {
    const officer = await createStaffUser();
    const [gateA, gateB] = await Promise.all([createGate(), createGate()]);
    const { device: deviceA, rawSecret: secretA } = await createDevice(gateA.id, officer.id);
    await createDevice(gateB.id, officer.id);
    const student = await createStudent();
    await markInside(student, deviceA, secretA, officer.id);

    const { qr } = await getOrCreateExitCode(deviceA.deviceIdentifier, secretA, officer.id, "127.0.0.1");
    const tampered = { ...qr, gateId: gateB.id };
    await expectAppError(verifyExit({ qr: tampered }, student.userId, student.id, "127.0.0.1"), "INVALID_QR");
  });

  it("rejects an exit for a suspended student without changing their presence", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent({ presenceStatus: "INSIDE" });
    await prisma.studentPresence.update({ where: { studentId: student.id }, data: { status: "SUSPENDED" } });

    const { qr } = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    await expectAppError(verifyExit({ qr }, student.userId, student.id, "127.0.0.1"), "STUDENT_SUSPENDED");

    const presence = await prisma.studentPresence.findUnique({ where: { studentId: student.id } });
    expect(presence?.status).toBe("SUSPENDED");
  });

  it("records an audit log entry attributed to the student themselves for a self-service exit", async () => {
    const officer = await createStaffUser();
    const gate = await createGate();
    const { device, rawSecret } = await createDevice(gate.id, officer.id);
    const student = await createStudent();
    await markInside(student, device, rawSecret, officer.id);

    const { qr } = await getOrCreateExitCode(device.deviceIdentifier, rawSecret, officer.id, "127.0.0.1");
    await verifyExit({ qr }, student.userId, student.id, "127.0.0.1");

    const logs = await prisma.auditLog.findMany({ where: { actorUserId: student.userId, action: "EXIT_RECORDED" } });
    expect(logs).toHaveLength(1);
  });
});
