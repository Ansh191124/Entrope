import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { SESSION_COOKIE_NAME } from "@/server/lib/jwt";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async () => {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
});
