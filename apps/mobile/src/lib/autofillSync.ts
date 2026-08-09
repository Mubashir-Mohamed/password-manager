// Keeps native autofill's local data current — build plan §7 step 7.
// iOS: targets/credentials-provider (Credential Provider Extension).
// Android: native/android/autofill (AutofillService). Only ciphertext
// crosses into the shared cache (the same wrapped_item_key/content shape
// vault_items already has server-side); the VMK cache is separate and
// biometric-gated on both platforms (see saveAutofillVmk).
import { NativeModules, Platform } from "react-native";
import SharedGroupPreferences from "react-native-shared-group-preferences";
import type { Database } from "@password-manager/api-client";

// Must match:
// - iOS: targets/credentials-provider/SharedVaultStore.swift's SharedVaultConfig
// - Android: native/android/autofill/SharedVaultStore.kt
const APP_GROUP = "group.com.yourorg.passwordmanager.shared";
const CACHE_KEY = "vault_items_cache";

type VaultItemRow = Database["public"]["Tables"]["vault_items"]["Row"];

interface CachedVaultItem {
  id: string;
  type: string;
  wrappedItemKey: { nonce: string; ciphertext: string };
  content: { nonce: string; ciphertext: string; aad: string };
}

/** Call whenever the decrypted item list changes (App.tsx) — mirrors only
 * `login`-type rows, the only item type native autofill supports right now
 * (matches every other surface's login-first MVP scope), and only the
 * fields it actually needs. */
export async function syncAutofillCache(rows: VaultItemRow[]): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  const cached: CachedVaultItem[] = rows
    .filter((row) => row.type === "login" && !row.is_deleted)
    .map((row) => ({
      id: row.id,
      type: row.type,
      wrappedItemKey: row.wrapped_item_key,
      content: row.content,
    }));
  try {
    // Android: useAndroidSharedPreferences:true — without it this package
    // falls back to writing a JSON file under external storage, which is
    // both unnecessary here (same app/process, no real App Group needed)
    // and increasingly blocked outright on modern Android without extra
    // storage permissions we have no other reason to request.
    const options = Platform.OS === "android" ? { useAndroidSharedPreferences: true } : undefined;
    await SharedGroupPreferences.setItem(CACHE_KEY, JSON.stringify(cached), APP_GROUP, options);
  } catch {
    // Best-effort — a stale/missing cache just means the extension falls
    // back to "open the main app first", not a broken vault.
  }
}

/** Android-only counterpart to iOS's Keychain-based quick-unlock cache
 * (biometrics.ts's SHARED_ACCESS_GROUP) — call alongside saveQuickUnlockSecret
 * after every full unlock. No-op (resolves immediately) on other platforms. */
export async function saveAutofillVmk(vmkBase64: string): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await NativeModules.VaultAutofillBridge?.saveVmk(vmkBase64);
  } catch {
    // best-effort, same posture as biometrics.ts's saveQuickUnlockSecret
  }
}

export async function clearAutofillVmk(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await NativeModules.VaultAutofillBridge?.clearVmk();
  } catch {
    // best-effort
  }
}
