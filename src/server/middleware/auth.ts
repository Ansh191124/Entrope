import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionTokenPayload } from "@/server/lib/jwt";
import { AppError } from "@/server/lib/errors";
import { prisma } from "@/server/lib/prisma";

/**
 * Resolves the caller's identity from the httpOnly session cookie (the web
 * app) or, failing that, an `Authorization: Bearer <token>` header (the
 * mobile app — see /api/auth/mobile-login). A mobile client can't read an
 * httpOnly cookie, so it carries the same JWT itself instead; the web login
 * flow is untouched and still never exposes its token outside the cookie.
 * Returns null if neither is present/valid — callers decide whether that's
 * acceptable.
 */
export async function getSession(req: NextRequest): Promise<SessionTokenPayload | null> {
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const token = cookieToken ?? bearerToken;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return payload;
}

/** Requires a valid session; throws UNAUTHENTICATED otherwise. Also re-checks the account is still active. */
export async function requireSession(req: NextRequest): Promise<SessionTokenPayload> {
  const session = await getSession(req);
  if (!session) {
    throw new AppError("UNAUTHENTICATED", "You must be signed in to perform this action.");
  }
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { active: true } });
  if (!user || !user.active) {
    throw new AppError("UNAUTHENTICATED", "Your account is no longer active.");
  }
  return session;
}

/** Requires the session's role to be one of `roles`; throws FORBIDDEN otherwise. */
export function requireRole(session: SessionTokenPayload, ...roles: Role[]): void {
  if (!roles.includes(session.role)) {
    throw new AppError("FORBIDDEN", "You do not have permission to perform this action.");
  }
}

export async function requireSessionWithRole(req: NextRequest, ...roles: Role[]): Promise<SessionTokenPayload> {
  const session = await requireSession(req);
  requireRole(session, ...roles);
  return session;
}
