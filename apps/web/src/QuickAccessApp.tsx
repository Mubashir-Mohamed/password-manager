import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { fetchOwnProfile } from "@password-manager/api-client";
import { fromBase64, toBase64 } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import { useAppStore } from "./state/store.js";
import { useVaultSync } from "./lib/useVaultSync.js";
import { unlockWithCredentials } from "./lib/vaultCrypto.js";
import { getQuickUnlock, hideQuickAccess, resizeQuickAccess, saveQuickUnlock } from "./lib/desktopBridge.js";
import { supabase } from "./lib/supabase.js";

interface QuickUnlockPayload {
  vmk: string;
  privateKey: string;
}

const SEARCH_BAR_HEIGHT = 72;
const ROW_HEIGHT = 44;
const MAX_VISIBLE_ROWS = 6;

/** The Quick Access overlay's renderer content (desktop design plan §0/§4.2)
 * — loaded by apps/desktop's separate, frameless, always-on-top BrowserWindow
 * (`?quickAccess=1`, see apps/desktop/electron/windows.ts and main.tsx's
 * branch on that query param). This is a genuinely separate renderer
 * process from the main window: it gets its own fresh module state
 * (including its own useAppStore instance), so it bootstraps its own
 * session/unlock/item state rather than sharing the main window's in-memory
 * VMK directly. What it *does* share with the main window: the persisted
 * Supabase session (same origin, same default Electron session partition —
 * no fresh sign-in needed here) and the OS-level quick-unlock cache (see
 * lib/desktopBridge.ts), which is what lets this open pre-unlocked without
 * retyping anything on the common path.
 *
 * No email/sign-up flow here by design — Quick Access assumes the main
 * window has signed in at least once on this machine. */
export function QuickAccessApp() {
  useVaultSync();
  const vmk = useAppStore((s) => s.vmk);
  const items = useAppStore((s) => s.items);
  const profile = useAppStore((s) => s.profile);
  const setSession = useAppStore((s) => s.setSession);
  const setProfile = useAppStore((s) => s.setProfile);
  const setUnlocked = useAppStore((s) => s.setUnlocked);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [masterPassword, setMasterPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // index.html's <body> is opaque (`bg-base`, shared with the normal app
  // shell) — this window is Electron's `transparent: true` (windows.ts), so
  // without overriding it here the page background defeats the transparency
  // and the rounded-corner "floats over other apps" effect never shows.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  // Bootstrap once: restore the persisted session, then try the quick-unlock
  // cache before falling back to the inline form.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (!data.session) {
        setBootstrapping(false);
        return;
      }
      setHasSession(true);

      const fetchedProfile = await fetchOwnProfile(supabase);
      setProfile(fetchedProfile);
      if (!fetchedProfile) {
        setBootstrapping(false);
        return;
      }

      const cached = await getQuickUnlock();
      if (cached) {
        try {
          const parsed: QuickUnlockPayload = JSON.parse(cached);
          setUnlocked(await fromBase64(parsed.vmk), {
            publicKey: fetchedProfile.public_key,
            privateKey: await fromBase64(parsed.privateKey),
          });
        } catch {
          // Corrupt/incompatible cache — inline unlock form below handles it.
        }
      }
      setBootstrapping(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The overlay window is hidden, not destroyed, between uses (apps/desktop
  // toggles visibility) — without this, reopening it would show whatever
  // search state was left over from last time.
  useEffect(() => {
    function onWindowFocus() {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
    window.addEventListener("focus", onWindowFocus);
    onWindowFocus();
    return () => window.removeEventListener("focus", onWindowFocus);
  }, []);

  const unlocked = !!vmk;

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.content.title.toLowerCase().includes(q) ||
        ("username" in item.content && item.content.username?.toLowerCase().includes(q)),
    );
  }, [items, query]);

  // Grow/shrink the actual OS window (it starts at just the search bar's
  // height — apps/desktop/electron/windows.ts) to fit whatever's showing.
  useEffect(() => {
    let extra = 0;
    if (bootstrapping) extra = 0;
    else if (!hasSession || !profile) extra = 44;
    else if (!unlocked) extra = 152;
    else extra = Math.min(filtered.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT || (filtered.length === 0 && items.length > 0 ? 40 : 0);
    resizeQuickAccess(SEARCH_BAR_HEIGHT + extra);
  }, [bootstrapping, hasSession, profile, unlocked, filtered.length, items.length]);

  async function copyAndDismiss(content: LoginContent) {
    await navigator.clipboard.writeText(content.password);
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30_000);
    hideQuickAccess();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      hideQuickAccess();
      return;
    }
    if (!unlocked || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.min(filtered.length, MAX_VISIBLE_ROWS) - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selectedIndex];
      if (item && item.content.kind === "login") copyAndDismiss(item.content);
    }
  }

  async function handleInlineUnlock() {
    if (!profile) return;
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const secrets = await unlockWithCredentials(profile, masterPassword, secretKey);
      setUnlocked(secrets.vmk, secrets.keypair);
      saveQuickUnlock(
        JSON.stringify({ vmk: await toBase64(secrets.vmk), privateKey: await toBase64(secrets.keypair.privateKey) }),
      ).catch(() => {});
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setUnlockBusy(false);
    }
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface/95 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 px-4 py-4">
        <span className="text-lg" aria-hidden="true">🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder="Search vault…"
          disabled={!unlocked}
          autoFocus
          className="flex-1 bg-transparent text-base text-white/95 placeholder:text-white/35 outline-none disabled:opacity-50"
        />
      </div>

      {bootstrapping ? null : !hasSession || !profile ? (
        <div className="border-t border-white/[0.06] px-4 py-3 text-xs text-white/50">
          Sign in from the main window first.
        </div>
      ) : !unlocked ? (
        <div className="flex flex-col gap-2 border-t border-white/[0.06] px-4 py-3">
          <input
            type="password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            placeholder="Master password"
            className="rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-white/95 outline-none"
          />
          <input
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="Secret Key"
            className="rounded-lg border border-white/10 bg-base px-3 py-2 text-sm text-white/95 outline-none"
          />
          {unlockError && <p className="text-xs text-danger">{unlockError}</p>}
          <button
            onClick={handleInlineUnlock}
            disabled={unlockBusy || !masterPassword || !secretKey}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {unlockBusy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      ) : filtered.length > 0 ? (
        <ul className="flex-1 overflow-y-auto border-t border-white/[0.06]">
          {filtered.slice(0, MAX_VISIBLE_ROWS).map((item, i) => (
            <li key={item.row.id}>
              <button
                onClick={() => item.content.kind === "login" && copyAndDismiss(item.content)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left ${
                  i === selectedIndex ? "bg-accent/15" : "hover:bg-white/[0.03]"
                }`}
              >
                <span className="truncate text-sm text-white/95">{item.content.title}</span>
                <span className="text-[11px] text-white/40">⏎ copy</span>
              </button>
            </li>
          ))}
        </ul>
      ) : items.length > 0 ? (
        <div className="border-t border-white/[0.06] px-4 py-2.5 text-xs text-white/40">No matches</div>
      ) : null}
    </div>
  );
}
