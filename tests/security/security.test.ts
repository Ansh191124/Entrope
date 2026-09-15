import { describe, it, expect, vi } from "vitest";
import { enforceRateLimit } from "@/server/middleware/rateLimit";
import { AppError } from "@/server/lib/errors";
import { signSessionToken, verifySessionToken } from "@/server/lib/jwt";
import { qrPayloadSchema, verifyScanSchema } from "@/validations/security";
import { verifyQrSignature, signQrPayload, generateNonce } from "@/server/lib/crypto";

describe("Rate limiting", () => {
  it("allows requests under the limit and blocks once the limit is exceeded", () => {
    const id = `test-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(() => enforceRateLimit(id, { scope: "unit-test", limit: 5, windowMs: 60_000 })).not.toThrow();
    }
    expect(() => enforceRateLimit(id, { scope: "unit-test", limit: 5, windowMs: 60_000 })).toThrow(AppError);
  });

  it("tracks separate identifiers independently", () => {
    const scope = "unit-test-separate";
    enforceRateLimit("id-a", { scope, limit: 1, windowMs: 60_000 });
    expect(() => enforceRateLimit("id-b", { scope, limit: 1, windowMs: 60_000 })).not.toThrow();
  });
});

describe("JWT session tokens", () => {
  it("rejects a tampered token", () => {
    const token = signSessionToken({ sub: "u1", role: "STUDENT", email: "a@test.local" });
    const tampered = token.slice(0, -3) + "xyz";
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const realJwt = signSessionToken({ sub: "u1", role: "STUDENT", email: "a@test.local" });
    // Fast-forward well past the 12h default expiry.
    vi.setSystemTime(Date.now() + 1000 * 60 * 60 * 24);
    expect(verifySessionToken(realJwt)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects a garbage/malformed token instead of throwing", () => {
    expect(verifySessionToken("not.a.jwt")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
  });
});

describe("Input validation rejects malformed / injection-shaped payloads", () => {
  it("rejects a QR payload whose sessionId is not a UUID (e.g. an injection attempt)", () => {
    const result = qrPayloadSchema.safeParse({
      sessionId: "'; DROP TABLE students; --",
      nonce: "x".repeat(32),
      expiresAt: new Date().toISOString(),
      sig: "x".repeat(32),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a QR payload missing required fields", () => {
    const result = qrPayloadSchema.safeParse({ sessionId: crypto.randomUUID() });
    expect(result.success).toBe(false);
  });

  it("rejects a verify-scan request missing the device identifier", () => {
    const result = verifyScanSchema.safeParse({
      qr: {
        sessionId: crypto.randomUUID(),
        nonce: "x".repeat(32),
        expiresAt: new Date().toISOString(),
        sig: "x".repeat(32),
      },
      deviceSecret: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("QR tamper resistance", () => {
  it("a payload cannot be forged without knowledge of QR_SECRET", () => {
    const legitimate = signQrPayload({
      sessionId: crypto.randomUUID(),
      nonce: generateNonce(),
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
    });

    // Attacker who intercepted a legitimate QR tries to mint a new one for a
    // different, arbitrary session id, copying the observed signature format.
    const forged = { ...legitimate, sessionId: crypto.randomUUID() };
    expect(verifyQrSignature(forged)).toBe(false);
  });
});
