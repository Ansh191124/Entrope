import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { listAlerts } from "@/server/modules/alerts/alerts.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

const querySchema = z.object({ status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional() });

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const { status } = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const alerts = await listAlerts(status);
  return NextResponse.json({ success: true, alerts });
});
