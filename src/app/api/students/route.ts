import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { createStudentSchema, listStudentsQuerySchema } from "@/validations/student";
import { createStudent, listStudents } from "@/server/modules/students/students.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  void session;
  const query = listStudentsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const result = await listStudents(query);
  return NextResponse.json({ success: true, ...result });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const body = createStudentSchema.parse(await req.json());
  const { student, generatedPassword } = await createStudent(body, session.sub);
  return NextResponse.json({ success: true, student, generatedPassword }, { status: 201 });
});
