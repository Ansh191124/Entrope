// NODE_ENV's type is readonly in newer @types/node; this is the standard escape hatch.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-only-jwt-secret-do-not-use-in-production-0000000000";
process.env.QR_SECRET ??= "test-only-qr-secret-do-not-use-in-production-1111111111";
process.env.QR_TTL_SECONDS ??= "20";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://campusguard:campusguard@localhost:5432/campusguard_test?schema=public";
