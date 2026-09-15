import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { enforceRateLimit, getClientIp } from "@/server/middleware/rateLimit";
import { AppError } from "@/server/lib/errors";
import { verifyExitSchema } from "@/validations/security";
import { verifyExit } from "@/server/modules/security/scan.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

// A student scans the permanent exit QR posted at a gate, on their own
// device. Only an authenticated STUDENT can call this, and only as
// themselves — identity always comes from their own verified session, never
// from the request body (there is no student field in it at all).
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "STUDENT");
  if (!session.studentId) {
    throw new AppError("STUDENT_NOT_FOUND", "No student profile is linked to this account.");
  }

  const ip = getClientIp(req.headers);
  enforceRateLimit(`${ip}:${session.studentId}`, { scope: "exit", limit: 8, windowMs: 60_000 });

  const body = verifyExitSchema.parse(await req.json());
  const result = await verifyExit(body, session.sub, session.studentId, ip);
  return NextResponse.json(result);
});
