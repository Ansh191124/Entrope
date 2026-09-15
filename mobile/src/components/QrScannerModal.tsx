import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors, spacing, radius } from "../theme";

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  onScanned: (data: string) => void;
}

/**
 * Reads camera frames and decodes a QR code. The decoded text is handed to
 * the caller as an opaque string — this component performs no validation of
 * what's inside it; that all happens server-side (same principle as the web
 * app's QrScanner — see src/components/scanner/QrScanner.tsx there).
 */
export function QrScannerModal({ visible, title, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  // Reset the "already scanned once" lock every time the modal is reopened.
  useEffect(() => {
    if (visible) setLocked(false);
  }, [visible]);

  function handleBarcodeScanned({ data }: { data: string }) {
    if (locked) return;
    setLocked(true);
    onScanned(data);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        {!permission ? null : !permission.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Camera access is needed to scan the QR code.
            </Text>
            <TouchableOpacity style={styles.button} onPress={requestPermission}>
              <Text style={styles.buttonText}>Grant camera access</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={locked ? undefined : handleBarcodeScanned}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  close: { color: "#fff", fontSize: 15 },
  camera: { flex: 1 },
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  permissionText: { color: "#fff", textAlign: "center", fontSize: 15 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  buttonText: { color: colors.primaryForeground, fontWeight: "600" },
});
