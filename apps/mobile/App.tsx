import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import {
  createVaultItem,
  fetchOwnProfile,
  listVaultItems,
  onAuthStateChange,
  softDeleteVaultItem,
  subscribeToVaultItems,
  updateVaultItem,
} from "@password-manager/api-client";
import type { Database } from "@password-manager/api-client";
import { fromBase64, toBase64 } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import {
  decryptItemContent,
  encryptNewItem,
  encryptUpdatedItem,
  unlockOnNewDevice,
  unlockSameDevice,
} from "./src/lib/vaultCrypto.js";
import { saveQuickUnlockSecret } from "./src/lib/biometrics.js";
import { supabase } from "./src/lib/supabase.js";
import { UnlockScreen } from "./src/screens/UnlockScreen.js";
import { VaultHomeScreen, type DecryptedItem } from "./src/screens/VaultHomeScreen.js";
import { ItemDetailScreen } from "./src/screens/ItemDetailScreen.js";

type Screen = "loading" | "unlock" | "vault" | "item";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Database["public"]["Tables"]["profiles"]["Row"] | null>(null);
  const [vmk, setVmk] = useState<Uint8Array | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        setProfile(await fetchOwnProfile(supabase));
      }
      setScreen("unlock");
    });
    const { data: sub } = onAuthStateChange(supabase, async (_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the vault once unlocked, then keep it in sync via Realtime
  // (postgres_changes, RLS-scoped) — same pattern as apps/web's
  // VaultHomeScreen, build plan §4/§7 step 6 "Mobile core: auth/CRUD/sync".
  // Runs once per unlock, independent of which screen ("vault" or "item")
  // is currently showing, so the subscription doesn't drop while editing.
  useEffect(() => {
    if (!vmk || !session) return;
    let cancelled = false;

    async function load() {
      setLoadingItems(true);
      const { data: vaults } = await supabase.from("vaults").select("id").limit(1);
      const id = vaults?.[0]?.id;
      if (!id) {
        if (!cancelled) setLoadingItems(false);
        return;
      }
      if (cancelled) return;
      setVaultId(id);
      const rows = await listVaultItems(supabase, id);
      const decrypted = await Promise.all(rows.map(async (row) => ({ row, content: await decryptItemContent(row, vmk!) })));
      if (!cancelled) {
        setItems(decrypted);
        setLoadingItems(false);
      }

      const unsubscribe = subscribeToVaultItems(supabase, id, async ({ row }) => {
        if (!row) return;
        if (row.is_deleted) {
          setItems((prev) => prev.filter((i) => i.row.id !== row.id));
          return;
        }
        const content = await decryptItemContent(row, vmk!);
        setItems((prev) => [{ row, content }, ...prev.filter((i) => i.row.id !== row.id)]);
      });
      cleanup = unsubscribe;
    }
    let cleanup: (() => void) | undefined;
    load();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [vmk, session]);

  async function handleUnlock({
    email,
    masterPassword,
    secretKey,
  }: {
    email: string;
    masterPassword: string;
    secretKey: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      let secrets;
      if (session && profile) {
        secrets = await unlockSameDevice(profile, masterPassword, secretKey);
      } else {
        const result = await unlockOnNewDevice(email, masterPassword, secretKey);
        secrets = result.secrets;
        setProfile(result.profile);
        setSession((await supabase.auth.getSession()).data.session);
      }
      setVmk(secrets.vmk);
      // Best-effort — biometric opt-in is a separate Settings toggle in the
      // full design; here we just cache on every successful full unlock so
      // the "Face ID unlock available" path in UnlockScreen has something to
      // use next time.
      saveQuickUnlockSecret(await toBase64(secrets.vmk)).catch(() => {});
      setScreen("vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickUnlock(vmkBase64: string): Promise<boolean> {
    try {
      setVmk(await fromBase64(vmkBase64));
      setScreen("vault");
      return true;
    } catch {
      return false;
    }
  }

  const activeItem = items.find((i) => i.row.id === activeItemId) ?? null;

  async function handleSaveItem(content: LoginContent) {
    if (!vmk) return;
    setBusy(true);
    try {
      if (activeItem) {
        const { wrappedItemKey, encryptedContent } = await encryptUpdatedItem(
          activeItem.row.id,
          activeItem.row.version + 1,
          content,
          activeItem.row.wrapped_item_key,
          vmk,
        );
        const updated = await updateVaultItem(supabase, activeItem.row.id, activeItem.row.version, {
          wrapped_item_key: wrappedItemKey,
          content: encryptedContent,
        });
        if (updated) setItems((prev) => [{ row: updated, content }, ...prev.filter((i) => i.row.id !== updated.id)]);
      } else {
        if (!vaultId) return;
        const { id, wrappedItemKey, encryptedContent } = await encryptNewItem(content, vmk);
        const row = await createVaultItem(supabase, {
          id,
          vault_id: vaultId,
          type: "login",
          wrapped_item_key: wrappedItemKey,
          content: encryptedContent,
        });
        setItems((prev) => [{ row, content }, ...prev]);
      }
      setActiveItemId(null);
      setScreen("vault");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem() {
    if (!activeItem) return;
    await softDeleteVaultItem(supabase, activeItem.row.id);
    setItems((prev) => prev.filter((i) => i.row.id !== activeItem.row.id));
    setActiveItemId(null);
    setScreen("vault");
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === "loading" && (
        <View className="flex-1 items-center justify-center bg-base">
          <Text className="text-white/60">Loading…</Text>
        </View>
      )}
      {screen === "unlock" && (
        <UnlockScreen
          hasSession={!!session}
          profile={profile}
          busy={busy}
          error={error}
          onUnlock={handleUnlock}
          onQuickUnlock={handleQuickUnlock}
        />
      )}
      {screen === "vault" && (
        <VaultHomeScreen
          items={items}
          loading={loadingItems}
          onSelectItem={(itemId) => {
            setActiveItemId(itemId);
            setScreen("item");
          }}
          onAddItem={() => {
            setActiveItemId(null);
            setScreen("item");
          }}
        />
      )}
      {screen === "item" && (
        <ItemDetailScreen
          existing={activeItem}
          busy={busy}
          onBack={() => {
            setActiveItemId(null);
            setScreen("vault");
          }}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
        />
      )}
    </SafeAreaProvider>
  );
}
