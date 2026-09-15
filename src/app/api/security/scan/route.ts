import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { enforceRateLimit, getClientIp } from "@/server/middleware/rateLimit";
import { verifyScanSchema } from "@/validations/security";
import { verifyScan } from "@/server/modules/security/scan.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

// A security officer's registered device scans a student-generated QR to
// verify the student exists in the system and record their ENTRY/EXIT. The
// officer authenticates as a staff user AND the kiosk authenticates as a
// registered device — both are required, neither is trusted alone.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");

  const ip = getClientIp(req.headers);
  // Tight window: legitimate use is a handful of scans per minute at most.
  enforceRateLimit(`${ip}:${session.sub}`, { scope: "scan", limit: 30, windowMs: 60_000 });

  const body = verifyScanSchema.parse(await req.json());
  const result = await verifyScan(body, session.sub, ip);
  return NextResponse.json(result);
});
