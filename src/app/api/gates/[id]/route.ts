import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { updateGateSchema } from "@/validations/gate";
import { deleteGate, updateGate } from "@/server/modules/gates/gates.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const body = updateGateSchema.parse(await req.json());
  const gate = await updateGate(params.id, body, session.sub);
  return NextResponse.json({ success: true, gate });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN");
  await deleteGate(params.id, session.sub);
  return NextResponse.json({ success: true });
});
