import { Button, Card } from "@password-manager/ui";
import { signOut } from "@password-manager/api-client";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

export function SettingsScreen() {
  const profile = useAppStore((s) => s.profile);
  const lock = useAppStore((s) => s.lock);
  const setScreen = useAppStore((s) => s.setScreen);
  const setSession = useAppStore((s) => s.setSession);

  async function handleSignOut() {
    await signOut(supabase);
    setSession(null);
    lock();
    setScreen("welcome");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-6">
      <h1 className="text-lg font-semibold text-white/95">Settings</h1>

      <Card className="flex flex-col gap-1">
        <span className="text-xs text-white/60">Signed in as</span>
        <span className="text-sm text-white/95">{profile?.email}</span>
      </Card>

      <div className="flex flex-col gap-3">
        <Button variant="secondary" onClick={lock}>
          Lock now
        </Button>
        <Button variant="destructive" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>

      <p className="text-xs text-white/35">
        Emergency access, encrypted attachments, and passkey support are fast-follow items — see the Phase 1 build
        plan.
      </p>
    </div>
  );
}
