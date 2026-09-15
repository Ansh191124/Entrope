import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireSession } from "@/server/middleware/auth";
import { getCurrentUser } from "@/server/modules/auth/auth.service";
import { withErrorHandling } from "@/server/lib/apiHandler";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession(req);
  const user = await getCurrentUser(session.sub);
  return NextResponse.json({ success: true, user });
});
