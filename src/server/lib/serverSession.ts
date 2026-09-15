import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionTokenPayload } from "@/server/lib/jwt";

/** Server Component / Server Action variant of session lookup (reads from next/headers cookies()). */
export function getServerSession(): SessionTokenPayload | null {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function dashboardPathForRole(role: SessionTokenPayload["role"]): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return "/admin";
    case "SECURITY_OFFICER":
      return "/security";
    case "STUDENT":
      return "/student";
    default:
      return "/login";
  }
}
