import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { enforceRateLimit, getClientIp } from "@/server/middleware/rateLimit";
import { AppError } from "@/server/lib/errors";
import { createStudentQrSession } from "@/server/modules/security/sessions.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

// A student generates their own QR session — no request body: their identity
// comes solely from their own verified session, never from client input.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "STUDENT");
  if (!session.studentId) {
    throw new AppError("STUDENT_NOT_FOUND", "No student profile is linked to this account.");
  }

  const ip = getClientIp(req.headers);
  enforceRateLimit(`${ip}:${session.studentId}`, { scope: "qr-generate", limit: 20, windowMs: 60_000 });

  const result = await createStudentQrSession(session.studentId, ip);
  return NextResponse.json({ success: true, ...result }, { status: 201 });
});
