import { prisma } from "@/server/lib/prisma";
import { broadcast } from "@/server/realtime/broadcast";
import type { AlertSeverity, AlertType, Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export interface RaiseAlertInput {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  studentId?: string | null;
  gateId?: string | null;
}

export async function raiseAlert(input: RaiseAlertInput, client: Client = prisma) {
  const alert = await client.alert.create({
    data: {
      type: input.type,
      severity: input.severity,
      message: input.message,
      studentId: input.studentId ?? null,
      gateId: input.gateId ?? null,
    },
  });
  broadcast({ type: "security.alert", payload: alert });
  return alert;
}

export async function listAlerts(status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED") {
  return prisma.alert.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      student: { select: { name: true, enrollmentNo: true } },
      gate: { select: { name: true } },
    },
  });
}

export async function resolveAlert(alertId: string) {
  return prisma.alert.update({
    where: { id: alertId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}
