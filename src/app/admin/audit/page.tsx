"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/utils";

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  timestamp: string;
  ipAddress: string | null;
  actor: { name: string; email: string; role: string } | null;
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: () =>
      apiFetch<{ success: true; items: AuditLog[]; total: number; pageSize: number }>(
        `/api/audit-logs?page=${page}&pageSize=25`
      ),
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <p className="text-sm text-muted-foreground">
        Append-only record of every security-relevant action. Nothing here can be edited or deleted.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>
            Entries ({query.data?.total ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatTime(log.timestamp)}</td>
                    <td className="py-2 pr-4">{log.action}</td>
                    <td className="py-2 pr-4">
                      {log.entityType}
                      {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td className="py-2 pr-4">{log.actor?.name ?? "System"}</td>
                    <td className="py-2">{log.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
