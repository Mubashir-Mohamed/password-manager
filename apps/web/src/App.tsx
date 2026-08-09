import { useEffect } from "react";
import { Toast } from "@password-manager/ui";
import { fetchOwnProfile, onAuthStateChange } from "@password-manager/api-client";
import { supabase } from "./lib/supabase.js";
import { useAppStore } from "./state/store.js";
import { useAutoLock } from "./lib/useAutoLock.js";
import { WelcomeScreen } from "./screens/WelcomeScreen.js";
import { SignUpCredentialsScreen } from "./screens/SignUpCredentialsScreen.js";
import { SignUpSecretKeyScreen } from "./screens/SignUpSecretKeyScreen.js";
import { UnlockScreen } from "./screens/UnlockScreen.js";
import { VaultHomeScreen } from "./screens/VaultHomeScreen.js";
import { ItemDetailScreen } from "./screens/ItemDetailScreen.js";
import { GeneratorScreen } from "./screens/GeneratorScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";
import { SecurityDashboardScreen } from "./screens/SecurityDashboardScreen.js";
import { ImportExportScreen } from "./screens/ImportExportScreen.js";
import { SharedScreen } from "./screens/SharedScreen.js";

export function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const setSession = useAppStore((s) => s.setSession);
  const setProfile = useAppStore((s) => s.setProfile);
  const vmk = useAppStore((s) => s.vmk);
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);

  useAutoLock();

  // Bootstrap: restore whatever Supabase session persisted (e.g. page
  // reload) and route to Unlock rather than all the way back to Welcome —
  // the vault key itself never persists (build plan §2), only the auth
  // session does.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const profile = await fetchOwnProfile(supabase);
        setProfile(profile);
        setScreen("unlock");
      }
    });

    const { data: sub } = onAuthStateChange(supabase, async (_event, session) => {
      setSession(session);
      if (!session) setScreen("welcome");
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clearToast, 3000);
    return () => clearTimeout(id);
  }, [toast, clearToast]);

  const unlocked = !!vmk;

  return (
    <>
      {screen === "welcome" && <WelcomeScreen />}
      {screen === "signup-credentials" && <SignUpCredentialsScreen />}
      {screen === "signup-secretkey" && <SignUpSecretKeyScreen />}
      {screen === "unlock" && <UnlockScreen />}
      {unlocked && screen === "vault" && <VaultHomeScreen />}
      {unlocked && screen === "item" && <ItemDetailScreen />}
      {unlocked && screen === "generator" && <GeneratorScreen />}
      {unlocked && screen === "settings" && <SettingsScreen />}
      {unlocked && screen === "security" && <SecurityDashboardScreen />}
      {unlocked && screen === "import-export" && <ImportExportScreen />}
      {unlocked && screen === "shared" && <SharedScreen />}

      {unlocked && (screen === "vault" || screen === "generator" || screen === "settings") && (
        <nav className="fixed bottom-0 left-0 right-0 flex justify-center border-t border-white/[0.08] bg-chrome/95 backdrop-blur">
          <div className="flex w-full max-w-md">
            {(
              [
                ["vault", "Vault"],
                ["generator", "Generator"],
                ["settings", "Settings"],
              ] as const
            ).map(([target, label]) => (
              <button
                key={target}
                onClick={() => setScreen(target)}
                className={`flex-1 py-4 text-center text-xs font-medium ${
                  screen === target ? "text-accent" : "text-white/50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2">
          <Toast message={toast.message} tone={toast.tone} />
        </div>
      )}
    </>
  );
}
