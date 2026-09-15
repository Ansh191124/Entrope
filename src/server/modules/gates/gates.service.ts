import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { broadcast } from "@/server/realtime/broadcast";
import type { CreateGateInput, UpdateGateInput } from "@/validations/gate";

export async function listGates() {
  return prisma.gate.findMany({
    orderBy: { name: "asc" },
    include: {
      devices: { select: { id: true, name: true, deviceIdentifier: true, active: true, lastSeenAt: true } },
      _count: { select: { accessEvents: true } },
    },
  });
}

export async function createGate(input: CreateGateInput, actorUserId: string) {
  const existing = await prisma.gate.findUnique({ where: { name: input.name } });
  if (existing) throw new AppError("CONFLICT", "A gate with this name already exists.");

  const gate = await prisma.gate.create({
    data: { name: input.name, location: input.location, description: input.description },
  });
  await recordAudit({ actorUserId, action: "GATE_CREATED", entityType: "Gate", entityId: gate.id });
  return gate;
}

export async function updateGate(gateId: string, input: UpdateGateInput, actorUserId: string) {
  const gate = await prisma.gate.findUnique({ where: { id: gateId } });
  if (!gate) throw new AppError("NOT_FOUND", "Gate not found.");

  const updated = await prisma.gate.update({ where: { id: gateId }, data: input });
  await recordAudit({
    actorUserId,
    action: "GATE_UPDATED",
    entityType: "Gate",
    entityId: gateId,
    metadata: input,
  });
  if (typeof input.active === "boolean") {
    broadcast({ type: "gate.status_changed", payload: { gateId, active: input.active } });
  }
  return updated;
}

export async function deleteGate(gateId: string, actorUserId: string) {
  const gate = await prisma.gate.findUnique({ where: { id: gateId } });
  if (!gate) throw new AppError("NOT_FOUND", "Gate not found.");
  await prisma.gate.delete({ where: { id: gateId } });
  await recordAudit({ actorUserId, action: "GATE_DELETED", entityType: "Gate", entityId: gateId });
}
