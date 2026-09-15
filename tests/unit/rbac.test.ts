import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { requireRole, getSession } from "@/server/middleware/auth";
import { signSessionToken, SESSION_COOKIE_NAME } from "@/server/lib/jwt";
import { AppError } from "@/server/lib/errors";
import type { SessionTokenPayload } from "@/server/lib/jwt";

function session(role: SessionTokenPayload["role"]): SessionTokenPayload {
  return { sub: "user-1", role, email: "user@test.local" };
}

describe("RBAC guard", () => {
  it("allows a role that is in the permitted list", () => {
    expect(() => requireRole(session("SUPER_ADMIN"), "SUPER_ADMIN", "ADMIN")).not.toThrow();
  });

  it("rejects a STUDENT attempting an admin-only action (privilege escalation attempt)", () => {
    expect(() => requireRole(session("STUDENT"), "SUPER_ADMIN", "ADMIN")).toThrow(AppError);
    try {
      requireRole(session("STUDENT"), "SUPER_ADMIN", "ADMIN");
    } catch (err) {
      expect((err as AppError).code).toBe("FORBIDDEN");
      expect((err as AppError).status).toBe(403);
    }
  });

  it("rejects a SECURITY_OFFICER attempting to manage administrators (§5: officers cannot manage admins)", () => {
    expect(() => requireRole(session("SECURITY_OFFICER"), "SUPER_ADMIN")).toThrow(AppError);
  });
});

describe("getSession — cookie (web) and Bearer header (mobile) both resolve identity", () => {
  const token = signSessionToken({ sub: "student-user-1", role: "STUDENT", email: "s@test.local", studentId: "student-1" });

  it("resolves from the session cookie when present", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const result = await getSession(req);
    expect(result?.sub).toBe("student-user-1");
  });

  it("falls back to an Authorization: Bearer header when there's no cookie (the mobile app's path)", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await getSession(req);
    expect(result?.sub).toBe("student-user-1");
  });

  it("returns null when neither a cookie nor a Bearer header is present", async () => {
    const req = new NextRequest("http://localhost/api/test");
    expect(await getSession(req)).toBeNull();
  });

  it("rejects a malformed Authorization header instead of throwing", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { authorization: "NotBearer sometoken" },
    });
    expect(await getSession(req)).toBeNull();
  });

  it("rejects a tampered bearer token", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { authorization: `Bearer ${token.slice(0, -3)}xyz` },
    });
    expect(await getSession(req)).toBeNull();
  });
});
