// Wraps Electron's `safeStorage` (Keychain on macOS, DPAPI on Windows) for
// the quick-unlock VMK cache — see desktop design plan §2/§3 "Biometric
// quick-unlock". `safeStorage` only encrypts/decrypts in-memory buffers; it
// does not persist anything itself, so this module also owns writing the
// resulting ciphertext to a small file under `app.getPath('userData')`.
//
// IMPORTANT: this is a *convenience* cache for a fast biometric/OS-gated
// unlock, not a replacement for the KDF — the renderer still derives KEK
// from the master password + Secret Key normally; this just lets a returning
// user skip re-typing them once already unlocked once on this machine,
// gated behind a native Touch ID / Windows Hello prompt (desktop design plan
// §2 "defer to the OS sheet, never build a custom biometric UI").
import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

function storagePath(): string {
  return path.join(app.getPath("userData"), "quick-unlock.bin");
}

export function isAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export async function setQuickUnlockPayload(plaintext: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-level secure storage is not available on this machine.");
  }
  const encrypted = safeStorage.encryptString(plaintext);
  await fs.writeFile(storagePath(), encrypted);
}

export async function getQuickUnlockPayload(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(storagePath());
    return safeStorage.decryptString(encrypted);
  } catch {
    return null; // no cached payload yet, or it's unreadable — caller falls back to full unlock
  }
}

export async function clearQuickUnlockPayload(): Promise<void> {
  await fs.rm(storagePath(), { force: true });
}
