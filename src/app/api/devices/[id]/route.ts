import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { updateDeviceSchema } from "@/validations/device";
import { deleteDevice, updateDevice } from "@/server/modules/devices/devices.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const body = updateDeviceSchema.parse(await req.json());
  const device = await updateDevice(params.id, body, session.sub);
  return NextResponse.json({ success: true, device });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN");
  await deleteDevice(params.id, session.sub);
  return NextResponse.json({ success: true });
});
