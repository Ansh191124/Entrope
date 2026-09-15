import { NextRequest, NextResponse } from "next/server";
import { requireSessionWithRole } from "@/server/middleware/auth";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { AppError } from "@/server/lib/errors";
import { importStudentsFromCsv } from "@/server/modules/students/csvImport.service";

// Every route here depends on the session cookie / DB state — never statically cached.
export const dynamic = "force-dynamic";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSessionWithRole(req, "SUPER_ADMIN", "ADMIN");
  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    throw new AppError("VALIDATION_ERROR", "A CSV file is required (form field 'file').");
  }
  const csvText = await file.text();
  const summary = await importStudentsFromCsv(csvText, session.sub);
  return NextResponse.json({ success: true, summary });
});
