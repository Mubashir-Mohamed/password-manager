// Mobile's own thin orchestration layer over @password-manager/core-crypto —
// same two-phase unlock pattern as apps/web and apps/browser-extension
// (deliberately duplicated per-app, not shared — see those files' headers).
// The only difference on this platform: core-crypto transparently resolves
// to sodium.native.ts (react-native-libsodium) instead of the WASM build,
// via Metro's automatic `.native.ts` resolution — no code here needs to know
// that.
import { decryptItem, deriveKeys, fromBase64, toBase64, unwrapKey } from "@password-manager/core-crypto";
import { fetchKdfParamsForEmail, fetchOwnProfile, signIn } from "@password-manager/api-client";
import type { Database } from "@password-manager/api-client";
import { vaultItemContentSchema, type VaultItemContent } from "@password-manager/core-domain";
import { supabase } from "./supabase.js";

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
