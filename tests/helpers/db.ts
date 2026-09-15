import { prisma } from "@/server/lib/prisma";

const TABLES = [
  "audit_logs",
  "alerts",
  "access_events",
  "security_sessions",
  "exit_codes",
  "student_presence",
  "students",
  "devices",
  "gates",
  "system_settings",
  "users",
];

/** Wipes all application tables. Call in beforeEach so every test starts from a clean slate. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
}
