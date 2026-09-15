"use client";

import { useQuery } from "@tanstack/react-query";
import { Siren, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/utils";

interface RosterResponse {
  success: true;
  summary: { inside: number; outside: number; totalActive: number };
  students: Array<{
    studentId: string;
    enteredAt: string | null;
    student: { name: string; enrollmentNo: string; department: string };
    lastGate: { name: string } | null;
  }>;
}

export default function EmergencyModePage() {
  const query = useQuery({
    queryKey: ["emergency", "roster"],
    queryFn: () => apiFetch<RosterResponse>("/api/emergency/roster"),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-destructive">
          <Siren className="h-5 w-5" /> Emergency Occupancy
        </h1>
        <Button variant="outline" asChild>
          <a href="/api/emergency/roster?format=csv">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Currently Inside</p>
            <p className="text-3xl font-bold text-destructive">{query.data?.summary.inside ?? "…"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Currently Outside</p>
            <p className="text-3xl font-bold">{query.data?.summary.outside ?? "…"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Total Students</p>
            <p className="text-3xl font-bold">{query.data?.summary.totalActive ?? "…"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roster of Students Currently Inside</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Enrollment</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Entry Time</th>
                  <th className="py-2">Gate</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.students.map((p) => (
                  <tr key={p.studentId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4">{p.student.enrollmentNo}</td>
                    <td className="py-2 pr-4">{p.student.name}</td>
                    <td className="py-2 pr-4">{p.student.department}</td>
                    <td className="py-2 pr-4">{p.enteredAt ? formatTime(p.enteredAt) : "—"}</td>
                    <td className="py-2">{p.lastGate?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
