import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { createGateSchema } from "@/validations/gate";
import { createGate, listGates } from "@/server/modules/gates/gates.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const gates = await listGates();
  return NextResponse.json({ success: true, gates });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const body = createGateSchema.parse(await req.json());
  const gate = await createGate(body, session.sub);
  return NextResponse.json({ success: true, gate }, { status: 201 });
});
