import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import type { Prisma } from "@prisma/client";

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

export interface ListAccessEventsParams {
  page: number;
  pageSize: number;
  search?: string;
  eventType?: "ENTRY" | "EXIT";
  gateId?: string;
}

/**
 * Full entry/exit log across every student, for staff kiosks/dashboards —
 * distinct from a single student's own history (getStudentHistory) and from
 * the admin-only audit trail (which never exposes ENTRY/EXIT events to
 * SECURITY_OFFICER). Search matches student name or enrollment number.
 */
export async function listAccessEvents(params: ListAccessEventsParams) {
  const search = params.search?.trim();
  const where: Prisma.AccessEventWhereInput = {
    ...(params.eventType ? { eventType: params.eventType } : {}),
    ...(params.gateId ? { gateId: params.gateId } : {}),
    ...(search
      ? {
          student: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { enrollmentNo: { contains: search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.accessEvent.count({ where }),
    prisma.accessEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        student: { select: { id: true, name: true, enrollmentNo: true, department: true } },
        gate: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { total, page: params.page, pageSize: params.pageSize, items };
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
