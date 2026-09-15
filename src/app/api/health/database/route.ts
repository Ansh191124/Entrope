import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/prisma";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error", message: "Database unreachable" }, { status: 503 });
  }
}
