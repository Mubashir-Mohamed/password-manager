import { useEffect, useState } from "react";
import { Button, TextField } from "@password-manager/ui";
import { unlockAndStartSession } from "../../lib/unlock.js";
import { clearSession, getSession } from "../../lib/session.js";
import { normalizeDomain } from "../../lib/domain.js";
import type { MatchResponse } from "../../lib/messages.js";

type Status = "checking" | "locked" | "unlocked";

export function Popup() {
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<MatchResponse["matches"]>([]);
  const [currentDomain, setCurrentDomain] = useState("");

  useEffect(() => {
    getSession().then((session) => setStatus(session ? "unlocked" : "locked"));
  }, []);

  useEffect(() => {
    if (status !== "unlocked") return;
    browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.url) return;
      const domain = normalizeDomain(tab.url);
      setCurrentDomain(domain);
      const response = (await browser.runtime.sendMessage({
        type: "vault:match-domain",
        domain,
      })) as MatchResponse;
      setMatches(response.matches);
    });
  }, [status]);

  async function handleUnlock() {
    setBusy(true);
    setError(null);
    try {
      await unlockAndStartSession(email, masterPassword, secretKey);
      setStatus("unlocked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    await clearSession();
    setStatus("locked");
    setMatches([]);
  }

  async function fillOnActiveTab(itemId: string) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Re-uses the content script's own message handling path is out of scope
    // for this popup-triggered flow in Phase 1 — the content script's inline
    // 🔐 button (entrypoints/content.ts) is the primary fill trigger; this
    // button re-fetches the credential and copies it as a fast-follow-friendly
    // fallback for sites where the inline button didn't attach.
    const fillResponse = (await browser.runtime.sendMessage({ type: "vault:fill-item", itemId })) as {
      password?: string;
    } | null;
    if (fillResponse?.password) {
      await navigator.clipboard.writeText(fillResponse.password);
    }
  }

  if (status === "checking") {
    return <div className="p-6 text-sm text-white/60">Loading…</div>;
  }

  if (status === "locked") {
    return (
      <div className="flex flex-col gap-4 p-5">
        <h1 className="text-md font-semibold text-white/95">Unlock</h1>
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Master password"
          type="password"
          value={masterPassword}
          onChange={(e) => setMasterPassword(e.target.value)}
        />
        <TextField
          label="Secret Key"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          error={error ?? undefined}
        />
        <Button disabled={busy || !email || !masterPassword || !secretKey} onClick={handleUnlock}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-md font-semibold text-white/95">{currentDomain || "Vault"}</h1>
        <button className="text-xs text-white/60 hover:text-white/85" onClick={handleLock}>
          Lock
        </button>
      </div>

      {matches.length === 0 ? (
        <p className="text-sm text-white/60">No saved items for this site yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.itemId}>
              <button
                onClick={() => fillOnActiveTab(match.itemId)}
                className="flex w-full flex-col rounded-sm border border-white/[0.08] bg-surface px-4 py-3 text-left hover:border-white/20"
              >
                <span className="text-sm font-semibold text-white/95">{match.title}</span>
                {match.username && <span className="text-xs text-white/60">{match.username}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
