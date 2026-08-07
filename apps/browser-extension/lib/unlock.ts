// App-specific unlock orchestration over @password-manager/core-crypto — same
// two-phase pattern as apps/web/src/lib/vaultCrypto.ts (deliberately
// duplicated rather than shared: each app surface owns its own thin
// orchestration layer over the shared crypto primitives, per the build
// plan's monorepo boundaries).
import { deriveKeys, fromBase64, toBase64, unwrapKey } from "@password-manager/core-crypto";
import { fetchKdfParamsForEmail, fetchOwnProfile, signIn } from "@password-manager/api-client";
import { supabase } from "./supabase.js";
import { setSession } from "./session.js";

export async function unlockAndStartSession(
  email: string,
  masterPassword: string,
  secretKey: string,
): Promise<{ vaultId: string | null }> {
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

  let vmk: Uint8Array;
  let privateKey: Uint8Array;
  try {
    vmk = await unwrapKey(profile.wrapped_vault_key, kek);
    privateKey = await unwrapKey(profile.wrapped_private_key, vmk);
  } catch {
    throw new Error("Incorrect master password or Secret Key.");
  }

  const { data: vaults } = await supabase.from("vaults").select("id").limit(1);
  const vaultId = vaults?.[0]?.id ?? null;

  await setSession({
    vmkB64: await toBase64(vmk),
    privateKeyB64: await toBase64(privateKey),
    publicKey: profile.public_key,
    userId: profile.id,
    vaultId: vaultId ?? "",
  });

  return { vaultId };
}
