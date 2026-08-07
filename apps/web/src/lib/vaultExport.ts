// Encrypted vault export/import (build plan §4/§5 "export (encrypted JSON)").
// The export file has its own independent password — deliberately NOT the
// vault master password, so a leaked export file doesn't also compromise the
// live account, and vice versa. Uses core-crypto's `deriveExportKey`
// (separate KDF from the vault key hierarchy — see that function's header).
import {
  decryptItem,
  deriveExportKey,
  encryptItem,
  fromBase64,
  generateKdfSalt,
  KDF_PROFILES,
  toBase64,
} from "@password-manager/core-crypto";
import { vaultItemContentSchema, type VaultItemContent } from "@password-manager/core-domain";

const EXPORT_FORMAT = "password-manager-encrypted-export";
const EXPORT_VERSION = 1;
const EXPORT_AAD = "vault-export:1";

export interface ExportedVaultFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  kdf: { algo: "argon2id"; salt: string; memlimit: number; opslimit: number };
  nonce: string;
  ciphertext: string;
}

export async function exportVaultEncrypted(
  items: VaultItemContent[],
  exportPassword: string,
): Promise<string> {
  const salt = await generateKdfSalt();
  const params = KDF_PROFILES.moderate;
  const key = await deriveExportKey(exportPassword, salt, params);

  const encrypted = await encryptItem(JSON.stringify(items), key, EXPORT_AAD);

  const file: ExportedVaultFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    kdf: { algo: "argon2id", salt: await toBase64(salt), memlimit: params.memlimit, opslimit: params.opslimit },
    nonce: encrypted.nonce,
    ciphertext: encrypted.ciphertext,
  };
  return JSON.stringify(file, null, 2);
}

export async function importVaultEncrypted(
  fileText: string,
  exportPassword: string,
): Promise<VaultItemContent[]> {
  let file: ExportedVaultFile;
  try {
    file = JSON.parse(fileText);
  } catch {
    throw new Error("Not a valid export file — couldn't parse JSON.");
  }
  if (file.format !== EXPORT_FORMAT) {
    throw new Error("Not a recognized Password Manager export file.");
  }

  const salt = await fromBase64(file.kdf.salt);
  const key = await deriveExportKey(exportPassword, salt, {
    algo: "argon2id",
    version: 1,
    memlimit: file.kdf.memlimit,
    opslimit: file.kdf.opslimit,
  });

  let plaintext: string;
  try {
    plaintext = await decryptItem({ nonce: file.nonce, ciphertext: file.ciphertext, aad: EXPORT_AAD }, key);
  } catch {
    throw new Error("Incorrect export password.");
  }

  return vaultItemContentSchema.array().parse(JSON.parse(plaintext));
}

/** Triggers a browser download of the encrypted export — small DOM-only
 * helper, kept separate from the crypto above so `exportVaultEncrypted`
 * itself stays testable without a document. */
export function downloadExportFile(json: string, filename = `vault-export-${Date.now()}.json`) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
