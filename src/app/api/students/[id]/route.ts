import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { updateStudentSchema } from "@/validations/student";
import { deactivateStudent, getStudent, updateStudent } from "@/server/modules/students/students.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const student = await getStudent(params.id);
  return NextResponse.json({ success: true, student });
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const body = updateStudentSchema.parse(await req.json());
  const student = await updateStudent(params.id, body, session.sub);
  return NextResponse.json({ success: true, student });
});

// Students are never hard-deleted (their access history must stay intact) —
// DELETE performs a soft deactivation. Only SUPER_ADMIN may do this (§6/§22).
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN");
  await deactivateStudent(params.id, session.sub);
  return NextResponse.json({ success: true });
});
