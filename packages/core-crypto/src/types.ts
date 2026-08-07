/** Argon2id parameters used to stretch the master password. Versioned and stored
 * per-user (see supabase/migrations/0001_init.sql `profiles.kdf_*`) so they can be
 * upgraded for a given account without breaking existing ones. */
export interface KdfParams {
  algo: "argon2id";
  version: 1;
  /** libsodium opslimit (iteration count). */
  opslimit: number;
  /** libsodium memlimit in bytes. */
  memlimit: number;
}

/** A symmetric key wrapped (encrypted) under another key via XChaCha20-Poly1305.
 * Stored as base64url strings — see `encoding.ts`. */
export interface WrappedPayload {
  nonce: string;
  ciphertext: string;
}

/** Ciphertext for a vault item's content, bound to `aad` (id+version) so it can't
 * be swapped onto a different item record server-side. */
export interface ItemCiphertext {
  nonce: string;
  ciphertext: string;
  aad: string;
}

export interface Keypair {
  publicKey: string; // base64url
  privateKey: Uint8Array; // caller wraps this with the VMK before persisting
}

/** The two domain-separated secrets derived from a user's master password +
 * Secret Key. See docs/design + build plan §2 "Key derivation & domain separation". */
export interface DerivedKeys {
  /** Wraps the Vault Master Key. Never leaves the device. */
  kek: Uint8Array;
  /** Sent to Supabase Auth in place of the real master password. Supabase only
   * ever sees/bcrypt-hashes this domain-separated derivative. */
  authLoginSecret: Uint8Array;
}
