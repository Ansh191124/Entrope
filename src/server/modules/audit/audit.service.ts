import { prisma } from "@/server/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  deviceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Append a row to the audit trail. Pass `client` when called from inside an
 * existing transaction (e.g. the scan transaction) so the audit entry
 * commits atomically with the state change it describes.
 */
export async function recordAudit(input: AuditInput, client: Client = prisma) {
  await client.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      deviceId: input.deviceId ?? null,
      metadata: input.metadata,
    },
  });
}

export interface ListAuditLogsParams {
  page: number;
  pageSize: number;
  entityType?: string;
  actorUserId?: string;
}

export async function listAuditLogs(params: ListAuditLogsParams) {
  const where: Prisma.AuditLogWhereInput = {
    ...(params.entityType ? { entityType: params.entityType } : {}),
    ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { actor: { select: { name: true, email: true, role: true } } },
    }),
  ]);

  return { total, page: params.page, pageSize: params.pageSize, items };
}
