import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const QR_SECRET = process.env.QR_SECRET;

function getQrSecret(): string {
  if (!QR_SECRET || QR_SECRET.length < 16) {
    throw new Error(
      "QR_SECRET is not configured. Set a long random value in your environment before generating QR sessions."
    );
  }
  return QR_SECRET;
}

/**
 * Cryptographically secure random nonce for a security session. Never derive
 * this from Math.random() or any sequential/predictable source — it is the
 * only secret embedded in the QR payload, so its unguessability is what
 * makes the QR a session reference rather than a bearer credential someone
 * could brute-force.
 */
export function generateNonce(): string {
  return randomBytes(32).toString("base64url");
}

/** One-way hash of the nonce, stored server-side — the raw nonce never touches the DB. */
export function hashNonce(nonce: string): string {
  return createHmac("sha256", getQrSecret()).update(nonce).digest("hex");
}

export interface QrPayload {
  sessionId: string;
  nonce: string;
  expiresAt: string; // ISO string, server-issued
}

export interface SignedQrPayload extends QrPayload {
  sig: string;
}

function computeSignature(payload: QrPayload): string {
  return createHmac("sha256", getQrSecret())
    .update(`${payload.sessionId}.${payload.nonce}.${payload.expiresAt}`)
    .digest("hex");
}

/** Sign an outbound QR payload so tampering in transit/at the client is detectable. */
export function signQrPayload(payload: QrPayload): SignedQrPayload {
  return { ...payload, sig: computeSignature(payload) };
}

/**
 * Verify a scanned QR payload's signature. This only proves the payload was
 * issued by us and hasn't been altered in transit — it does NOT prove the
 * session is still active/unexpired/unconsumed. That authoritative check
 * always happens against the database inside the scan transaction.
 */
export function verifyQrSignature(payload: SignedQrPayload): boolean {
  if (!payload || typeof payload.sig !== "string") return false;
  const expected = computeSignature(payload);
  const a = Buffer.from(payload.sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Random opaque identifier for device secrets, session tokens, etc. */
export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// ────────────────────────────────────────────────────────────────────────
// Permanent exit-code QR (displayed/printed at a gate, scanned by the
// student's own device). Deliberately a different signing namespace
// ("EXIT.") from the dynamic session QR above, and deliberately has no
// nonce/expiry field to sign — it's meant to stay valid indefinitely until
// explicitly revoked. Its security doesn't come from secrecy (it's posted
// publicly on purpose); it comes from requiring the scanning student to be
// authenticated as themselves and from the presence-row check at scan time.
// ────────────────────────────────────────────────────────────────────────

export interface ExitQrPayload {
  exitCodeId: string;
  gateId: string;
}

export interface SignedExitQrPayload extends ExitQrPayload {
  sig: string;
}

function computeExitSignature(payload: ExitQrPayload): string {
  return createHmac("sha256", getQrSecret()).update(`EXIT.${payload.exitCodeId}.${payload.gateId}`).digest("hex");
}

export function signExitQrPayload(payload: ExitQrPayload): SignedExitQrPayload {
  return { ...payload, sig: computeExitSignature(payload) };
}

export function verifyExitQrSignature(payload: SignedExitQrPayload): boolean {
  if (!payload || typeof payload.sig !== "string") return false;
  const expected = computeExitSignature(payload);
  const a = Buffer.from(payload.sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
