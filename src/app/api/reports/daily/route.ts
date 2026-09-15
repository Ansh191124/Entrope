import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { dailyReportToCsv, getDailyReport } from "@/server/modules/reports/reports.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: NextRequest) => {
  await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const report = await getDailyReport();

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const csv = dailyReportToCsv(report);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="daily-report-${report.date}.csv"`,
      },
    });
  }

  return NextResponse.json({ success: true, report });
});
