export { getSodium } from "./sodium.js";
export type { Sodium } from "./sodium.js";

export { toBase64, fromBase64, utf8ToBytes, bytesToUtf8 } from "./encoding.js";

export { KDF_PROFILES, generateKdfSalt, deriveKeys, deriveExportKey } from "./kdf.js";

export { generateSecretKey, normalizeSecretKey } from "./secretKey.js";

export {
  generateRandomKey,
  wrapKey,
  unwrapKey,
  encryptItem,
  decryptItem,
} from "./envelope.js";

export { generateKeypair, boxForRecipient, openBox } from "./keypair.js";

export {
  generateTotpSecret,
  currentTotpCode,
  hotpCode,
  otpauthUri,
} from "./totp.js";
export type { TotpCodeInfo } from "./totp.js";

export type { KdfParams, WrappedPayload, ItemCiphertext, Keypair, DerivedKeys } from "./types.js";
