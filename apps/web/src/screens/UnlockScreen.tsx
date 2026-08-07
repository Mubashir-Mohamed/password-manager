import { useState } from "react";
import { Button, TextField } from "@password-manager/ui";
import { fetchKdfParamsForEmail, fetchOwnProfile, signIn } from "@password-manager/api-client";
import { deriveForSignIn, unlockWithCredentials, unwrapAccountSecrets } from "../lib/vaultCrypto.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

/** Handles both "fresh sign-in" (no Supabase session yet — needs the
 * `get-kdf-params` public lookup first) and "unlock after auto-lock" (session
 * still valid, profile already known, just re-derive and unwrap) — see
 * mobile design plan §4.2. */
export function UnlockScreen() {
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const setSession = useAppStore((s) => s.setSession);
  const setProfile = useAppStore((s) => s.setProfile);
  const setUnlocked = useAppStore((s) => s.setUnlocked);
  const setScreen = useAppStore((s) => s.setScreen);
  const showToast = useAppStore((s) => s.showToast);

  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsEmail = !session;

  async function handleUnlock() {
    setBusy(true);
    setError(null);
    try {
      if (session && profile) {
        // Same-device re-unlock: profile (with its wrapped keys) is already
        // in the store, no network round-trip needed beyond crypto.
        const unlocked = await unlockWithCredentials(profile, masterPassword, secretKey);
        setUnlocked(unlocked.vmk, unlocked.keypair);
      } else {
        // Fresh device: get this account's (non-secret) KDF params first,
        // derive, sign in, THEN fetch the profile (now allowed under RLS)
        // and unwrap. Wrong credentials surface as an AEAD failure in
        // unwrapAccountSecrets, or as an auth error from signIn itself.
        const kdfParams = await fetchKdfParamsForEmail(supabase, email);
        const { kek, authLoginSecret } = await deriveForSignIn(masterPassword, secretKey, kdfParams);
        const { session: newSession } = await signIn(supabase, email, authLoginSecret);
        setSession(newSession);

        const fetchedProfile = await fetchOwnProfile(supabase);
        if (!fetchedProfile) throw new Error("Signed in but no profile found for this account.");
        setProfile(fetchedProfile);

        const secrets = await unwrapAccountSecrets(fetchedProfile, kek);
        setUnlocked(secrets.vmk, secrets.keypair);
      }

      showToast({ message: "Vault unlocked", tone: "success" });
      setScreen("vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-accent/10 text-xl">
          🔒
        </div>
        <h1 className="text-lg font-semibold text-white/95">Unlock your vault</h1>
      </div>

      {needsEmail && (
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      )}
      <TextField
        label="Master password"
        type="password"
        value={masterPassword}
        onChange={(e) => setMasterPassword(e.target.value)}
        autoComplete="current-password"
      />
      <TextField
        label="Secret Key"
        placeholder="A3-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
        value={secretKey}
        onChange={(e) => setSecretKey(e.target.value)}
        error={error ?? undefined}
      />

      <Button disabled={busy || !masterPassword || !secretKey || (needsEmail && !email)} onClick={handleUnlock}>
        {busy ? "Unlocking…" : "Unlock"}
      </Button>
    </div>
  );
}
