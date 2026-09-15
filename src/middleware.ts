import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/lib/jwt";

// Edge-runtime middleware can only do a cheap presence check (jsonwebtoken's
// signature verification needs Node's crypto module, unavailable here) — its
// job is purely to avoid a flash of protected UI for obviously-signed-out
// visitors. The real, cryptographically verified authorization boundary is
// requireSession/requireRole in every API route handler (Node runtime) and
// RoleGuard's client-side check against /api/auth/me.
const PROTECTED_PREFIXES = ["/admin", "/security", "/student"];

export function middleware(req: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/security/:path*", "/student/:path*"],
};
