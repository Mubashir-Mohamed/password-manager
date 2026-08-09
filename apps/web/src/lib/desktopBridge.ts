// Thin, always-safe wrapper around window.electronAPI (apps/desktop's
// preload bridge, see apps/web/src/types/electron.d.ts) — every call site
// elsewhere gets "no-op in a plain browser tab or the extension" for free
// instead of repeating the `window.electronAPI?.` guard everywhere.

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

/** Keeps the tray icon / Quick Access overlay's lock indicator (desktop
 * design plan §0/§2) in sync with the renderer's actual lock state — call
 * from the store's lock()/setUnlocked() so every path (Settings "Lock now",
 * auto-lock, a fresh unlock) reports through the same two calls. */
export function notifyLocked(): void {
  window.electronAPI?.lock.notifyLocked();
}
export function notifyUnlocked(): void {
  window.electronAPI?.lock.notifyUnlocked();
}

/** Main process → renderer: user picked "Lock now" from the tray menu.
 * Returns an unsubscribe fn; no-ops (and returns a no-op unsubscribe) off
 * Electron. */
export function onLockRequested(callback: () => void): () => void {
  return window.electronAPI?.lock.onLockRequested(callback) ?? (() => {});
}

/** Desktop's quick-unlock cache (desktop design plan §2 "Biometric quick-
 * unlock"): OS-level `safeStorage` encryption at rest via the main process,
 * NOT itself a Face ID/Touch ID/Windows Hello prompt — Electron's
 * `safeStorage` API doesn't expose a biometric-gated ACL the way mobile's
 * Keychain `ACCESS_CONTROL.BIOMETRY_CURRENT_SET` does (see
 * apps/desktop/electron/secureStorage.ts's own header comment). Treat this
 * as "skip retyping the master password on this machine," not "biometric."
 * Best-effort — failures here fall back to the full unlock form, same
 * posture as apps/mobile's saveQuickUnlockSecret. */
export async function saveQuickUnlock(payload: string): Promise<void> {
  if (!window.electronAPI) return;
  try {
    if (await window.electronAPI.secureStorage.isAvailable()) {
      await window.electronAPI.secureStorage.set(payload);
    }
  } catch {
    // best-effort
  }
}

export async function getQuickUnlock(): Promise<string | null> {
  if (!window.electronAPI) return null;
  try {
    return await window.electronAPI.secureStorage.get();
  } catch {
    return null;
  }
}

/** Only meaningful called from the Quick Access overlay renderer. */
export function hideQuickAccess(): void {
  window.electronAPI?.quickAccess.hide();
}
export function resizeQuickAccess(height: number): void {
  window.electronAPI?.quickAccess.resize(height);
}
