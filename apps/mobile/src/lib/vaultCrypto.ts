// Mobile's own thin orchestration layer over @password-manager/core-crypto —
// same two-phase unlock pattern as apps/web and apps/browser-extension
// (deliberately duplicated per-app, not shared — see those files' headers).
// The only difference on this platform: core-crypto transparently resolves
// to sodium.native.ts (react-native-libsodium) instead of the WASM build,
// via Metro's automatic `.native.ts` resolution — no code here needs to know
// that.
import {
  decryptItem,
  deriveKeys,
  encryptItem,
  fromBase64,
  generateRandomKey,
  toBase64,
  unwrapKey,
  wrapKey,
} from "@password-manager/core-crypto";
import { fetchKdfParamsForEmail, fetchOwnProfile, signIn } from "@password-manager/api-client";
import type { Database } from "@password-manager/api-client";
import { vaultItemContentSchema, type VaultItemContent } from "@password-manager/core-domain";
import { supabase } from "./supabase.js";

// Hermes has no `crypto.randomUUID` (only `crypto.getRandomValues`, polyfilled
// by react-native-get-random-values — see apps/mobile/index.ts). RFC 4122 v4
// from raw random bytes, same approach the `uuid` package uses internally, so
// this stays a drop-in for `crypto.randomUUID()` without adding a dependency.
function uuidv4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export interface MobileUnlockedSecrets {
  vmk: Uint8Array;
  privateKey: Uint8Array;
  publicKey: string;
}

export async function unlockOnNewDevice(
  email: string,
  masterPassword: string,
  secretKey: string,
): Promise<{ secrets: MobileUnlockedSecrets; profile: Database["public"]["Tables"]["profiles"]["Row"] }> {
  const kdfParams = await fetchKdfParamsForEmail(supabase, email);
  const salt = await fromBase64(kdfParams.kdf_salt);
  const { kek, authLoginSecret } = await deriveKeys(masterPassword, secretKey, salt, {
    algo: "argon2id",
    version: kdfParams.kdf_version as 1,
    opslimit: kdfParams.kdf_opslimit,
    memlimit: kdfParams.kdf_memlimit,
  });

  await signIn(supabase, email, await toBase64(authLoginSecret));

  const profile = await fetchOwnProfile(supabase);
  if (!profile) throw new Error("Signed in but no profile found.");

  const secrets = await unwrapWithKek(profile, kek);
  return { secrets, profile };
}

export async function unlockSameDevice(
  profile: Database["public"]["Tables"]["profiles"]["Row"],
  masterPassword: string,
  secretKey: string,
): Promise<MobileUnlockedSecrets> {
  const salt = await fromBase64(profile.kdf_salt);
  const { kek } = await deriveKeys(masterPassword, secretKey, salt, {
    algo: "argon2id",
    version: profile.kdf_version as 1,
    opslimit: profile.kdf_opslimit,
    memlimit: profile.kdf_memlimit,
  });
  return unwrapWithKek(profile, kek);
}

export async function decryptItemContent(
  row: Database["public"]["Tables"]["vault_items"]["Row"],
  vmk: Uint8Array,
): Promise<VaultItemContent> {
  const itemKey = await unwrapKey(row.wrapped_item_key, vmk);
  const plaintext = await decryptItem(row.content, itemKey);
  return vaultItemContentSchema.parse(JSON.parse(plaintext));
}

/** Encrypts a new item's plaintext content — same envelope-encryption path as
 * apps/web's `encryptNewItem` (build plan §2), deliberately duplicated here
 * rather than shared per this file's header note. Item id is generated
 * client-side so the AAD binding (`${id}:1`) is known before the row exists. */
export async function encryptNewItem(
  content: VaultItemContent,
  vmk: Uint8Array,
): Promise<{
  id: string;
  wrappedItemKey: { nonce: string; ciphertext: string };
  encryptedContent: { nonce: string; ciphertext: string; aad: string };
}> {
  const id = uuidv4();
  const itemKey = await generateRandomKey();
  const wrappedItemKey = await wrapKey(itemKey, vmk);
  const encryptedContent = await encryptItem(JSON.stringify(content), itemKey, `${id}:1`);
  return { id, wrappedItemKey, encryptedContent };
}

/** Re-encrypts an existing item's content on save — item key is reused
 * (unwrapped, then re-wrapped under VMK), only the AAD's version component
 * changes, matching `updateVaultItem`'s optimistic-concurrency bump. */
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

async function unwrapWithKek(
  profile: Database["public"]["Tables"]["profiles"]["Row"],
  kek: Uint8Array,
): Promise<MobileUnlockedSecrets> {
  try {
    const vmk = await unwrapKey(profile.wrapped_vault_key, kek);
    const privateKey = await unwrapKey(profile.wrapped_private_key, vmk);
    return { vmk, privateKey, publicKey: profile.public_key };
  } catch {
    throw new Error("Incorrect master password or Secret Key.");
  }
}
