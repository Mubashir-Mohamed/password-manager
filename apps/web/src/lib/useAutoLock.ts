import { useEffect, useRef } from "react";
import { useAppStore } from "../state/store.js";

const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 min — configurable in Settings as a fast-follow

/** Locks the vault (clears VMK from memory) after a period of inactivity —
 * mobile design plan §4.2 "Auto-lock triggers". Does not sign out; the
 * Supabase session stays alive so unlocking again doesn't need the email
 * step. */
export function useAutoLock() {
  const vmk = useAppStore((s) => s.vmk);
  const lock = useAppStore((s) => s.lock);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!vmk) return;

    function reset() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => lock(), AUTO_LOCK_MS);
    }

    // Deliberately NOT locking on document.visibilitychange: unlike a mobile
    // app backgrounding (design plan §4.2, where losing the phone is the
    // threat model), switching browser tabs is routine and locking on every
    // tab-away would just train users to disable the feature. Idle timeout
    // is the right signal here; a native OS-sleep/lock-screen equivalent for
    // desktop is handled by the Electron app instead (see desktop design
    // plan §4.1 tray lock-state), not this hook.
    const events = ["mousemove", "keydown", "click", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, reset));
    reset();

    return () => {
      events.forEach((event) => window.removeEventListener(event, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [vmk, lock]);
}
