import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { generateNonce, hashNonce, signQrPayload } from "@/server/lib/crypto";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { getQrTtlSeconds } from "@/server/modules/security/qrConfig";

/**
 * A student generates their own dynamic QR session. The gate is deliberately
 * NOT recorded here — the student doesn't choose or know which gate will
 * verify it; that's filled in only once an officer's device scans it (see
 * scan.service.ts). The QR payload itself stays opaque (session id + nonce +
 * expiry + signature) — it never carries the student's identity in the clear,
 * even though the student is the one generating it.
 */
export async function createStudentQrSession(studentId: string, ip: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new AppError("STUDENT_NOT_FOUND", "Student profile not found for this account.");
  if (!student.active) throw new AppError("STUDENT_INACTIVE", "This student account is inactive.");

  const nonce = generateNonce();
  const ttlSeconds = getQrTtlSeconds();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

  const session = await prisma.securitySession.create({
    data: {
      createdByStudentId: studentId,
      nonceHash: hashNonce(nonce),
      status: "ACTIVE",
      issuedAt,
      expiresAt,
    },
  });

  await recordAudit({
    actorUserId: student.userId,
    action: "QR_SESSION_CREATED",
    entityType: "SecuritySession",
    entityId: session.id,
    ipAddress: ip,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  const qr = signQrPayload({
    sessionId: session.id,
    nonce,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    session: {
      id: session.id,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ttlSeconds,
      status: session.status,
    },
    qr,
  };
}

export async function getSecuritySession(sessionId: string) {
  const session = await prisma.securitySession.findUnique({
    where: { id: sessionId },
    include: { gate: { select: { name: true } }, device: { select: { name: true } } },
  });
  if (!session) throw new AppError("NOT_FOUND", "Security session not found.");
  return session;
}

/** A student cancels their own not-yet-scanned QR session. */
export async function revokeOwnSession(sessionId: string, userId: string, studentId: string, ip: string) {
  const session = await prisma.securitySession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError("NOT_FOUND", "Security session not found.");
  if (session.createdByStudentId !== studentId) {
    throw new AppError("FORBIDDEN", "This QR session does not belong to you.");
  }
  if (session.status !== "ACTIVE") {
    return session; // already consumed/expired/revoked — nothing to do, idempotent
  }

  const updated = await prisma.securitySession.update({
    where: { id: sessionId },
    data: { status: "REVOKED" },
  });

  // actorUserId must be a users.id (FK) — never the Student record's id.
  await recordAudit({
    actorUserId: userId,
    action: "QR_SESSION_REVOKED",
    entityType: "SecuritySession",
    entityId: sessionId,
    ipAddress: ip,
  });

  return updated;
}
