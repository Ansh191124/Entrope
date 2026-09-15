import { describe, it, expect } from "vitest";
import { generateNonce, hashNonce, signQrPayload, verifyQrSignature } from "@/server/lib/crypto";

describe("QR crypto primitives", () => {
  it("generates unique, high-entropy nonces (never Math.random-style predictability)", () => {
    const nonces = new Set(Array.from({ length: 1000 }, () => generateNonce()));
    expect(nonces.size).toBe(1000);
    for (const nonce of nonces) {
      expect(nonce.length).toBeGreaterThanOrEqual(32);
    }
  });

  it("hashes the same nonce deterministically but different nonces to different hashes", () => {
    const nonce = generateNonce();
    expect(hashNonce(nonce)).toBe(hashNonce(nonce));
    expect(hashNonce(nonce)).not.toBe(hashNonce(generateNonce()));
  });

  it("signs a payload and verifies it successfully", () => {
    const payload = { sessionId: crypto.randomUUID(), nonce: generateNonce(), expiresAt: new Date().toISOString() };
    const signed = signQrPayload(payload);
    expect(verifyQrSignature(signed)).toBe(true);
  });

  it("rejects a payload whose signature was forged/tampered", () => {
    const payload = { sessionId: crypto.randomUUID(), nonce: generateNonce(), expiresAt: new Date().toISOString() };
    const signed = signQrPayload(payload);

    // Attacker flips the session id but keeps the original signature.
    const tampered = { ...signed, sessionId: crypto.randomUUID() };
    expect(verifyQrSignature(tampered)).toBe(false);
  });

  it("rejects a payload with a garbage signature", () => {
    const payload = { sessionId: crypto.randomUUID(), nonce: generateNonce(), expiresAt: new Date().toISOString() };
    expect(verifyQrSignature({ ...payload, sig: "not-a-real-signature" })).toBe(false);
  });

  it("rejects a completely missing signature", () => {
    const payload = { sessionId: crypto.randomUUID(), nonce: generateNonce(), expiresAt: new Date().toISOString() };
    // @ts-expect-error deliberately omitting sig to simulate a malformed payload
    expect(verifyQrSignature(payload)).toBe(false);
  });
});
