import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "campusguard_token";

/**
 * The session JWT lives in the device's secure storage (iOS Keychain /
 * Android Keystore via expo-secure-store) — never AsyncStorage, which is
 * plain unencrypted disk storage any app with file-system access on a
 * rooted/jailbroken device could read.
 */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
