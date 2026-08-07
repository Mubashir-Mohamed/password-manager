import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { fetchOwnProfile, listVaultItems, onAuthStateChange } from "@password-manager/api-client";
import type { Database } from "@password-manager/api-client";
import { fromBase64, toBase64 } from "@password-manager/core-crypto";
import { decryptItemContent, unlockOnNewDevice, unlockSameDevice } from "./src/lib/vaultCrypto.js";
import { saveQuickUnlockSecret } from "./src/lib/biometrics.js";
import { supabase } from "./src/lib/supabase.js";
import { UnlockScreen } from "./src/screens/UnlockScreen.js";
import { VaultHomeScreen, type DecryptedItem } from "./src/screens/VaultHomeScreen.js";

type Screen = "loading" | "unlock" | "vault";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Database["public"]["Tables"]["profiles"]["Row"] | null>(null);
  const [vmk, setVmk] = useState<Uint8Array | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);
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

  useEffect(() => {
    if (screen !== "vault" || !vmk || !session) return;
    setLoadingItems(true);
    (async () => {
      const { data: vaults } = await supabase.from("vaults").select("id").limit(1);
      const vaultId = vaults?.[0]?.id;
      if (!vaultId) {
        setLoadingItems(false);
        return;
      }
      const rows = await listVaultItems(supabase, vaultId);
      const decrypted = await Promise.all(rows.map(async (row) => ({ row, content: await decryptItemContent(row, vmk) })));
      setItems(decrypted);
      setLoadingItems(false);
    })();
  }, [screen, vmk, session]);

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
          onSelectItem={() => {
            // Item detail / add-item screens are a fast-follow on mobile —
            // this scaffold demonstrates unlock → decrypt → list end-to-end,
            // matching the build plan's "Mobile core: auth/CRUD/sync" milestone
            // ordering (CRUD screens ship after web's are proven out).
          }}
          onAddItem={() => {}}
        />
      )}
    </SafeAreaProvider>
  );
}
