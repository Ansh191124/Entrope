import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { signExitQrPayload } from "@/server/lib/crypto";
import { authenticateDevice } from "@/server/modules/devices/devices.service";
import { recordAudit } from "@/server/modules/audit/audit.service";

/**
 * Returns the gate's current active exit code, creating one if none exists.
 * Idempotent by design: calling this repeatedly (e.g. the officer reopening
 * this screen) returns the SAME code/QR as long as it hasn't been revoked —
 * a posted/printed QR should keep working until someone deliberately
 * revokes it, not silently rotate.
 */
export async function getOrCreateExitCode(deviceIdentifier: string, deviceSecret: string, actorUserId: string, ip: string) {
  const device = await authenticateDevice(deviceIdentifier, deviceSecret);

  let exitCode = await prisma.exitCode.findFirst({
    where: { gateId: device.gateId, active: true },
    include: { gate: { select: { name: true } } },
  });

  if (!exitCode) {
    exitCode = await prisma.exitCode.create({
      data: { gateId: device.gateId, createdById: actorUserId },
      include: { gate: { select: { name: true } } },
    });
    await recordAudit({
      actorUserId,
      action: "EXIT_CODE_CREATED",
      entityType: "ExitCode",
      entityId: exitCode.id,
      deviceId: device.id,
      ipAddress: ip,
      metadata: { gateId: device.gateId },
    });
  }

  const qr = signExitQrPayload({ exitCodeId: exitCode.id, gateId: exitCode.gateId });

  return {
    exitCode: {
      id: exitCode.id,
      gateId: exitCode.gateId,
      gateName: exitCode.gate.name,
      active: exitCode.active,
      createdAt: exitCode.createdAt.toISOString(),
    },
    qr,
  };
}

/** Revoke the gate's current exit code — e.g. the poster was defaced/stolen, or the gate is being reconfigured. */
export async function revokeExitCode(deviceIdentifier: string, deviceSecret: string, actorUserId: string, ip: string) {
  const device = await authenticateDevice(deviceIdentifier, deviceSecret);

  const exitCode = await prisma.exitCode.findFirst({ where: { gateId: device.gateId, active: true } });
  if (!exitCode) {
    throw new AppError("NOT_FOUND", "There is no active exit code for this gate.");
  }

  const updated = await prisma.exitCode.update({
    where: { id: exitCode.id },
    data: { active: false, revokedAt: new Date() },
  });

  await recordAudit({
    actorUserId,
    action: "EXIT_CODE_REVOKED",
    entityType: "ExitCode",
    entityId: exitCode.id,
    deviceId: device.id,
    ipAddress: ip,
  });

  return updated;
}
