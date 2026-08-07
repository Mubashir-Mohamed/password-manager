import { getSodium } from "./sodium.js";
import { fromBase64, toBase64 } from "./encoding.js";
import type { Keypair, WrappedPayload } from "./types.js";

/** Generates a user's X25519 keypair for secure sharing. The public key is
 * stored in plaintext (`profiles.public_key`); the private key must be wrapped
 * with the user's VMK (`wrapKey`) before it's ever persisted. */
export async function generateKeypair(): Promise<Keypair> {
  const sodium = await getSodium();
  const kp = sodium.crypto_box_keypair();
  return { publicKey: await toBase64(kp.publicKey), privateKey: kp.privateKey };
}

/** Re-wraps an already-unwrapped item key to a recipient's public key using
 * `crypto_box` (authenticated, not an anonymous sealed box) so the recipient
 * can verify who shared the item with them. Neither Supabase nor an attacker
 * with DB access ever sees the plaintext item key or content — see build plan
 * §2 "Secure sharing (asymmetric)". */
export async function boxForRecipient(
  itemKey: Uint8Array,
  recipientPublicKeyB64: string,
  senderPrivateKey: Uint8Array,
): Promise<WrappedPayload> {
  const sodium = await getSodium();
  const recipientPublicKey = await fromBase64(recipientPublicKeyB64);
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(
    itemKey,
    nonce,
    recipientPublicKey,
    senderPrivateKey,
  );
  return { nonce: await toBase64(nonce), ciphertext: await toBase64(ciphertext) };
}

/** Recipient-side: recovers the shared item key, verifying it genuinely came
 * from `senderPublicKey`. Throws if the sender key doesn't match or the
 * payload was tampered with. */
export async function openBox(
  wrapped: WrappedPayload,
  senderPublicKeyB64: string,
  recipientPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();
  const senderPublicKey = await fromBase64(senderPublicKeyB64);
  const nonce = await fromBase64(wrapped.nonce);
  const ciphertext = await fromBase64(wrapped.ciphertext);
  return sodium.crypto_box_open_easy(ciphertext, nonce, senderPublicKey, recipientPrivateKey);
}
