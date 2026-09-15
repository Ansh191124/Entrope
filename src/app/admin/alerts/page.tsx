"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRealtime } from "@/hooks/useRealtime";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/utils";

interface Alert {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
  message: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  createdAt: string;
  student?: { name: string; enrollmentNo: string } | null;
  gate?: { name: string } | null;
}

const SEVERITY_VARIANT: Record<Alert["severity"], "secondary" | "warning" | "destructive"> = {
  INFO: "secondary",
  WARNING: "warning",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

export default function AdminAlertsPage() {
  useRealtime();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiFetch<{ success: true; alerts: Alert[] }>("/api/alerts").then((r) => r.alerts),
    refetchInterval: 20_000,
  });

  async function resolve(id: string) {
    await apiFetch(`/api/alerts/${id}/resolve`, { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["alerts"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Security Alerts</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {query.data?.filter((a) => a.status === "OPEN").length ?? 0} open
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!query.data || query.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {query.data.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[alert.severity]}>{alert.severity}</Badge>
                      <span className="font-medium">{alert.type.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-1 truncate text-muted-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(alert.createdAt)}</p>
                  </div>
                  {alert.status === "OPEN" ? (
                    <Button size="sm" variant="outline" onClick={() => resolve(alert.id)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolve
                    </Button>
                  ) : (
                    <Badge variant="outline">{alert.status}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
