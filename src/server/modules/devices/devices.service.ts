import bcrypt from "bcryptjs";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { generateSecret } from "@/server/lib/crypto";
import { recordAudit } from "@/server/modules/audit/audit.service";
import type { CreateDeviceInput, UpdateDeviceInput } from "@/validations/device";

export async function listDevices() {
  return prisma.device.findMany({
    orderBy: { createdAt: "desc" },
    include: { gate: { select: { id: true, name: true } } },
  });
}

/**
 * Registers a device and returns the raw secret exactly once — only the
 * bcrypt hash is persisted. The caller (admin UI) must show this secret to
 * the operator immediately; it cannot be recovered afterwards, only reset.
 */
export async function registerDevice(input: CreateDeviceInput, actorUserId: string) {
  const gate = await prisma.gate.findUnique({ where: { id: input.gateId } });
  if (!gate) throw new AppError("NOT_FOUND", "Gate not found.");

  const existing = await prisma.device.findUnique({ where: { deviceIdentifier: input.deviceIdentifier } });
  if (existing) throw new AppError("CONFLICT", "A device with this identifier is already registered.");

  const rawSecret = generateSecret(24);
  const deviceSecretHash = await bcrypt.hash(rawSecret, 12);

  const device = await prisma.device.create({
    data: {
      gateId: input.gateId,
      name: input.name,
      deviceIdentifier: input.deviceIdentifier,
      deviceSecretHash,
      registeredById: actorUserId,
    },
  });

  await recordAudit({
    actorUserId,
    action: "DEVICE_REGISTERED",
    entityType: "Device",
    entityId: device.id,
    metadata: { gateId: input.gateId, deviceIdentifier: input.deviceIdentifier },
  });

  return { device, rawSecret };
}

export async function updateDevice(deviceId: string, input: UpdateDeviceInput, actorUserId: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new AppError("NOT_FOUND", "Device not found.");

  const updated = await prisma.device.update({ where: { id: deviceId }, data: input });
  await recordAudit({
    actorUserId,
    action: input.active === false ? "DEVICE_DISABLED" : "DEVICE_UPDATED",
    entityType: "Device",
    entityId: deviceId,
    metadata: input,
  });
  return updated;
}

/** Immediately revoke a device — e.g. reported stolen. Disallows all future scans/session creation. */
export async function revokeDevice(deviceId: string, actorUserId: string) {
  return updateDevice(deviceId, { active: false }, actorUserId);
}

export async function deleteDevice(deviceId: string, actorUserId: string) {
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device) throw new AppError("NOT_FOUND", "Device not found.");
  await prisma.device.delete({ where: { id: deviceId } });
  await recordAudit({ actorUserId, action: "DEVICE_DELETED", entityType: "Device", entityId: deviceId });
}

/**
 * Verifies a device's presented credential (its human-assigned identifier +
 * secret — the same two values handed to the operator at registration time,
 * never the internal database id) and that it (and its gate) is active.
 * Used by security.service.
 */
export async function authenticateDevice(deviceIdentifier: string, deviceSecret: string) {
  const device = await prisma.device.findUnique({ where: { deviceIdentifier }, include: { gate: true } });
  if (!device) throw new AppError("DEVICE_UNAUTHORIZED", "Unrecognized device.");

  const valid = await bcrypt.compare(deviceSecret, device.deviceSecretHash);
  if (!valid) throw new AppError("DEVICE_UNAUTHORIZED", "Device authentication failed.");

  if (!device.active) throw new AppError("DEVICE_UNAUTHORIZED", "This device has been disabled.");
  if (!device.gate.active) throw new AppError("GATE_INACTIVE", "This gate is currently inactive.");

  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  return device;
}
