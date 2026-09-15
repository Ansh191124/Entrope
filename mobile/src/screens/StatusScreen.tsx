import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useAuth, ApiError } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { QrScannerModal } from "../components/QrScannerModal";
import { colors, spacing, radius } from "../theme";

type PresenceStatus = "OUTSIDE" | "INSIDE" | "SUSPENDED";

interface PresenceResponse {
  success: true;
  presence: { status: PresenceStatus; enteredAt?: string | null; lastGate?: { name: string } | null };
}

interface HistoryEvent {
  id: string;
  eventType: "ENTRY" | "EXIT";
  timestamp: string;
  gate: { name: string };
  durationSeconds: number | null;
}

interface HistoryResponse {
  success: true;
  report: { events: HistoryEvent[] };
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function StatusScreen() {
  const { user, logout } = useAuth();
  const studentId = user?.student?.id;

  const [presence, setPresence] = useState<PresenceResponse["presence"] | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [generating, setGenerating] = useState(false);

  const [scanningExit, setScanningExit] = useState(false);
  const [verifyingExit, setVerifyingExit] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPresence = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await apiFetch<PresenceResponse>(`/api/presence/student/${studentId}`);
      setPresence(res.presence);
    } catch {
      // transient — the next poll or manual refresh will retry
    }
  }, [studentId]);

  const loadHistory = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await apiFetch<HistoryResponse>(`/api/reports/student/${studentId}`);
      setHistory(res.report.events);
    } catch {
      // transient
    }
  }, [studentId]);

  useEffect(() => {
    loadPresence();
    loadHistory();
    const interval = setInterval(loadPresence, 15_000);
    return () => clearInterval(interval);
  }, [loadPresence, loadHistory]);

  function clearQr() {
    setSession(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }

  async function onVerified() {
    clearQr();
    await Promise.all([loadPresence(), loadHistory()]);
  }

  async function handleGenerateQr() {
    setGenerating(true);
    try {
      const res = await apiFetch<SessionResponse>("/api/security/sessions", { method: "POST" });
      setSession(res);
    } catch (err) {
      Alert.alert("Could not generate QR", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCancelQr() {
    if (!session) return;
    try {
      await apiFetch(`/api/security/sessions/${session.session.id}/revoke`, { method: "POST" });
    } catch {
      // fine either way — clearing locally still stops it from being shown/used
    }
    clearQr();
  }

  // Countdown + a 2s fallback poll of the session's own status, mirroring
  // the web app — this is what notices "an officer already scanned this."
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
          await onVerified();
        } else if (res.session.status !== "ACTIVE") {
          clearQr();
        }
      } catch {
        // transient
      }
    }, 2000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleExitDecoded(raw: string) {
    setScanningExit(false);
    let qr: unknown;
    try {
      qr = JSON.parse(raw);
    } catch {
      Alert.alert("Invalid QR code", "That doesn't look like a CampusGuard exit QR.");
      return;
    }

    setVerifyingExit(true);
    try {
      const result = await apiFetch<VerifyExitResponse>("/api/security/exit", {
        method: "POST",
        body: JSON.stringify({ qr }),
      });
      Alert.alert(
        "Exit recorded",
        `${result.gate.name}${result.durationSeconds != null ? ` · Stayed ${formatDuration(result.durationSeconds)}` : ""}`
      );
      await Promise.all([loadPresence(), loadHistory()]);
    } catch (err) {
      Alert.alert("Exit not recorded", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setVerifyingExit(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadPresence(), loadHistory()]);
    setRefreshing(false);
  }

  function handleLogout() {
    Alert.alert("Sign out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: logout },
    ]);
  }

  const isInside = presence?.status === "INSIDE";
  const isSuspended = presence?.status === "SUSPENDED";

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CampusGuard</Text>
        <TouchableOpacity onPress={handleLogout} hitSlop={12}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, isInside ? styles.dotInside : styles.dotOutside]} />
          <Text style={styles.statusText}>{presence?.status ?? "…"}</Text>
          {isSuspended && (
            <View style={styles.suspendedBadge}>
              <Text style={styles.suspendedText}>Access suspended</Text>
            </View>
          )}
        </View>
        {presence?.enteredAt && (
          <Text style={styles.muted}>
            Entered at {formatTime(presence.enteredAt)} via {presence.lastGate?.name ?? "unknown gate"}
          </Text>
        )}
        <Text style={styles.muted}>
          {user?.student?.enrollmentNo} · {user?.student?.department}
        </Text>
      </View>

      {!isSuspended && !isInside && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entry QR</Text>
          {session ? (
            <View style={styles.qrWrap}>
              <QRCode value={JSON.stringify(session.qr)} size={220} />
              <Text style={styles.expiry}>{secondsLeft > 0 ? `Expires in ${secondsLeft}s` : "Expired"}</Text>
              <Text style={styles.muted}>Show this to the security officer at the gate.</Text>
              <View style={styles.row}>
                <TouchableOpacity style={styles.secondaryButton} onPress={handleGenerateQr} disabled={generating}>
                  <Text style={styles.secondaryButtonText}>Regenerate</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.destructiveButton} onPress={handleCancelQr}>
                  <Text style={styles.destructiveButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.primaryButtonLarge} onPress={handleGenerateQr} disabled={generating}>
              {generating ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>GENERATE ENTRY QR</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {!isSuspended && isInside && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Leaving?</Text>
          <Text style={[styles.muted, styles.centerText]}>
            Scan the exit QR posted at the gate to mark yourself as leaving.
          </Text>
          <TouchableOpacity
            style={styles.primaryButtonLarge}
            onPress={() => setScanningExit(true)}
            disabled={verifyingExit}
          >
            {verifyingExit ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>SCAN TO EXIT</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>History</Text>
        {history.length === 0 ? (
          <Text style={styles.muted}>No entries or exits recorded yet.</Text>
        ) : (
          history.map((event) => (
            <View key={event.id} style={styles.historyRow}>
              <View>
                <Text style={styles.historyType}>{event.eventType}</Text>
                <Text style={styles.muted}>{event.gate.name}</Text>
              </View>
              <View style={styles.historyRight}>
                <Text style={styles.historyTime}>{formatTime(event.timestamp)}</Text>
                {event.durationSeconds != null && <Text style={styles.muted}>{formatDuration(event.durationSeconds)}</Text>}
              </View>
            </View>
          ))
        )}
      </View>

      <QrScannerModal
        visible={scanningExit}
        title="Scan exit QR"
        onClose={() => setScanningExit(false)}
        onScanned={handleExitDecoded}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: spacing.xl, gap: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  signOut: { color: colors.mutedForeground, fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotInside: { backgroundColor: colors.success },
  dotOutside: { backgroundColor: colors.mutedForeground },
  statusText: { fontSize: 17, fontWeight: "700", color: colors.text },
  suspendedBadge: { backgroundColor: colors.destructiveBackground, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  suspendedText: { color: colors.destructive, fontSize: 12, fontWeight: "600" },
  muted: { color: colors.mutedForeground, fontSize: 13, marginTop: 2 },
  centerText: { textAlign: "center" },
  primaryButtonLarge: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: colors.primaryForeground, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  qrWrap: { alignItems: "center", gap: spacing.sm },
  expiry: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  destructiveButton: {
    backgroundColor: colors.destructiveBackground,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  destructiveButtonText: { color: colors.destructive, fontSize: 14, fontWeight: "600" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyType: { fontWeight: "600", color: colors.text, fontSize: 14 },
  historyRight: { alignItems: "flex-end" },
  historyTime: { color: colors.text, fontSize: 13 },
});
