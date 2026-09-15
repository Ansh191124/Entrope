import { execSync } from "child_process";

/**
 * Runs once before the whole test run: pushes the Prisma schema onto the
 * dedicated test database (TEST_DATABASE_URL / campusguard_test). Never
 * point this at a database with data you care about — it does not migrate
 * incrementally, it force-syncs the schema.
 */
export default async function globalSetup() {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgresql://campusguard:campusguard@localhost:5432/campusguard_test?schema=public";

  execSync("npx prisma db push --skip-generate --force-reset --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
  });
}
