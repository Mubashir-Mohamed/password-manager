// Biometric-gated quick-unlock cache — build plan §2 "Mobile: react-native-
// keychain, biometric-gated (Face ID/Touch ID/Android Keystore+BiometricPrompt)."
// Always defers to the OS's own biometric sheet (react-native-keychain calls
// straight into Keychain Services / Android Keystore); this module never
// renders a custom biometric UI, matching mobile design plan §3's platform
// conventions table.
import * as Keychain from "react-native-keychain";

const SERVICE = "com.yourorg.passwordmanager.quick-unlock";

export async function isBiometricAvailable(): Promise<boolean> {
  const type = await Keychain.getSupportedBiometryType();
  return type !== null;
}

/** Stores the VMK (base64) behind biometry. Call right after a successful
 * full unlock, once the user has opted in (mobile design plan §4.1
 * "Biometric opt-in ... framed around convenience, not security theater"). */
export async function saveQuickUnlockSecret(vmkBase64: string): Promise<void> {
  await Keychain.setGenericPassword("vault", vmkBase64, {
    service: SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Triggers the OS biometric prompt and returns the cached VMK if approved.
 * Returns null on cancel/failure/no-cached-secret — caller falls back to the
 * full master-password + Secret Key unlock flow. */
export async function getQuickUnlockSecret(): Promise<string | null> {
  try {
    const result = await Keychain.getGenericPassword({ service: SERVICE });
    return result ? result.password : null;
  } catch {
    return null;
  }
}

export async function clearQuickUnlockSecret(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
