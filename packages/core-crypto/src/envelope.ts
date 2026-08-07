import { getSodium } from "./sodium.js";
import { fromBase64, toBase64 } from "./encoding.js";
import type { ItemCiphertext, WrappedPayload } from "./types.js";

/** Random 256-bit key — used for the Vault Master Key and per-item keys alike. */
export async function generateRandomKey(): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
}

/** Wraps (encrypts) `key` under `wrappingKey` with XChaCha20-Poly1305 and a
 * random 24-byte nonce. Used both for VMK-under-KEK and item-key-under-VMK. */
export async function wrapKey(key: Uint8Array, wrappingKey: Uint8Array): Promise<WrappedPayload> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    key,
    null,
    null,
    nonce,
    wrappingKey,
  );
  return { nonce: await toBase64(nonce), ciphertext: await toBase64(ciphertext) };
}

/** Inverse of `wrapKey`. Throws if `wrappingKey` is wrong or the payload was
 * tampered with — XChaCha20-Poly1305 is AEAD, so authentication failure and
 * decryption failure are the same event. */
export async function unwrapKey(
  wrapped: WrappedPayload,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  const nonce = await fromBase64(wrapped.nonce);
  const ciphertext = await fromBase64(wrapped.ciphertext);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    wrappingKey,
  );
}

/** Encrypts a vault item's plaintext JSON under its own per-item key, binding
 * `aad` (conventionally `${itemId}:${version}`) as additional authenticated
 * data so ciphertext can't be copied onto a different item/version row without
 * decryption failing. See build plan §2 "Envelope encryption for items". */
export async function encryptItem(
  plaintext: string,
  itemKey: Uint8Array,
  aad: string,
): Promise<ItemCiphertext> {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const aadBytes = sodium.from_string(aad);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(plaintext),
    aadBytes,
    null,
    nonce,
    itemKey,
  );
  return {
    nonce: await toBase64(nonce),
    ciphertext: await toBase64(ciphertext),
    aad,
  };
}

export async function decryptItem(
  encrypted: ItemCiphertext,
  itemKey: Uint8Array,
): Promise<string> {
  const sodium = await getSodium();
  const nonce = await fromBase64(encrypted.nonce);
  const ciphertext = await fromBase64(encrypted.ciphertext);
  const aadBytes = sodium.from_string(encrypted.aad);
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    aadBytes,
    nonce,
    itemKey,
  );
  return sodium.to_string(plaintext);
}
