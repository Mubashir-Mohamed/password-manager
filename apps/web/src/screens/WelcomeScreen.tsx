import { Button, Card } from "@password-manager/ui";
import { useAppStore } from "../state/store.js";

export function WelcomeScreen() {
  const setScreen = useAppStore((s) => s.setScreen);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-5">
      <div className="flex flex-col gap-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-accent/10 text-2xl">
          🔐
        </div>
        <h1 className="text-lg font-semibold text-white/95">Your vault, everywhere</h1>
        <p className="text-sm text-white/60">
          Every password is encrypted on your device before it ever reaches our servers — not even we can read it.
        </p>
      </div>
      <Card className="flex flex-col gap-3">
        <Button onClick={() => setScreen("signup-credentials")}>Create account</Button>
        <Button variant="secondary" onClick={() => setScreen("unlock")}>
          Sign in
        </Button>
      </Card>
    </div>
  );
}
