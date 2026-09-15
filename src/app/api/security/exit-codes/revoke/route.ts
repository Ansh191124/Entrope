import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { getClientIp } from "@/server/middleware/rateLimit";
import { manageExitCodeSchema } from "@/validations/security";
import { revokeExitCode } from "@/server/modules/security/exitCode.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

// Revoke the current exit QR for this gate — e.g. the posted copy was
// defaced/stolen. A fresh POST to /api/security/exit-codes then mints a new one.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const ip = getClientIp(req.headers);
  const body = manageExitCodeSchema.parse(await req.json());
  const result = await revokeExitCode(body.deviceIdentifier, body.deviceSecret, session.sub, ip);
  return NextResponse.json({ success: true, exitCode: result });
});
