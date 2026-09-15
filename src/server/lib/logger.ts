/**
 * Minimal structured logger. Every security-relevant call site passes a
 * fixed `event` name (see spec §35) plus contextual fields — never raw
 * secrets, passwords, tokens, or device secrets.
 */

type LogFields = Record<string, unknown>;

const REDACT_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "nonce",
  "deviceSecret",
  "deviceSecretHash",
  "jwt",
  "sig",
]);

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = REDACT_KEYS.has(key) ? "[REDACTED]" : value;
  }
  return out;
}

function emit(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...redact(fields),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
