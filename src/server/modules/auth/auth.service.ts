import bcrypt from "bcryptjs";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { signSessionToken } from "@/server/lib/jwt";
import { logger } from "@/server/lib/logger";
import { recordAudit } from "@/server/modules/audit/audit.service";
import type { LoginInput } from "@/validations/auth";

export async function login(input: LoginInput, ip: string) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { student: true },
  });

  // Constant-shape response whether the email exists or not, to avoid
  // leaking which emails are registered.
  const passwordHash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali";
  const valid = await bcrypt.compare(input.password, passwordHash);

  if (!user || !valid) {
    logger.warn("LOGIN_FAILED", { email: input.email, ip });
    throw new AppError("UNAUTHENTICATED", "Invalid email or password.");
  }

  if (!user.active) {
    logger.warn("LOGIN_INACTIVE_ACCOUNT", { userId: user.id, ip });
    throw new AppError("FORBIDDEN", "This account has been disabled. Contact an administrator.");
  }

  const token = signSessionToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    studentId: user.student?.id,
  });

  logger.info("LOGIN_SUCCESS", { userId: user.id, role: user.role, ip });
  await recordAudit({
    actorUserId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: ip,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.student?.id ?? null,
    },
  };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { student: { include: { presence: true } } },
  });
  if (!user) throw new AppError("NOT_FOUND", "User not found.");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    student: user.student
      ? {
          id: user.student.id,
          enrollmentNo: user.student.enrollmentNo,
          department: user.student.department,
          presence: user.student.presence?.status ?? "OUTSIDE",
        }
      : null,
  };
}
