import { getSodium } from "./sodium.js";

/** base64url, no padding — compact and safe to store directly in Postgres text
 * columns / URLs without further escaping. */
export async function toBase64(bytes: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

export async function fromBase64(b64: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.from_base64(b64, sodium.base64_variants.URLSAFE_NO_PADDING);
}

export async function utf8ToBytes(text: string): Promise<Uint8Array> {
  const sodium = await getSodium();
  return sodium.from_string(text);
}

export async function bytesToUtf8(bytes: Uint8Array): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_string(bytes);
}
