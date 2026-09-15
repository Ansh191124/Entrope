"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { QrCode, RefreshCw, Ban, ScanLine, Download, X } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";
import { QrScanner } from "@/components/scanner/QrScanner";
import { useRealtime } from "@/hooks/useRealtime";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/utils";
import type { CurrentUser } from "@/hooks/useCurrentUser";

function InstallAppBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 shrink-0 text-primary" />
        <span>Install CampusGuard on this phone for one-tap access.</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={promptInstall}>
          Install
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface PresenceResponse {
  success: true;
  presence: { status: "OUTSIDE" | "INSIDE" | "SUSPENDED"; enteredAt?: string | null; lastGate?: { name: string } | null };
}

interface HistoryResponse {
  success: true;
  report: {
    events: Array<{ id: string; eventType: "ENTRY" | "EXIT"; timestamp: string; gate: { name: string }; durationSeconds: number | null }>;
  };
}

interface SessionResponse {
  success: true;
  session: { id: string; issuedAt: string; expiresAt: string; ttlSeconds: number; status: string };
  qr: { sessionId: string; nonce: string; expiresAt: string; sig: string };
}

interface SessionStatusResponse {
  success: true;
  session: { status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "REVOKED" };
}

interface VerifyExitResponse {
  success: true;
  verified: true;
  event: "EXIT";
  gate: { name: string };
  durationSeconds?: number;
}

