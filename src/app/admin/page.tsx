"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Kpi } from "@/components/layout/Kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { useRealtime } from "@/hooks/useRealtime";

interface OverviewResponse {
  success: true;
  overview: {
    inside: number;
    outside: number;
    totalActive: number;
    entriesToday: number;
    exitsToday: number;
    peakOccupancyToday: number;
    openAlerts: number;
    isPartialDay: boolean;
  };
}

interface HourlyResponse {
  success: true;
  hourly: Array<{ hour: number; entries: number; exits: number }>;
}

interface InsideResponse {
  success: true;
  students: Array<{
    studentId: string;
    enteredAt: string | null;
    student: { name: string; enrollmentNo: string; department: string };
    lastGate: { name: string } | null;
  }>;
}

interface GatesResponse {
  success: true;
  gates: Array<{ id: string; name: string; active: boolean; devices: Array<{ id: string; name: string; active: boolean; lastSeenAt: string | null }> }>;
}

export default function AdminOverviewPage() {
  const queryClient = useQueryClient();
  useRealtime();

  const overview = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => apiFetch<OverviewResponse>("/api/analytics/overview").then((r) => r.overview),
    refetchInterval: 15_000,
  });
  const hourly = useQuery({
    queryKey: ["analytics", "occupancy"],
    queryFn: () => apiFetch<HourlyResponse>("/api/analytics/occupancy").then((r) => r.hourly),
    refetchInterval: 30_000,
  });
  const inside = useQuery({
    queryKey: ["presence", "inside"],
    queryFn: () => apiFetch<InsideResponse>("/api/presence/inside").then((r) => r.students),
    refetchInterval: 15_000,
  });
  const gates = useQuery({
    queryKey: ["gates"],
    queryFn: () => apiFetch<GatesResponse>("/api/gates").then((r) => r.gates),
    refetchInterval: 30_000,
  });

  void queryClient;
  const o = overview.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        {o?.isPartialDay && (
          <p className="text-xs text-muted-foreground">
            Today&apos;s totals are partial — they cover activity so far today, not a full day.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Currently Inside" value={o?.inside ?? "…"} tone="success" />
        <Kpi label="Currently Outside" value={o?.outside ?? "…"} />
        <Kpi label="Total Students" value={o?.totalActive ?? "…"} />
        <Kpi label="Entries Today" value={o?.entriesToday ?? "…"} />
        <Kpi label="Exits Today" value={o?.exitsToday ?? "…"} />
        <Kpi label="Peak Occupancy" value={o?.peakOccupancyToday ?? "…"} tone={o && o.openAlerts > 0 ? "warning" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Entries &amp; Exits by Hour (Today)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip labelFormatter={(h) => `${h}:00`} />
                <Bar dataKey="entries" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exits" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gate Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {gates.data?.map((gate) => (
                <li key={gate.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{gate.name}</p>
                    <p className="text-xs text-muted-foreground">{gate.devices.length} device(s)</p>
                  </div>
                  <Badge variant={gate.active ? "success" : "destructive"}>{gate.active ? "Active" : "Disabled"}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Students Currently Inside ({inside.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!inside.data || inside.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is currently inside.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Enrollment</th>
                    <th className="py-2 pr-4">Department</th>
                    <th className="py-2 pr-4">Gate</th>
                    <th className="py-2">Entered</th>
                  </tr>
                </thead>
                <tbody>
                  {inside.data.map((p) => (
                    <tr key={p.studentId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4">{p.student.name}</td>
                      <td className="py-2 pr-4">{p.student.enrollmentNo}</td>
                      <td className="py-2 pr-4">{p.student.department}</td>
                      <td className="py-2 pr-4">{p.lastGate?.name ?? "—"}</td>
                      <td className="py-2">{p.enteredAt ? formatTime(p.enteredAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
