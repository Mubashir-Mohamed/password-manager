import { useState } from "react";
import { Button, StrengthMeter, TextField } from "@password-manager/ui";
import { scorePasswordStrength } from "@password-manager/core-domain";
import { useAppStore } from "../state/store.js";

export function SignUpCredentialsScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const strength = scorePasswordStrength(password);
  const canContinue = email.includes("@") && password.length >= 8 && password === confirm && strength.score >= 2;

  function handleContinue() {
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (strength.score < 2) {
      setError("Choose a stronger master password.");
      return;
    }
    setError(null);
    // Stash email/password in sessionStorage only for the duration of this
    // signup flow's next step — never localStorage, never sent anywhere yet.
    sessionStorage.setItem("pm_signup_email", email);
    sessionStorage.setItem("pm_signup_password", password);
    setScreen("signup-secretkey");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5">
      <div>
        <h1 className="text-lg font-semibold text-white/95">Create your master password</h1>
        <p className="mt-2 text-sm text-white/60">
          This unlocks your vault. We never see it, store it, or can reset it for you — choose something you'll
          remember.
        </p>
      </div>

      <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <div className="flex flex-col gap-2">
        <TextField
          label="Master password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        {password.length > 0 && <StrengthMeter result={strength} />}
      </div>
      <TextField
        label="Confirm master password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        error={error ?? undefined}
      />

      <Button disabled={!canContinue} onClick={handleContinue}>
        Continue
      </Button>
      <button className="text-sm text-white/60 hover:text-white/85" onClick={() => setScreen("welcome")}>
        ← Back
      </button>
    </div>
  );
}
