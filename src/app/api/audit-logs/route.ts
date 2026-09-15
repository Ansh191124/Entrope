import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { listAuditLogs } from "@/server/modules/audit/audit.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  entityType: z.string().max(100).optional(),
  actorUserId: z.string().uuid().optional(),
});

// Audit logs are read-only and restricted to SUPER_ADMIN/ADMIN — even
// SECURITY_OFFICER cannot view or modify them (§6).
export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const result = await listAuditLogs(query);
  return NextResponse.json({ success: true, ...result });
});
