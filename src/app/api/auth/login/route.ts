import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/validations/auth";
import { login } from "@/server/modules/auth/auth.service";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { SESSION_COOKIE_NAME } from "@/server/lib/jwt";
import { enforceRateLimit, getClientIp } from "@/server/middleware/rateLimit";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const ip = getClientIp(req.headers);
  enforceRateLimit(ip, { scope: "login", limit: 10, windowMs: 60_000 });

  const body = loginSchema.parse(await req.json());
  const { token, user } = await login(body, ip);

  const response = NextResponse.json({ success: true, user });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
});
