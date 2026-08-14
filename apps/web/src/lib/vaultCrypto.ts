// App-specific orchestration on top of @password-manager/core-crypto — the
// primitives stay generic/reusable, this file is where the build plan §2 key
// hierarchy (master password + Secret Key → KEK/authLoginSecret → VMK →
// per-item keys) gets wired into actual signup/unlock/item flows.
import {
  KDF_PROFILES,
  decryptItem,
  deriveKeys,
  encryptItem,
  fromBase64,
  generateKdfSalt,
  generateKeypair,
  generateRandomKey,
  generateSecretKey,
  toBase64,
  unwrapKey,
  wrapKey,
  type Keypair,
} from "@password-manager/core-crypto";
import { vaultItemContentSchema, type VaultItemContent } from "@password-manager/core-domain";
import type { Database } from "@password-manager/api-client";

export interface UnlockedSecrets {
  vmk: Uint8Array;
  keypair: Keypair;
}

export interface NewAccountMaterial {
  authLoginSecret: string; // base64 — passed to Supabase Auth as the "password"
  secrets: UnlockedSecrets;
  profileInsert: Omit<Database["public"]["Tables"]["profiles"]["Insert"], "id" | "email">;
}

/** Step 1 of signup — generate the Secret Key up front so the UI can show the
 * one-time reveal screen before any KDF work happens (mobile design plan
 * §4.1 "Secret Key reveal screen ... treat it like a legal-document
 * acknowledgment, not a casual step"). */
export async function generateNewSecretKey(): Promise<string> {
  return generateSecretKey();
}

/** Step 2 — once the user has confirmed they saved the Secret Key, do the
 * actual key derivation + VMK/keypair generation + wrapping. */
export async function buildNewAccountMaterial(
  masterPassword: string,
  secretKey: string,
): Promise<NewAccountMaterial> {
  const salt = await generateKdfSalt();
  const params = KDF_PROFILES.moderate;
  const { kek, authLoginSecret } = await deriveKeys(masterPassword, secretKey, salt, params);

  const vmk = await generateRandomKey();
  const wrappedVaultKey = await wrapKey(vmk, kek);

  const keypair = await generateKeypair();
  const wrappedPrivateKey = await wrapKey(keypair.privateKey, vmk);

  return {
    authLoginSecret: await toBase64(authLoginSecret),
    secrets: { vmk, keypair },
    profileInsert: {
      kdf_algo: "argon2id",
      kdf_salt: await toBase64(salt),
      kdf_memlimit: params.memlimit,
      kdf_opslimit: params.opslimit,
      kdf_version: params.version,
      wrapped_vault_key: wrappedVaultKey,
      public_key: keypair.publicKey,
      wrapped_private_key: wrappedPrivateKey,
    },
  };
}

interface KdfParamsLike {
  kdf_salt: string;
  kdf_memlimit: number;
  kdf_opslimit: number;
  kdf_version: number;
}

/** Unlock, phase 1 — usable BEFORE there's a session, since it only needs
 * this account's (non-secret) KDF params, not its wrapped keys. Real accounts
 * fetch these via the public `get-kdf-params` Edge Function; an already-known
 * `profile` row works too (re-unlock after auto-lock, same device). Returns
 * `kek` (kept in-memory only, fed into phase 2) and `authLoginSecret` (for
 * `signInWithPassword` when there's no session yet). */
export async function deriveForSignIn(
  masterPassword: string,
  secretKey: string,
  kdfParams: KdfParamsLike,
): Promise<{ kek: Uint8Array; authLoginSecret: string }> {
  const salt = await fromBase64(kdfParams.kdf_salt);
  const params = {
    algo: "argon2id" as const,
    version: kdfParams.kdf_version as 1,
    opslimit: kdfParams.kdf_opslimit,
    memlimit: kdfParams.kdf_memlimit,
  };
  const { kek, authLoginSecret } = await deriveKeys(masterPassword, secretKey, salt, params);
  return { kek, authLoginSecret: await toBase64(authLoginSecret) };
}

/** Unlock, phase 2 — once a session exists and the full `profile` row (with
 * its wrapped keys) has been fetched, unwrap VMK and the private key with the
 * `kek` from phase 1. Wrong master password/Secret Key surfaces here as an
 * AEAD authentication failure, not before — matches build plan §2's
 * "authentication failure and decryption failure are the same event". */
