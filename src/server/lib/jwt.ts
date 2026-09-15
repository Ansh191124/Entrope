import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";

export interface SessionTokenPayload {
  sub: string; // user id
  role: Role;
  email: string;
  studentId?: string; // present only for STUDENT-role users
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is not configured. Set a long random value in your environment.");
  }
  return secret;
}

export function signSessionToken(payload: SessionTokenPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "12h") as jwt.SignOptions["expiresIn"];
  return jwt.sign(payload, getSecret(), { expiresIn });
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionTokenPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "campusguard_session";
