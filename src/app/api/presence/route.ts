import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { getOccupancySummary } from "@/server/modules/presence/presence.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSession(req); // any authenticated role may view aggregate occupancy
  const summary = await getOccupancySummary();
  return NextResponse.json({ success: true, ...summary });
});
