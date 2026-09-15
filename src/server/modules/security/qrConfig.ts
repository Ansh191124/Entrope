export function getQrTtlSeconds(): number {
  const raw = Number(process.env.QR_TTL_SECONDS ?? 20);
  if (!Number.isFinite(raw) || raw < 5 || raw > 300) return 20;
  return raw;
}
