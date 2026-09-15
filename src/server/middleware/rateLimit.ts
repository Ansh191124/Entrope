import { AppError } from "@/server/lib/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fixed-window limiter. Sufficient for a single-process deployment;
// swap for a Redis-backed limiter (see REDIS_URL in .env.example) before
// running more than one app instance behind a load balancer.
const buckets = new Map<string, Bucket>();

// Periodically sweep expired buckets so this map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();

export interface RateLimitOptions {
  /** Unique key for this limiter scope, e.g. "scan", "login". */
  scope: string;
  /** Max requests allowed within the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

/**
 * Throws RATE_LIMITED if `identifier` (e.g. IP address, or IP+deviceId)
 * has exceeded `limit` requests within `windowMs` for the given scope.
 */
export function enforceRateLimit(identifier: string, options: RateLimitOptions): void {
  const key = `${options.scope}:${identifier}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (existing.count >= options.limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please slow down and try again shortly.");
  }

  existing.count += 1;
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
