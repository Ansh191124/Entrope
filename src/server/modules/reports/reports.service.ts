import Papa from "papaparse";
import { prisma } from "@/server/lib/prisma";
import { AppError } from "@/server/lib/errors";
import { getOverview, getGateActivity, getDepartmentActivity } from "@/server/modules/analytics/analytics.service";

export async function getDailyReport() {
  const [overview, gateActivity, departmentActivity] = await Promise.all([
    getOverview(),
    getGateActivity(),
    getDepartmentActivity(),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const exitEventsToday = await prisma.accessEvent.findMany({
    where: { eventType: "EXIT", timestamp: { gte: todayStart }, durationSeconds: { not: null } },
    select: { durationSeconds: true },
  });
  const avgStaySeconds =
    exitEventsToday.length > 0
      ? Math.round(exitEventsToday.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0) / exitEventsToday.length)
      : 0;

  return {
    date: todayStart.toISOString().slice(0, 10),
    totalStudents: overview.totalActive,
    totalEntries: overview.entriesToday,
    totalExits: overview.exitsToday,
    peakOccupancy: overview.peakOccupancyToday,
    peakOccupancyAt: overview.peakOccupancyAt,
    averageStaySeconds: avgStaySeconds,
    gateActivity,
    departmentActivity,
    isPartialDay: true,
  };
}

export function dailyReportToCsv(report: Awaited<ReturnType<typeof getDailyReport>>): string {
  const summaryRows = [
    { metric: "Date", value: report.date },
    { metric: "Total active students", value: report.totalStudents },
    { metric: "Total entries today", value: report.totalEntries },
    { metric: "Total exits today", value: report.totalExits },
    { metric: "Peak occupancy today", value: report.peakOccupancy },
    { metric: "Average stay (seconds)", value: report.averageStaySeconds },
  ];
  const summaryCsv = Papa.unparse(summaryRows);
  const gateCsv = Papa.unparse(report.gateActivity);
  return `${summaryCsv}\n\nGate Activity\n${gateCsv}`;
}

export async function getStudentReport(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new AppError("STUDENT_NOT_FOUND", "Student not found.");

  const events = await prisma.accessEvent.findMany({
    where: { studentId },
    orderBy: { timestamp: "desc" },
    include: { gate: { select: { name: true } } },
  });

  return { student, events };
}

export function studentReportToCsv(report: Awaited<ReturnType<typeof getStudentReport>>): string {
  const rows = report.events.map((e) => ({
    date: e.timestamp.toISOString().slice(0, 10),
    time: e.timestamp.toISOString().slice(11, 19),
    event: e.eventType,
    gate: e.gate.name,
    durationSeconds: e.durationSeconds ?? "",
  }));
  return Papa.unparse(rows);
}

export async function getOccupancyReport() {
  return getOverview();
}
