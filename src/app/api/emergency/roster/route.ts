import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { recordAudit } from "@/server/modules/audit/audit.service";
import { getOccupancySummary, listStudentsInside } from "@/server/modules/presence/presence.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

// Emergency Mode: the authoritative "who is inside right now" roster, restricted
// to SUPER_ADMIN/ADMIN/SECURITY_OFFICER (§27). Every access is audited since this
// is sensitive personal-safety data.
export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN", "SECURITY_OFFICER");
  const [summary, inside] = await Promise.all([getOccupancySummary(), listStudentsInside()]);

  await recordAudit({
    actorUserId: session.sub,
    action: "EMERGENCY_ROSTER_ACCESSED",
    entityType: "System",
  });

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const csv = Papa.unparse(
      inside.map((p) => ({
        enrollmentNo: p.student.enrollmentNo,
        name: p.student.name,
        department: p.student.department,
        enteredAt: p.enteredAt?.toISOString() ?? "",
        gate: p.lastGate?.name ?? "",
      }))
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="emergency-roster-${new Date().toISOString().slice(0, 19)}.csv"`,
      },
    });
  }

  return NextResponse.json({ success: true, summary, students: inside });
});
