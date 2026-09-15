import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateSecret } from "../src/server/lib/crypto";

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: "Computer Science", courses: ["B.Tech CSE", "M.Tech CSE"] },
  { name: "Electronics", courses: ["B.Tech ECE"] },
  { name: "Mechanical", courses: ["B.Tech ME"] },
  { name: "Civil", courses: ["B.Tech CE"] },
  { name: "Business Administration", courses: ["BBA", "MBA"] },
];

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
  "Ananya", "Diya", "Saanvi", "Aadhya", "Kiara", "Myra", "Anika", "Navya", "Riya", "Ira",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Patel", "Reddy", "Singh", "Rao", "Mehta",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

async function upsertStaffUser(email: string, name: string, role: "SUPER_ADMIN" | "ADMIN" | "SECURITY_OFFICER", password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash, active: true },
  });
}

async function main() {
  console.log("Seeding CampusGuard development data...");

  // ── Staff accounts ──────────────────────────────────────────────────
  const superAdmin = await upsertStaffUser("admin@campusguard.dev", "Sam Superadmin", "SUPER_ADMIN", "SuperAdmin123!");
  const admin = await upsertStaffUser("registrar@campusguard.dev", "Alex Admin", "ADMIN", "AdminPass123!");
  const officer1 = await upsertStaffUser("officer.main@campusguard.dev", "Priya Officer", "SECURITY_OFFICER", "Officer123!");
  const officer2 = await upsertStaffUser("officer.north@campusguard.dev", "Rahul Officer", "SECURITY_OFFICER", "Officer123!");

  // ── Gates ───────────────────────────────────────────────────────────
  const gateNames = ["Main Gate", "North Gate", "South Gate", "Hostel Gate", "Library Gate", "Building A Gate"];
  const gates = [];
  for (const name of gateNames) {
    const gate = await prisma.gate.upsert({
      where: { name },
      update: {},
      create: { name, location: name, active: true },
    });
    gates.push(gate);
  }

  // ── Devices (one kiosk per gate, plus a spare at Main Gate) ────────
  const deviceSecrets: Record<string, string> = {};
  for (const gate of gates) {
    const identifier = `KIOSK-${gate.name.replace(/\s+/g, "-").toUpperCase()}-01`;
    const existing = await prisma.device.findUnique({ where: { deviceIdentifier: identifier } });
    if (!existing) {
      const rawSecret = generateSecret(16);
      const deviceSecretHash = await bcrypt.hash(rawSecret, 10);
      await prisma.device.create({
        data: {
          gateId: gate.id,
          name: `${gate.name} Kiosk 1`,
          deviceIdentifier: identifier,
          deviceSecretHash,
          registeredById: superAdmin.id,
        },
      });
      deviceSecrets[identifier] = rawSecret;
    }
  }

  // ── Students (120 across 5 departments) ────────────────────────────
  const totalStudents = 120;
  let created = 0;
  for (let i = 0; i < totalStudents; i++) {
    const dept = pick(DEPARTMENTS, i);
    const first = pick(FIRST_NAMES, i * 7 + 3);
    const last = pick(LAST_NAMES, i * 13 + 5);
    const enrollmentNo = `CG${String(2024000 + i).padStart(7, "0")}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}.${i}@students.campusguard.dev`;

    const existing = await prisma.student.findUnique({ where: { enrollmentNo } });
    if (existing) continue;

    const passwordHash = await bcrypt.hash("Student123!", 10);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: `${first} ${last}`, role: "STUDENT", passwordHash, active: true },
    });
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        enrollmentNo,
        name: `${first} ${last}`,
        email,
        department: dept.name,
        course: pick(dept.courses, i),
        year: (i % 4) + 1,
        semester: (i % 8) + 1,
        section: pick(["A", "B", "C"], i),
        active: true,
      },
    });
    await prisma.studentPresence.create({ data: { studentId: student.id, status: "OUTSIDE" } });
    created++;
  }

  // ── A few sample access events for realistic dashboards ────────────
  const sampleStudents = await prisma.student.findMany({ take: 15 });
  const mainGate = gates[0]!;
  const mainDevice = await prisma.device.findFirst({ where: { gateId: mainGate.id } });
  if (mainDevice) {
    for (const [i, student] of sampleStudents.entries()) {
      if (i % 2 !== 0) continue; // leave every other one OUTSIDE for a realistic mix
      const enteredAt = new Date(Date.now() - (i + 1) * 15 * 60 * 1000);
      const fakeSession = await prisma.securitySession.create({
        data: {
          createdByStudentId: student.id,
          gateId: mainGate.id,
          deviceId: mainDevice.id,
          scannedByUserId: officer1.id,
          nonceHash: `seed-${student.id}`,
          status: "CONSUMED",
          issuedAt: enteredAt,
          expiresAt: new Date(enteredAt.getTime() + 20_000),
          consumedAt: enteredAt,
        },
      });
      const event = await prisma.accessEvent.create({
        data: {
          studentId: student.id,
          gateId: mainGate.id,
          deviceId: mainDevice.id,
          sessionId: fakeSession.id,
          eventType: "ENTRY",
          timestamp: enteredAt,
        },
      });
      await prisma.studentPresence.update({
        where: { studentId: student.id },
        data: { status: "INSIDE", currentEntryEventId: event.id, enteredAt, lastGateId: mainGate.id },
      });
    }
  }

  console.log(`Seeded ${created} new students (${totalStudents} target), ${gates.length} gates, staff accounts.`);
  console.log("\nStaff logins (password shown once for dev convenience only):");
  console.log("  SUPER_ADMIN       admin@campusguard.dev / SuperAdmin123!");
  console.log("  ADMIN             registrar@campusguard.dev / AdminPass123!");
  console.log("  SECURITY_OFFICER  officer.main@campusguard.dev / Officer123!");
  console.log("  SECURITY_OFFICER  officer.north@campusguard.dev / Officer123!");
  console.log("  STUDENT           any seeded student email / Student123!");
  if (Object.keys(deviceSecrets).length > 0) {
    console.log("\nNewly registered device secrets (also shown once):");
    for (const [id, secret] of Object.entries(deviceSecrets)) {
      console.log(`  ${id} -> ${secret}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
