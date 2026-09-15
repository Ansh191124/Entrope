import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { resolveAlert } from "@/server/modules/alerts/alerts.service";
import { recordAudit } from "@/server/modules/audit/audit.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export const POST = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const alert = await resolveAlert(params.id);
  await recordAudit({ actorUserId: session.sub, action: "ALERT_RESOLVED", entityType: "Alert", entityId: params.id });
  return NextResponse.json({ success: true, alert });
});
