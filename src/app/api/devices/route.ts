import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { createDeviceSchema } from "@/validations/device";
import { listDevices, registerDevice } from "@/server/modules/devices/devices.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const devices = await listDevices();
  return NextResponse.json({ success: true, devices });
});

// The raw device secret is returned exactly once, here, at registration —
// never again. If lost, the fix is to revoke and re-register the device.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const body = createDeviceSchema.parse(await req.json());
  const { device, rawSecret } = await registerDevice(body, session.sub);
  return NextResponse.json({ success: true, device, deviceSecret: rawSecret }, { status: 201 });
});
