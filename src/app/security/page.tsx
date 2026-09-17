"use client";

import { useEffect, useState } from "react";
import { ScanLine, CheckCircle2, XCircle, Settings2, LogOut, Printer, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { QrScanner } from "@/components/scanner/QrScanner";
import { useRealtime } from "@/hooks/useRealtime";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/utils";

const DEVICE_STORAGE_KEY = "campusguard_device_config";

interface DeviceConfig {
  deviceIdentifier: string;
  deviceSecret: string;
}

interface VerifyResponse {
  success: true;
  verified: true;
  event: "ENTRY" | "EXIT";
  presence: "INSIDE" | "OUTSIDE";
  student: { id: string; name: string; enrollmentNo: string; department: string; photoUrl: string | null };
  timestamp: string;
  durationSeconds?: number;
  gate: { id: string; name: string };
  occupancy: { inside: number; outside: number };
}

interface ExitCodeResponse {
  success: true;
  exitCode: { id: string; gateId: string; gateName: string; active: boolean; createdAt: string };
  qr: { exitCodeId: string; gateId: string; sig: string };
}

interface ScanFeedEntry {
  id: string;
  kind: "ENTRY" | "EXIT" | "REJECTED";
  name: string;
  enrollmentNo?: string;
  detail?: string;
  timestamp: string;
  durationSeconds?: number;
}

function loadDeviceConfig(): DeviceConfig | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeviceConfig) : null;
  } catch {
    return null;
  }
}

function saveDeviceConfig(config: DeviceConfig) {
  try {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage unavailable (private browsing, etc.) — kiosk just re-prompts next load
  }
}

