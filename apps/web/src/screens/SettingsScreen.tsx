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

      {/* Grouped settings list — standard platform pattern per mobile design
          plan §4.9 ("no need to reinvent this screen"). Plain container
          (not Card, whose p-6 default isn't reliably overridable via a
          trailing className with plain string-concat cn() — see that
          module's TODO on tailwind-merge) so the divider rows sit flush. */}
      <div className="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-md border border-white/[0.08] bg-surface">
        <SettingsRow label="Security" description="Weak, reused, and breached passwords" onClick={() => setScreen("security")} />
        <SettingsRow label="Sharing" description="Items shared with you, and by you" onClick={() => setScreen("shared")} />
        <SettingsRow label="Import & Export" description="CSV import, encrypted vault export" onClick={() => setScreen("import-export")} />
      </div>

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

function SettingsRow({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between px-4 py-4 text-left hover:bg-white/[0.03]">
      <div>
        <p className="text-sm font-medium text-white/95">{label}</p>
        <p className="text-xs text-white/60">{description}</p>
      </div>
      <span className="text-white/35">›</span>
    </button>
  );
}
