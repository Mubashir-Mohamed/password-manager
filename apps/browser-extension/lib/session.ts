import { browser } from "wxt/browser";

// `browser.storage.session` (webextension-polyfill, works across Chrome/
// Firefox/Edge via WXT) is in-memory only and cleared when the browser
// closes — the deliberate MV3 substitute for "keep the VMK in a module
// variable," which doesn't survive service-worker restarts. See mobile
// design plan §2 "Extension: ... use chrome.storage.session ... for a
// bounded unlock TTL" and build plan §2 "Biometric unlock" browser-extension row.

const UNLOCK_TTL_MS = 15 * 60 * 1000; // matches apps/web's auto-lock idle window

export interface UnlockedSession {
  vmkB64: string;
  privateKeyB64: string;
  publicKey: string;
  userId: string;
  vaultId: string;
  expiresAt: number;
}

const KEY = "pm_session";

export async function setSession(session: Omit<UnlockedSession, "expiresAt">): Promise<void> {
  await browser.storage.session.set({
    [KEY]: { ...session, expiresAt: Date.now() + UNLOCK_TTL_MS } satisfies UnlockedSession,
  });
}

export async function getSession(): Promise<UnlockedSession | null> {
  const result = await browser.storage.session.get(KEY);
  const session = result[KEY] as UnlockedSession | undefined;
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    await clearSession();
    return null;
  }
  return session;
}

export async function clearSession(): Promise<void> {
  await browser.storage.session.remove(KEY);
}
