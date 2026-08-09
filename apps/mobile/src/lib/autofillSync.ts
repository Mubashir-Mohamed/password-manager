// Keeps the iOS Credential Provider Extension's local cache
// (targets/credentials-provider) up to date — build plan §7 step 7. Only
// ciphertext crosses this boundary (the same wrapped_item_key/content shape
// vault_items already has server-side); the extension unwraps it itself
// using the VMK it reads from the shared Keychain (see biometrics.ts's
// SHARED_ACCESS_GROUP). Android has no equivalent yet (AutofillService is a
// separate, not-yet-built fast-follow), so this is a no-op there.
import { Platform } from "react-native";
import SharedGroupPreferences from "react-native-shared-group-preferences";
import type { Database } from "@password-manager/api-client";

// Must match targets/credentials-provider/SharedVaultStore.swift's
// SharedVaultConfig exactly.
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
 * `login`-type rows, the extension's only supported item type right now
 * (matches every other surface's login-first MVP scope), and only the
 * fields the extension actually needs. */
export async function syncAutofillCache(rows: VaultItemRow[]): Promise<void> {
  if (Platform.OS !== "ios") return; // Android AutofillService not built yet
  const cached: CachedVaultItem[] = rows
    .filter((row) => row.type === "login" && !row.is_deleted)
    .map((row) => ({
      id: row.id,
      type: row.type,
      wrappedItemKey: row.wrapped_item_key,
      content: row.content,
    }));
  try {
    await SharedGroupPreferences.setItem(CACHE_KEY, JSON.stringify(cached), APP_GROUP);
  } catch {
    // Best-effort — a stale/missing cache just means the extension falls
    // back to "open the main app first", not a broken vault.
  }
}
