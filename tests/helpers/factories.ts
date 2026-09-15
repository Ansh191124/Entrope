import bcrypt from "bcryptjs";
import { prisma } from "@/server/lib/prisma";
import { generateSecret } from "@/server/lib/crypto";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createStaffUser(role: "SUPER_ADMIN" | "ADMIN" | "SECURITY_OFFICER" = "SECURITY_OFFICER") {
  const passwordHash = await bcrypt.hash("Password123!", 4);
  return prisma.user.create({
    data: {
      email: `${unique("staff")}@test.local`,
      name: "Test Staff",
      role,
      passwordHash,
      active: true,
    },
  });
}

export async function createGate(overrides: Partial<{ active: boolean; name: string }> = {}) {
  return prisma.gate.create({
    data: {
      name: overrides.name ?? unique("Gate"),
      active: overrides.active ?? true,
    },
  });
}

export async function createDevice(
  gateId: string,
  registeredById: string,
  overrides: Partial<{ active: boolean }> = {}
) {
  const rawSecret = generateSecret(16);
  const deviceSecretHash = await bcrypt.hash(rawSecret, 4);
  const device = await prisma.device.create({
    data: {
      gateId,
      name: unique("Device"),
      deviceIdentifier: unique("DEVICE-ID"),
      deviceSecretHash,
      active: overrides.active ?? true,
      registeredById,
    },
  });
  return { device, rawSecret };
}

export async function createStudent(
  overrides: Partial<{ active: boolean; presenceStatus: "OUTSIDE" | "INSIDE" | "SUSPENDED" }> = {}
) {
  const passwordHash = await bcrypt.hash("Password123!", 4);
  const user = await prisma.user.create({
    data: {
      email: `${unique("student")}@test.local`,
      name: "Test Student",
      role: "STUDENT",
      passwordHash,
      active: true,
    },
  });
  const student = await prisma.student.create({
    data: {
      userId: user.id,
      enrollmentNo: unique("ENR"),
      name: "Test Student",
      email: user.email,
      department: "Computer Science",
      course: "B.Tech CSE",
      year: 1,
      semester: 1,
      active: overrides.active ?? true,
    },
  });
  await prisma.studentPresence.create({
    data: { studentId: student.id, status: overrides.presenceStatus ?? "OUTSIDE" },
  });
  return student;
}