export async function unwrapAccountSecrets(
  profile: Database["public"]["Tables"]["profiles"]["Row"],
  kek: Uint8Array,
): Promise<UnlockedSecrets> {
  try {
    const vmk = await unwrapKey(profile.wrapped_vault_key, kek);
    const privateKey = await unwrapKey(profile.wrapped_private_key, vmk);
    return { vmk, keypair: { publicKey: profile.public_key, privateKey } };
  } catch {
    throw new Error("Incorrect master password or Secret Key.");
  }
}

/** Convenience wrapper for the same-device re-unlock case (session already
 * live, profile already known) — does both phases at once. */
export async function unlockWithCredentials(
  profile: Database["public"]["Tables"]["profiles"]["Row"],
  masterPassword: string,
  secretKey: string,
): Promise<UnlockedSecrets & { authLoginSecret: string }> {
  const { kek, authLoginSecret } = await deriveForSignIn(masterPassword, secretKey, profile);
  const secrets = await unwrapAccountSecrets(profile, kek);
  return { ...secrets, authLoginSecret };
}

/** Encrypts a new item's plaintext content. Item id is generated client-side
 * (not left to Postgres's default) so the AAD binding — `${id}:${version}` —
 * is known before the row is ever inserted, per build plan §2 "Envelope
 * encryption for items". */
export async function encryptNewItem(
  content: VaultItemContent,
  vmk: Uint8Array,
): Promise<{
  id: string;
  wrappedItemKey: { nonce: string; ciphertext: string };
  encryptedContent: { nonce: string; ciphertext: string; aad: string };
}> {
  const id = crypto.randomUUID();
  const itemKey = await generateRandomKey();
  const wrappedItemKey = await wrapKey(itemKey, vmk);
  const encryptedContent = await encryptItem(JSON.stringify(content), itemKey, `${id}:1`);
  return { id, wrappedItemKey, encryptedContent };
}

/** Re-encrypts an existing item's content on save. The item key itself is
 * reused (unwrapped, then re-wrapped under the same VMK) rather than
 * rotated — only the AAD's version component changes, matching the
 * optimistic-concurrency `expectedVersion + 1` that `updateVaultItem`
 * performs server-side. */
export async function encryptUpdatedItem(
  itemId: string,
  nextVersion: number,
  content: VaultItemContent,
  wrappedItemKey: { nonce: string; ciphertext: string },
  vmk: Uint8Array,
): Promise<{
  wrappedItemKey: { nonce: string; ciphertext: string };
  encryptedContent: { nonce: string; ciphertext: string; aad: string };
}> {
  const itemKey = await unwrapKey(wrappedItemKey, vmk);
  const encryptedContent = await encryptItem(JSON.stringify(content), itemKey, `${itemId}:${nextVersion}`);
  const rewrapped = await wrapKey(itemKey, vmk);
  return { wrappedItemKey: rewrapped, encryptedContent };
}

/** Re-encrypts a shared item's content for a write-permission recipient.
 * Unlike `encryptUpdatedItem`, this never touches `wrapped_item_key` — a
 * recipient has the item's raw key (recovered via `openBox` from their
 * `shared_items` row, not the owner's VMK-wrapped copy) and the server-side
 * trigger in 0007_write_permission_sharing.sql rejects any attempt to change
 * `wrapped_item_key` from a non-owner anyway, so there's nothing to re-wrap
 * here — just the ciphertext and its version-bound AAD. */
export async function encryptSharedItemUpdate(
  itemId: string,
  nextVersion: number,
  content: VaultItemContent,
  itemKey: Uint8Array,
): Promise<{ encryptedContent: { nonce: string; ciphertext: string; aad: string } }> {
  const encryptedContent = await encryptItem(JSON.stringify(content), itemKey, `${itemId}:${nextVersion}`);
  return { encryptedContent };
}

export async function decryptItemContent(
  row: Database["public"]["Tables"]["vault_items"]["Row"],
  vmk: Uint8Array,
): Promise<VaultItemContent> {
  const itemKey = await unwrapKey(row.wrapped_item_key, vmk);
  const plaintext = await decryptItem(row.content, itemKey);
  return vaultItemContentSchema.parse(JSON.parse(plaintext));
}
