import Papa from "papaparse";
import { csvStudentRowSchema } from "@/validations/student";
import { createStudent } from "@/server/modules/students/students.service";
import { prisma } from "@/server/lib/prisma";
import { logger } from "@/server/lib/logger";

export interface CsvImportRowResult {
  row: number;
  enrollmentNo?: string;
  status: "imported" | "rejected";
  errors?: string[];
}

export interface CsvImportSummary {
  totalRows: number;
  imported: number;
  rejected: number;
  results: CsvImportRowResult[];
}

/**
 * Validates every row up front and reports every problem found — duplicate
 * enrollment numbers (within the file, and against the database), missing
 * required fields, invalid emails/departments, malformed numeric fields.
 * Nothing is imported silently: a row with any error is rejected, not
 * coerced into a guess.
 */
export async function importStudentsFromCsv(csvText: string, actorUserId: string): Promise<CsvImportSummary> {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const results: CsvImportRowResult[] = [];
  const seenEnrollments = new Set<string>();

  const existingEnrollments = new Set(
    (await prisma.student.findMany({ select: { enrollmentNo: true } })).map((s) => s.enrollmentNo)
  );

  for (let i = 0; i < parsed.data.length; i++) {
    const rowNumber = i + 2; // account for the header row, 1-indexed for humans
    const raw = parsed.data[i]!;
    const errors: string[] = [];

    const parsedRow = csvStudentRowSchema.safeParse(raw);
    if (!parsedRow.success) {
      for (const issue of parsedRow.error.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
      results.push({ row: rowNumber, enrollmentNo: raw.enrollmentNo, status: "rejected", errors });
      continue;
    }

    const data = parsedRow.data;

    if (existingEnrollments.has(data.enrollmentNo)) {
      errors.push(`duplicate enrollment number (already exists in database): ${data.enrollmentNo}`);
    }
    if (seenEnrollments.has(data.enrollmentNo)) {
      errors.push(`duplicate enrollment number (repeated within this file): ${data.enrollmentNo}`);
    }

    if (errors.length > 0) {
      results.push({ row: rowNumber, enrollmentNo: data.enrollmentNo, status: "rejected", errors });
      continue;
    }

    seenEnrollments.add(data.enrollmentNo);

    try {
      await createStudent(
        {
          enrollmentNo: data.enrollmentNo,
          name: data.name,
          email: data.email,
          phone: data.phone,
          department: data.department,
          course: data.course,
          year: data.year,
          semester: data.semester,
          section: data.section,
        },
        actorUserId
      );
      existingEnrollments.add(data.enrollmentNo);
      results.push({ row: rowNumber, enrollmentNo: data.enrollmentNo, status: "imported" });
    } catch (err) {
      logger.error("CSV_IMPORT_ROW_FAILED", { row: rowNumber, error: (err as Error).message });
      results.push({
        row: rowNumber,
        enrollmentNo: data.enrollmentNo,
        status: "rejected",
        errors: [(err as Error).message ?? "Failed to create student"],
      });
    }
  }

  return {
    totalRows: parsed.data.length,
    imported: results.filter((r) => r.status === "imported").length,
    rejected: results.filter((r) => r.status === "rejected").length,
    results,
  };
}
