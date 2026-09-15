import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { getClientIp } from "@/server/middleware/rateLimit";
import { manageExitCodeSchema } from "@/validations/security";
import { getOrCreateExitCode } from "@/server/modules/security/exitCode.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

// An officer's kiosk fetches (or creates, on first use) the permanent exit
// QR for its own gate — to display on screen or print and post at the exit.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const ip = getClientIp(req.headers);
  const body = manageExitCodeSchema.parse(await req.json());
  const result = await getOrCreateExitCode(body.deviceIdentifier, body.deviceSecret, session.sub, ip);
  return NextResponse.json({ success: true, ...result });
});
