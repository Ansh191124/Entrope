import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { AppError } from "@/server/lib/errors";
import { getSecuritySession } from "@/server/modules/security/sessions.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const STAFF_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER"]);

export const GET = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSession(req);
  const securitySession = await getSecuritySession(params.id);
  const isOwner = session.role === "STUDENT" && session.studentId === securitySession.createdByStudentId;
  if (!isOwner && !STAFF_ROLES.has(session.role)) {
    throw new AppError("FORBIDDEN", "You may only view your own QR sessions.");
  }
  return NextResponse.json({ success: true, session: securitySession });
});