function StudentDashboard({ user }: { user: CurrentUser & { student: NonNullable<CurrentUser["student"]> } }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [scanningExit, setScanningExit] = useState(false);
  const [verifyingExit, setVerifyingExit] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const presenceQuery = useQuery({
    queryKey: ["presence", "student", user.student.id],
    queryFn: () => apiFetch<PresenceResponse>(`/api/presence/student/${user.student.id}`).then((r) => r.presence),
    refetchInterval: 15_000,
  });

  const historyQuery = useQuery({
    queryKey: ["reports", "student", user.student.id],
    queryFn: () => apiFetch<HistoryResponse>(`/api/reports/student/${user.student.id}`).then((r) => r.report.events),
  });

  function clearQr() {
    setSession(null);
    setQrDataUrl(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }

  function refreshAfterVerification() {
    queryClient.invalidateQueries({ queryKey: ["presence", "student", user.student.id] });
    queryClient.invalidateQueries({ queryKey: ["reports", "student", user.student.id] });
  }

  useRealtime((msg) => {
    if (
      (msg.type === "student.entered" || msg.type === "student.exited") &&
      (msg.payload as { studentId?: string }).studentId === user.student.id
    ) {
      clearQr();
      toast({ title: "Verified", description: "Your status was just updated by a security officer.", variant: "success" });
      refreshAfterVerification();
    }
  });

  async function generateQr() {
    setGenerating(true);
    try {
      const res = await apiFetch<SessionResponse>("/api/security/sessions", { method: "POST" });
      setSession(res);
      const dataUrl = await QRCode.toDataURL(JSON.stringify(res.qr), { width: 320, margin: 1 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not generate a QR code.";
      toast({ title: "QR generation failed", description: message, variant: "error" });
    } finally {
      setGenerating(false);
    }
  }

  async function revokeQr() {
    if (!session) return;
    try {
      await apiFetch(`/api/security/sessions/${session.session.id}/revoke`, { method: "POST" });
      clearQr();
      toast({ title: "QR cancelled", variant: "info" });
    } catch {
      toast({ title: "Could not cancel QR", variant: "error" });
    }
  }

  async function handleExitDecoded(raw: string) {
    setScanningExit(false);
    let qr: unknown;
    try {
      qr = JSON.parse(raw);
    } catch {
      toast({ title: "Invalid QR code", description: "That doesn't look like a CampusGuard exit QR.", variant: "error" });
      return;
    }

    setVerifyingExit(true);
    try {
      const result = await apiFetch<VerifyExitResponse>("/api/security/exit", {
        method: "POST",
        body: JSON.stringify({ qr }),
      });
      toast({
        title: "Exit recorded",
        description: `${result.gate.name}${result.durationSeconds != null ? ` · Stayed ${formatDuration(result.durationSeconds)}` : ""}`,
        variant: "success",
      });
      refreshAfterVerification();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not record your exit. Please try again.";
      toast({ title: "Exit not recorded", description: message, variant: "error" });
    } finally {
      setVerifyingExit(false);
    }
  }

  // Countdown + a fallback poll of the session's own status, in case the
  // realtime broadcast is missed — this is what notices "an officer already
  // scanned this" even without a live WebSocket connection.
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (!session) return;

    function tick() {
      const remaining = Math.max(0, Math.round((new Date(session!.session.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) clearQr();
    }
    tick();
    countdownRef.current = setInterval(tick, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<SessionStatusResponse>(`/api/security/sessions/${session.session.id}`);
        if (res.session.status === "CONSUMED") {
          clearQr();
          toast({ title: "Verified", description: "A security officer just scanned your QR.", variant: "success" });
          refreshAfterVerification();
        } else if (res.session.status !== "ACTIVE") {
          clearQr();
        }
      } catch {
        // transient — next poll or the countdown will resolve this
      }
    }, 2000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const presence = presenceQuery.data;
  const isInside = presence?.status === "INSIDE";
  const isSuspended = presence?.status === "SUSPENDED";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <InstallAppBanner />

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isInside ? "bg-success" : "bg-muted-foreground"}`} />
            <span className="text-lg font-semibold">{presence?.status ?? "…"}</span>
            {isSuspended && <Badge variant="destructive">Access suspended</Badge>}
          </div>
          {presence?.enteredAt && (
            <p className="text-sm text-muted-foreground">
              Entered at {formatTime(presence.enteredAt)} via {presence.lastGate?.name ?? "unknown gate"}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {user.student.enrollmentNo} · {user.student.department}
          </p>
        </CardContent>
      </Card>

      {!isSuspended && !isInside && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Entry QR
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {qrDataUrl && session ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Show this to a security officer to enter" className="rounded-lg border border-border" />
                <p className="text-lg font-semibold">{secondsLeft > 0 ? `Expires in ${secondsLeft}s` : "Expired"}</p>
                <p className="text-center text-sm text-muted-foreground">
                  Show this to the security officer at the gate. It disappears automatically once scanned.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={generateQr} disabled={generating}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
                  </Button>
                  <Button variant="destructive" onClick={revokeQr}>
                    <Ban className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button size="xl" className="w-full" onClick={generateQr} disabled={generating}>
                {generating ? "Generating…" : "GENERATE ENTRY QR"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!isSuspended && isInside && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5" /> Leaving?
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-center text-sm text-muted-foreground">
              Scan the exit QR posted at the gate to mark yourself as leaving.
            </p>
            <Button size="xl" className="w-full" onClick={() => setScanningExit(true)} disabled={verifyingExit}>
              {verifyingExit ? "Verifying…" : "SCAN TO EXIT"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {!historyQuery.data || historyQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries or exits recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {historyQuery.data.map((event) => (
                <li key={event.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium">{event.eventType}</p>
                    <p className="text-xs text-muted-foreground">{event.gate.name}</p>
                  </div>
                  <div className="text-right">
                    <p>{formatTime(event.timestamp)}</p>
                    {event.durationSeconds != null && (
                      <p className="text-xs text-muted-foreground">{formatDuration(event.durationSeconds)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {scanningExit && <QrScanner onDecoded={handleExitDecoded} onClose={() => setScanningExit(false)} label="Scan exit QR" />}
    </div>
  );
}

export default function StudentPage() {
  return (
    <RoleGuard allow={["STUDENT"]}>
      {(user) =>
        user.student ? (
          <div className="min-h-screen">
            <AppHeader user={user} title="My Status" />
            <StudentDashboard user={{ ...user, student: user.student }} />
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            No student profile is linked to this account. Contact an administrator.
          </div>
        )
      }
    </RoleGuard>
  );
}
