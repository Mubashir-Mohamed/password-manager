import { getSodium } from "./sodium.js";
import type { DerivedKeys, KdfParams } from "./types.js";

/** Baselines from the build plan §2 — desktop/web can afford heavier Argon2id
 * params than mobile/extension, where unlock latency matters more and memory
 * is more constrained. Both are "argon2id" so the same verifier code path works
 * everywhere; only the cost parameters differ. */
export const KDF_PROFILES: Record<"interactive" | "moderate", KdfParams> = {
  moderate: {
    algo: "argon2id",
    version: 1,
    opslimit: 3,
    memlimit: 256 * 1024 * 1024, // 256 MiB
  },
  interactive: {
    algo: "argon2id",
    version: 1,
    opslimit: 2,
    memlimit: 64 * 1024 * 1024, // 64 MiB
  },
};

// crypto_kdf_derive_from_key (libsodium's Blake2b-based multi-subkey KDF) is used
// instead of HKDF-SHA256 for domain separation: this build of libsodium.js only
// exports the crypto_kdf_hkdf_sha256_* *constants*, not the extract/expand
// functions themselves (verified at runtime against the installed package —
// they're absent from the wrapped symbol table). crypto_kdf_derive_from_key is
// the standard libsodium primitive for exactly this "derive N keys from 1
// master key" use case and ships in every build, so it's used here instead of
// reaching for a hand-rolled HKDF implementation. Context strings must be
// exactly crypto_kdf_CONTEXTBYTES (8) ASCII bytes.
const STRETCHED_KEY_LEN = 32; // must equal crypto_kdf_KEYBYTES for the derive step below
const KDF_CONTEXT_KEK = "vaultkek"; // 8 bytes
const KDF_CONTEXT_AUTH = "authlgin"; // 8 bytes
const KDF_SUBKEY_ID = 1n;

export async function generateKdfSalt(): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
}

/** Argon2id-stretches `masterPassword + secretKey` into a single 32-byte key,
 * then splits it into two domain-separated secrets (via `crypto_kdf_derive_from_key`,
 * see note above) so a compromise of one can never be replayed as the other.
 * See build plan §2, steps 2–3. */
export async function deriveKeys(
  masterPassword: string,
  secretKey: string,
  salt: Uint8Array,
  params: KdfParams = KDF_PROFILES.moderate,
): Promise<DerivedKeys> {
  const sodium = await getSodium();

  if (salt.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error(
      `kdf_salt must be ${sodium.crypto_pwhash_SALTBYTES} bytes, got ${salt.length}`,
    );
  }

  // Master password and Secret Key are combined before stretching — a database
  // leak plus a weak master password alone is not enough to brute-force the
  // vault offline; the attacker also needs the Secret Key, which the server
  // never sees. See build plan §2 point 5.
  const combinedInput = sodium.from_string(`${masterPassword}:${secretKey}`);

  const stretchedKey = sodium.crypto_pwhash(
    STRETCHED_KEY_LEN,
    combinedInput,
    salt,
    params.opslimit,
    params.memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );

  const kek = sodium.crypto_kdf_derive_from_key(32, KDF_SUBKEY_ID, KDF_CONTEXT_KEK, stretchedKey);
  const authLoginSecret = sodium.crypto_kdf_derive_from_key(
    32,
    KDF_SUBKEY_ID,
    KDF_CONTEXT_AUTH,
    stretchedKey,
  );

  sodium.memzero(stretchedKey);
  sodium.memzero(combinedInput);

  return { kek, authLoginSecret };
}

/** Single-purpose Argon2id KDF for the encrypted vault export/import feature
 * (build plan §4/§5 "export (encrypted JSON)"). Deliberately independent of
 * `deriveKeys`/the vault master password hierarchy — an export file has its
 * own password, unrelated to the account's Secret Key, so there's no
 * domain-separation step needed here: one password in, one key out. */
export async function deriveExportKey(
  exportPassword: string,
  salt: Uint8Array,
  params: KdfParams = KDF_PROFILES.moderate,
): Promise<Uint8Array> {
  const sodium = await getSodium();

  if (salt.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error(
      `export salt must be ${sodium.crypto_pwhash_SALTBYTES} bytes, got ${salt.length}`,
    );
  }

  const passwordBytes = sodium.from_string(exportPassword);
  const key = sodium.crypto_pwhash(
    32,
    passwordBytes,
    salt,
    params.opslimit,
    params.memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  sodium.memzero(passwordBytes);
  return key;
}
