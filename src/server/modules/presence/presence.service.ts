import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";

export async function getOccupancySummary() {
  const [inside, totalActive] = await Promise.all([
    prisma.studentPresence.count({ where: { status: "INSIDE" } }),
    prisma.student.count({ where: { active: true } }),
  ]);
  return {
    inside,
    outside: Math.max(totalActive - inside, 0),
    totalActive,
  };
}

export async function listStudentsInside() {
  return prisma.studentPresence.findMany({
    where: { status: "INSIDE" },
    orderBy: { enteredAt: "asc" },
    include: {
      student: {
        select: { id: true, enrollmentNo: true, name: true, department: true, course: true, photoUrl: true },
      },
      lastGate: { select: { id: true, name: true } },
    },
  });
}

export async function getStudentPresence(studentId: string) {
  const presence = await prisma.studentPresence.findUnique({
    where: { studentId },
    include: { lastGate: { select: { name: true } } },
  });
  if (!presence) {
    // No row yet means the student has never scanned — authoritative default is OUTSIDE.
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new AppError("STUDENT_NOT_FOUND", "Student not found.");
    return { studentId, status: "OUTSIDE" as const, enteredAt: null, lastGate: null };
  }
  return presence;
}

export async function getStudentHistory(studentId: string, page: number, pageSize: number) {
  const [total, items] = await Promise.all([
    prisma.accessEvent.count({ where: { studentId } }),
    prisma.accessEvent.findMany({
      where: { studentId },
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { gate: { select: { name: true } }, device: { select: { name: true } } },
    }),
  ]);
  return { total, page, pageSize, items };
}
