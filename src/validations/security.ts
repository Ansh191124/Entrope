import { z } from "zod";

// The QR payload — an opaque, signed reference to a security session. It
// never contains a student identity, whether the QR is being generated or
// verified: the payload shape is identical either direction.
export const qrPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  nonce: z.string().min(10).max(200),
  expiresAt: z.string().datetime(),
  sig: z.string().min(10).max(200),
});
export type QrPayloadInput = z.infer<typeof qrPayloadSchema>;

// A student generates their own QR session — no request body needed, their
// identity comes solely from their own auth session (never a client-supplied
// field), and the gate is deliberately NOT chosen here: it's determined by
// whichever officer device ends up scanning it.

// A student may revoke (cancel) a QR session they generated, before it's
// scanned — e.g. they generated one by mistake or changed their mind.
export const revokeOwnSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

// Verifying a scanned QR requires proving control of a registered device. The
// device authenticates with its human-assigned identifier (e.g.
// "KIOSK-MAIN-GATE-01") + secret — the same two values printed for the
// operator at registration time — never the device's internal database id,
// which a real kiosk would have no practical way to know.
// The gate is derived server-side from the device's own gate assignment —
// never accepted as a separate client-supplied field — so a device can never
// be used to verify a scan for a gate it isn't assigned to.
export const verifyScanSchema = z.object({
  qr: qrPayloadSchema,
  deviceIdentifier: z.string().min(1).max(100),
  deviceSecret: z.string().min(1).max(500),
});
export type VerifyScanInput = z.infer<typeof verifyScanSchema>;

// ────────────────────────────────────────────────────────────────────────
// Permanent exit codes — the wall/screen QR a student scans on their own
// device to self-service mark their exit.
// ────────────────────────────────────────────────────────────────────────

export const exitQrPayloadSchema = z.object({
  exitCodeId: z.string().uuid(),
  gateId: z.string().uuid(),
  sig: z.string().min(10).max(200),
});
export type ExitQrPayloadInput = z.infer<typeof exitQrPayloadSchema>;

// An officer's device requests (or fetches the existing) permanent exit QR
// for its own gate — same device-credential pattern as verifyScanSchema.
export const manageExitCodeSchema = z.object({
  deviceIdentifier: z.string().min(1).max(100),
  deviceSecret: z.string().min(1).max(500),
});
export type ManageExitCodeInput = z.infer<typeof manageExitCodeSchema>;

// A student scans the posted exit QR with their own device — their identity
// comes solely from their own auth session, never from this body.
export const verifyExitSchema = z.object({
  qr: exitQrPayloadSchema,
});
export type VerifyExitInput = z.infer<typeof verifyExitSchema>;
