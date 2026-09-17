import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { listAccessEvents } from "@/server/modules/presence/presence.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  eventType: z.enum(["ENTRY", "EXIT"]).optional(),
  gateId: z.string().uuid().optional(),
});

// Entry/exit history, searchable by student name or enrollment number.
// Unlike /api/audit-logs (admin-only action trail), this is the security
// officer's own working log — SECURITY_OFFICER is intentionally allowed.
export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const result = await listAccessEvents(query);
  return NextResponse.json({ success: true, ...result });
});
