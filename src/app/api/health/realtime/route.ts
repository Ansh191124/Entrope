import { NextResponse } from "next/server";
import { isRealtimeAttached } from "@/server/realtime/broadcast";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  const attached = isRealtimeAttached();
  return NextResponse.json(
    { status: attached ? "ok" : "unavailable" },
    { status: attached ? 200 : 503 }
  );
}
