import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { AppError } from "@/server/lib/errors";
import { getStudentReport, studentReportToCsv } from "@/server/modules/reports/reports.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const STAFF_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER"]);

export const GET = withErrorHandling(async (req: NextRequest, { params }: Params) => {
  const session = await requireSession(req);
  const isSelf = session.role === "STUDENT" && session.studentId === params.id;
  if (!isSelf && !STAFF_ROLES.has(session.role)) {
    throw new AppError("FORBIDDEN", "You may only view your own report.");
  }

  const report = await getStudentReport(params.id);

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const csv = studentReportToCsv(report);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="student-${report.student.enrollmentNo}-report.csv"`,
      },
    });
  }

  return NextResponse.json({ success: true, report });
});