function KioskSetup({ onSaved }: { onSaved: (config: DeviceConfig) => void }) {
  const { toast } = useToast();
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [deviceSecret, setDeviceSecret] = useState("");
  const [saving, setSaving] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // Device credentials are only ever exercised at scan time (see
    // devices.service.ts:authenticateDevice) — there's no separate "verify"
    // endpoint, so we save optimistically and surface any problem on the
    // very next scan attempt instead of a redundant round trip here.
    const config = { deviceIdentifier, deviceSecret };
    saveDeviceConfig(config);
    onSaved(config);
    toast({ title: "Kiosk configured", description: "This device is ready to scan student QR codes.", variant: "success" });
    setSaving(false);
  }

  return (
    <Card className="mx-auto mt-16 w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Configure this kiosk
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deviceIdentifier">Device Identifier</Label>
            <Input id="deviceIdentifier" value={deviceIdentifier} onChange={(e) => setDeviceIdentifier(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deviceSecret">Device Secret</Label>
            <Input
              id="deviceSecret"
              type="password"
              value={deviceSecret}
              onChange={(e) => setDeviceSecret(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            An admin registers devices under Gates &amp; Devices and gives you these credentials once.
          </p>
          <Button type="submit" className="w-full" disabled={saving}>
            Save &amp; Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EntryScanCard({ device }: { device: DeviceConfig }) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [lastResult, setLastResult] = useState<VerifyResponse | { rejected: true; message: string } | null>(null);

  async function handleDecoded(raw: string) {
    setScanning(false);
    let qr: unknown;
    try {
      qr = JSON.parse(raw);
    } catch {
      setLastResult({ rejected: true, message: "That doesn't look like a CampusGuard student QR." });
      return;
    }

    setVerifying(true);
    try {
      const result = await apiFetch<VerifyResponse>("/api/security/scan", {
        method: "POST",
        body: JSON.stringify({ qr, deviceIdentifier: device.deviceIdentifier, deviceSecret: device.deviceSecret }),
      });
      setLastResult(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Verification failed. Please try again.";
      setLastResult({ rejected: true, message });
      toast({ title: "Scan rejected", description: message, variant: "error" });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5" /> Verify Entry
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Button size="xl" className="w-full" onClick={() => setScanning(true)} disabled={verifying}>
          {verifying ? "Verifying…" : "SCAN STUDENT QR"}
        </Button>

        {scanning && (
          <QrScanner onDecoded={handleDecoded} onClose={() => setScanning(false)} label="Scan student entry QR" />
        )}

        {lastResult && (
          <div
            className={`w-full rounded-lg border p-4 ${
              "rejected" in lastResult ? "border-destructive/30 bg-destructive/10" : "border-success/30 bg-success/10"
            }`}
          >
            {"rejected" in lastResult ? (
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Not verified</p>
                  <p className="text-sm text-muted-foreground">{lastResult.message}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
                <div className="flex-1">
                  <p className="font-semibold text-success">
                    Verified — ENTRY — now <span className="uppercase">{lastResult.presence}</span>
                  </p>
                  <p className="text-sm">
                    {lastResult.student.name} · {lastResult.student.enrollmentNo} · {lastResult.student.department}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastResult.gate.name} · {formatTime(lastResult.timestamp)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExitQrCard({ device }: { device: DeviceConfig }) {
  const { toast } = useToast();
  const [exitCode, setExitCode] = useState<ExitCodeResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadExitCode() {
    setLoading(true);
    try {
      const res = await apiFetch<ExitCodeResponse>("/api/security/exit-codes", {
        method: "POST",
        body: JSON.stringify({ deviceIdentifier: device.deviceIdentifier, deviceSecret: device.deviceSecret }),
      });
      setExitCode(res);
      const dataUrl = await QRCode.toDataURL(JSON.stringify(res.qr), { width: 360, margin: 1 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not load the exit QR.";
      toast({ title: "Exit QR failed", description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExitCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function regenerate() {
    setLoading(true);
    try {
      await apiFetch("/api/security/exit-codes/revoke", {
        method: "POST",
        body: JSON.stringify({ deviceIdentifier: device.deviceIdentifier, deviceSecret: device.deviceSecret }),
      });
      await loadExitCode();
      toast({ title: "Exit QR regenerated", description: "The old poster/screen will no longer work.", variant: "success" });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not regenerate the exit QR.";
      toast({ title: "Regeneration failed", description: message, variant: "error" });
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="h-5 w-5" /> Exit QR — {exitCode?.exitCode.gateName ?? "this gate"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <p className="text-center text-sm text-muted-foreground">
          Display this on a screen at the exit, or print it and post it on the wall. Students scan it with their own
          phone to mark themselves as leaving — it stays valid until you regenerate it.
        </p>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Permanent exit QR for this gate" className="rounded-lg border border-border" />
        ) : (
          <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "Not available."}</p>
        )}
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()} disabled={!qrDataUrl}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={regenerate} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface AccessLogEvent {
  id: string;
  eventType: "ENTRY" | "EXIT";
  timestamp: string;
  durationSeconds: number | null;
  student: { id: string; name: string; enrollmentNo: string; department: string };
  gate: { id: string; name: string };
}

function AccessLogCard() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [eventType, setEventType] = useState<"" | "ENTRY" | "EXIT">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AccessLogEvent[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounce the search box so we're not firing a request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any filter change should reset back to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, eventType]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (eventType) params.set("eventType", eventType);

    let cancelled = false;
    setLoading(true);
    apiFetch<{ success: true; items: AccessLogEvent[]; total: number; pageSize: number }>(
      `/api/presence/events?${params.toString()}`
    )
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        // transient — keep showing the last good page
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, eventType]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entry &amp; Exit Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by student name or enrollment no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="flex gap-2">
            {(["", "ENTRY", "EXIT"] as const).map((option) => (
              <Button
                key={option || "ALL"}
                type="button"
                size="sm"
                variant={eventType === option ? "default" : "outline"}
                onClick={() => setEventType(option)}
              >
                {option === "" ? "All" : option}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 pr-4">Enrollment</th>
                <th className="py-2 pr-4">Gate</th>
                <th className="py-2">Event</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((event) => (
                <tr key={event.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatTime(event.timestamp)}</td>
                  <td className="py-2 pr-4">{event.student.name}</td>
                  <td className="py-2 pr-4">{event.student.enrollmentNo}</td>
                  <td className="py-2 pr-4">{event.gate.name}</td>
                  <td className="py-2">
                    <Badge variant={event.eventType === "ENTRY" ? "success" : "secondary"}>{event.eventType}</Badge>
                    {event.durationSeconds != null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatDuration(event.durationSeconds)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    No matching entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span>
            {data ? `${data.total} total` : loading ? "Loading…" : ""} · Page {page} of {totalPages}
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
  );
}

function SecurityOfficerConsole({ device }: { device: DeviceConfig }) {
  const [occupancy, setOccupancy] = useState<{ inside: number; outside: number } | null>(null);
  const [feed, setFeed] = useState<ScanFeedEntry[]>([]);

  async function refreshOccupancy() {
    try {
      const res = await apiFetch<{ success: true; inside: number; outside: number }>("/api/presence");
      setOccupancy({ inside: res.inside, outside: res.outside });
    } catch {
      // transient — the KPI just won't update this tick
    }
  }

  useEffect(() => {
    refreshOccupancy();
    const interval = setInterval(refreshOccupancy, 10_000);
    return () => clearInterval(interval);
  }, []);

  useRealtime((msg) => {
    if (msg.type === "occupancy.updated") {
      setOccupancy(msg.payload as { inside: number; outside: number });
    }
    if (msg.type === "student.entered" || msg.type === "student.exited") {
      const payload = msg.payload as {
        studentId: string;
        name: string;
        enrollmentNo: string;
        timestamp: string;
        durationSeconds?: number;
      };
      setFeed((prev) =>
        [
          {
            id: `${payload.studentId}-${payload.timestamp}`,
            kind: msg.type === "student.entered" ? ("ENTRY" as const) : ("EXIT" as const),
            name: payload.name,
            enrollmentNo: payload.enrollmentNo,
            timestamp: payload.timestamp,
            durationSeconds: payload.durationSeconds,
          },
          ...prev,
        ].slice(0, 10)
      );
    }
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          <EntryScanCard device={device} />
          <ExitQrCard device={device} />
        </div>

        <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Current Occupancy</CardTitle>
          </CardHeader>
          <CardContent>
            {occupancy ? (
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="text-3xl font-bold text-success">{occupancy.inside}</p>
                  <p className="text-xs text-muted-foreground">Inside</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-muted-foreground">{occupancy.outside}</p>
                  <p className="text-xs text-muted-foreground">Outside</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {feed.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.enrollmentNo ?? entry.detail}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={entry.kind === "ENTRY" ? "success" : entry.kind === "EXIT" ? "secondary" : "destructive"}>
                        {entry.kind}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatTime(entry.timestamp)}
                        {entry.durationSeconds != null && ` · ${formatDuration(entry.durationSeconds)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      <AccessLogCard />
    </div>
  );
}

export default function SecurityOfficerPage() {
  const [device, setDevice] = useState<DeviceConfig | null | undefined>(undefined);

  useEffect(() => {
    setDevice(loadDeviceConfig());
  }, []);

  return (
    <RoleGuard allow={["SECURITY_OFFICER", "ADMIN", "SUPER_ADMIN"]}>
      {(user) => (
        <div className="min-h-screen">
          <AppHeader user={user} title="Security Console" />
          {device === undefined ? null : device ? (
            <SecurityOfficerConsole device={device} />
          ) : (
            <KioskSetup onSaved={setDevice} />
          )}
        </div>
      )}
    </RoleGuard>
  );
}
