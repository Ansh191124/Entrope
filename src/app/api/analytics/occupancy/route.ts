import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { getHourlyActivity } from "@/server/modules/analytics/analytics.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const hourly = await getHourlyActivity();
  return NextResponse.json({ success: true, hourly });
});
