import { useEffect, useState } from "react";
import { Button, Card } from "@password-manager/ui";
import { signUp, createVault } from "@password-manager/api-client";
import { buildNewAccountMaterial, generateNewSecretKey } from "../lib/vaultCrypto.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

function downloadSecretKey(secretKey: string) {
  const blob = new Blob([secretKey], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "password-manager-secret-key.txt";
  a.click();
  URL.revokeObjectURL(url);
}

function printSecretKey(secretKey: string) {
  const win = window.open("", "_blank", "width=420,height=320");
  if (!win) return; // popup blocked — Copy/Save to Files remain available
  win.document.title = "Secret Key";
  const pre = win.document.createElement("pre");
  pre.style.cssText = "font:20px ui-monospace,monospace;padding:32px;white-space:pre-wrap;";
  pre.textContent = secretKey; // not innerHTML/document.write — no interpolation into markup
  win.document.body.appendChild(pre);
  win.focus();
  win.print();
}

// This screen is deliberately not skippable via back-swipe/navigation and
// requires an explicit acknowledgment before continuing — see mobile design
// plan §4.1: "treat it like a legal-document acknowledgment, not a casual
// step." A lost Secret Key + forgotten master password is unrecoverable.
export function SignUpSecretKeyScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const setUnlocked = useAppStore((s) => s.setUnlocked);
  const setProfile = useAppStore((s) => s.setProfile);
  const setSession = useAppStore((s) => s.setSession);
  const setVaultId = useAppStore((s) => s.setVaultId);
  const showToast = useAppStore((s) => s.showToast);

  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generateNewSecretKey().then(setSecretKey);
  }, []);

  async function handleFinish() {
    const email = sessionStorage.getItem("pm_signup_email");
    const password = sessionStorage.getItem("pm_signup_password");
    if (!email || !password || !secretKey) return;

    setBusy(true);
    setError(null);
    try {
      const material = await buildNewAccountMaterial(password, secretKey);
      const user = await signUp(supabase, {
        email,
        authLoginSecret: material.authLoginSecret,
        profile: material.profileInsert,
      });

      const { data: sessionData } = await supabase.auth.getSession();
      setSession(sessionData.session);

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (profileErr) throw profileErr;
      setProfile(profile);

      setUnlocked(material.secrets.vmk, material.secrets.keypair);

      const vault = await createVault(supabase, user.id);
      setVaultId(vault.id);

      sessionStorage.removeItem("pm_signup_email");
      sessionStorage.removeItem("pm_signup_password");
      showToast({ message: "Vault created", tone: "success" });
      setScreen("vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong creating your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5">
      <div>
        <h1 className="text-lg font-semibold text-white/95">Save your Secret Key</h1>
        <p className="mt-2 text-sm text-white/60">
          Your Secret Key plus your master password are the only way to unlock your vault. If you lose either one,
          your data is permanently unrecoverable — we designed it this way on purpose so no one else can get in
          either.
        </p>
      </div>

      <Card>
        <p className="font-mono font-mono-nums text-center text-lg tracking-wider text-accent">
          {secretKey ?? "Generating…"}
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        <Button
          variant="secondary"
          onClick={() => secretKey && navigator.clipboard.writeText(secretKey)}
          disabled={!secretKey}
        >
          Copy to clipboard
        </Button>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => secretKey && downloadSecretKey(secretKey)}
            disabled={!secretKey}
          >
            Save to Files
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => secretKey && printSecretKey(secretKey)}
            disabled={!secretKey}
          >
            Print
          </Button>
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-white/85">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-base accent-accent"
        />
        I've saved my Secret Key somewhere safe. I understand it cannot be recovered.
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button disabled={!confirmed || busy || !secretKey} onClick={handleFinish}>
        {busy ? "Creating your vault…" : "Finish setup"}
      </Button>
    </div>
  );
}
