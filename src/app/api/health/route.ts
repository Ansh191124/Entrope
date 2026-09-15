import { NextResponse } from "next/server";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
