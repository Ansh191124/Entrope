import bcrypt from "bcryptjs";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { generateSecret } from "@/server/lib/crypto";
import { recordAudit } from "@/server/modules/audit/audit.service";
import type { CreateStudentInput, UpdateStudentInput } from "@/validations/student";
import type { Prisma } from "@prisma/client";

export interface ListStudentsParams {
  q?: string;
  department?: string;
  active?: "true" | "false";
  page: number;
  pageSize: number;
}

export async function listStudents(params: ListStudentsParams) {
  const where: Prisma.StudentWhereInput = {
    ...(params.department ? { department: params.department } : {}),
    ...(params.active ? { active: params.active === "true" } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { enrollmentNo: { contains: params.q, mode: "insensitive" } },
            { email: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { presence: { select: { status: true } } },
    }),
  ]);

  return { total, page: params.page, pageSize: params.pageSize, items };
}

export async function getStudent(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { presence: true },
  });
  if (!student) throw new AppError("STUDENT_NOT_FOUND", "Student not found.");
  return student;
}

/**
 * Creates a User (role=STUDENT) + Student + an initial OUTSIDE presence row,
 * atomically. Returns the generated password only when one wasn't supplied,
 * so the admin can hand it to the student out-of-band exactly once.
 */
export async function createStudent(input: CreateStudentInput, actorUserId: string) {
  const [emailTaken, enrollmentTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email.toLowerCase() } }),
    prisma.student.findUnique({ where: { enrollmentNo: input.enrollmentNo } }),
  ]);
  if (emailTaken) throw new AppError("CONFLICT", "A user with this email already exists.");
  if (enrollmentTaken) throw new AppError("CONFLICT", "A student with this enrollment number already exists.");

  const generatedPassword = input.password ?? generateSecret(9);
  const passwordHash = await bcrypt.hash(generatedPassword, 12);

  const student = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        role: "STUDENT",
      },
    });
    const created = await tx.student.create({
      data: {
        userId: user.id,
        enrollmentNo: input.enrollmentNo,
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        department: input.department,
        course: input.course,
        year: input.year,
        semester: input.semester,
        section: input.section,
        photoUrl: input.photoUrl,
      },
    });
    await tx.studentPresence.create({ data: { studentId: created.id, status: "OUTSIDE" } });
    return created;
  });

  await recordAudit({
    actorUserId,
    action: "STUDENT_CREATED",
    entityType: "Student",
    entityId: student.id,
    metadata: { enrollmentNo: student.enrollmentNo },
  });

  return { student, generatedPassword: input.password ? undefined : generatedPassword };
}

export async function updateStudent(studentId: string, input: UpdateStudentInput, actorUserId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new AppError("STUDENT_NOT_FOUND", "Student not found.");

  if (input.enrollmentNo && input.enrollmentNo !== student.enrollmentNo) {
    const clash = await prisma.student.findUnique({ where: { enrollmentNo: input.enrollmentNo } });
    if (clash) throw new AppError("CONFLICT", "A student with this enrollment number already exists.");
  }

  const { password: _password, ...studentFields } = input;
  const updated = await prisma.student.update({ where: { id: studentId }, data: studentFields });

  await recordAudit({
    actorUserId,
    action: "STUDENT_UPDATED",
    entityType: "Student",
    entityId: studentId,
    metadata: studentFields,
  });

  return updated;
}

/** Soft-disable only — students are never hard-deleted so their access history stays intact. */
export async function deactivateStudent(studentId: string, actorUserId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new AppError("STUDENT_NOT_FOUND", "Student not found.");

  await prisma.$transaction([
    prisma.student.update({ where: { id: studentId }, data: { active: false } }),
    prisma.user.update({ where: { id: student.userId }, data: { active: false } }),
  ]);

  await recordAudit({ actorUserId, action: "STUDENT_DEACTIVATED", entityType: "Student", entityId: studentId });
}
