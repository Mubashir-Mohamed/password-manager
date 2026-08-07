import { describe, expect, it } from "vitest";
import {
  KDF_PROFILES,
  boxForRecipient,
  currentTotpCode,
  decryptItem,
  deriveKeys,
  encryptItem,
  fromBase64,
  generateKdfSalt,
  generateKeypair,
  generateRandomKey,
  generateSecretKey,
  hotpCode,
  normalizeSecretKey,
  openBox,
  toBase64,
  unwrapKey,
  wrapKey,
} from "./index.js";

// Fast params for the test suite — production uses KDF_PROFILES.moderate/interactive,
// but 256MiB Argon2id per test case would make the suite unusably slow.
const TEST_KDF_PARAMS = { algo: "argon2id" as const, version: 1 as const, opslimit: 1, memlimit: 8 * 1024 * 1024 };

describe("deriveKeys — Argon2id + HKDF domain separation", () => {
  it("is deterministic for identical inputs", async () => {
    const salt = await generateKdfSalt();
    const a = await deriveKeys("correct horse battery staple", "SK-TEST", salt, TEST_KDF_PARAMS);
    const b = await deriveKeys("correct horse battery staple", "SK-TEST", salt, TEST_KDF_PARAMS);
    expect(await toBase64(a.kek)).toEqual(await toBase64(b.kek));
    expect(await toBase64(a.authLoginSecret)).toEqual(await toBase64(b.authLoginSecret));
  });

  it("produces different keys for different salts (same password)", async () => {
    const saltA = await generateKdfSalt();
    const saltB = await generateKdfSalt();
    const a = await deriveKeys("same password", "SK-TEST", saltA, TEST_KDF_PARAMS);
    const b = await deriveKeys("same password", "SK-TEST", saltB, TEST_KDF_PARAMS);
    expect(await toBase64(a.kek)).not.toEqual(await toBase64(b.kek));
  });

  it("produces different keys for different Secret Keys (same password)", async () => {
    const salt = await generateKdfSalt();
    const a = await deriveKeys("same password", "SK-AAAA", salt, TEST_KDF_PARAMS);
    const b = await deriveKeys("same password", "SK-BBBB", salt, TEST_KDF_PARAMS);
    expect(await toBase64(a.kek)).not.toEqual(await toBase64(b.kek));
  });

  it("domain-separates KEK from authLoginSecret — critical: Supabase must never see KEK-equivalent material", async () => {
    const salt = await generateKdfSalt();
    const { kek, authLoginSecret } = await deriveKeys("hunter2", "SK-TEST", salt, TEST_KDF_PARAMS);
    expect(await toBase64(kek)).not.toEqual(await toBase64(authLoginSecret));
  });

  it("rejects a malformed salt length", async () => {
    await expect(
      deriveKeys("pw", "sk", new Uint8Array(4), TEST_KDF_PARAMS),
    ).rejects.toThrow();
  });

  it("exposes both production KDF profiles with moderate stronger than interactive", () => {
    expect(KDF_PROFILES.moderate.memlimit).toBeGreaterThan(KDF_PROFILES.interactive.memlimit);
  });
});

describe("envelope encryption — key wrapping", () => {
  it("round-trips a wrapped key", async () => {
    const wrappingKey = await generateRandomKey();
    const secretKey = await generateRandomKey();
    const wrapped = await wrapKey(secretKey, wrappingKey);
    const unwrapped = await unwrapKey(wrapped, wrappingKey);
    expect(await toBase64(unwrapped)).toEqual(await toBase64(secretKey));
  });

  it("fails to unwrap with the wrong wrapping key", async () => {
    const wrappingKey = await generateRandomKey();
    const wrongKey = await generateRandomKey();
    const secretKey = await generateRandomKey();
    const wrapped = await wrapKey(secretKey, wrappingKey);
    await expect(unwrapKey(wrapped, wrongKey)).rejects.toThrow();
  });

  it("fails to unwrap tampered ciphertext (AEAD authentication)", async () => {
    const wrappingKey = await generateRandomKey();
    const secretKey = await generateRandomKey();
    const wrapped = await wrapKey(secretKey, wrappingKey);
    const bytes = await fromBase64(wrapped.ciphertext);
    bytes[0] = bytes[0]! ^ 0xff; // flip a bit
    const tampered = { ...wrapped, ciphertext: await toBase64(bytes) };
    await expect(unwrapKey(tampered, wrappingKey)).rejects.toThrow();
  });
});

describe("envelope encryption — item content", () => {
  it("round-trips item plaintext", async () => {
    const itemKey = await generateRandomKey();
    const plaintext = JSON.stringify({ username: "alice", password: "correct-horse" });
    const encrypted = await encryptItem(plaintext, itemKey, "item-123:1");
    const decrypted = await decryptItem(encrypted, itemKey);
    expect(decrypted).toEqual(plaintext);
  });

  it("rejects decryption when the AAD (item id/version) doesn't match — blocks ciphertext-swap attacks", async () => {
    const itemKey = await generateRandomKey();
    const encrypted = await encryptItem("{}", itemKey, "item-123:1");
    const swapped = { ...encrypted, aad: "item-456:1" };
    await expect(decryptItem(swapped, itemKey)).rejects.toThrow();
  });
});

describe("secure sharing — X25519 keypairs", () => {
  it("round-trips a shared item key between sender and recipient", async () => {
    const sender = await generateKeypair();
    const recipient = await generateKeypair();
    const itemKey = await generateRandomKey();

    const boxed = await boxForRecipient(itemKey, recipient.publicKey, sender.privateKey);
    const opened = await openBox(boxed, sender.publicKey, recipient.privateKey);

    expect(await toBase64(opened)).toEqual(await toBase64(itemKey));
  });

  it("fails when the recipient uses the wrong private key", async () => {
    const sender = await generateKeypair();
    const recipient = await generateKeypair();
    const impostor = await generateKeypair();
    const itemKey = await generateRandomKey();

    const boxed = await boxForRecipient(itemKey, recipient.publicKey, sender.privateKey);
    await expect(openBox(boxed, sender.publicKey, impostor.privateKey)).rejects.toThrow();
  });

  it("fails when the claimed sender public key doesn't match who actually sent it", async () => {
    const sender = await generateKeypair();
    const impostor = await generateKeypair();
    const recipient = await generateKeypair();
    const itemKey = await generateRandomKey();

    const boxed = await boxForRecipient(itemKey, recipient.publicKey, sender.privateKey);
    // Recipient is told it came from `impostor` — must fail to authenticate.
    await expect(openBox(boxed, impostor.publicKey, recipient.privateKey)).rejects.toThrow();
  });
});

describe("Secret Key generation", () => {
  it("produces a formatted, normalizable Secret Key", async () => {
    const sk = await generateSecretKey();
    expect(sk).toMatch(/^[A-Z0-9]{2}(-[A-Z0-9]{6}){4}$/);
    const normalized = normalizeSecretKey(sk.toLowerCase());
    expect(normalized).toEqual(sk.replace(/-/g, ""));
  });

  it("is random across generations", async () => {
    const a = await generateSecretKey();
    const b = await generateSecretKey();
    expect(a).not.toEqual(b);
  });
});

describe("TOTP — RFC 6238 known-answer tests", () => {
  // RFC 6238 Appendix B test vectors, SHA1 mode, 8-digit codes.
  // Secret (ASCII "12345678901234567890") base32-encoded.
  const RFC_SECRET_SHA1 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it.each([
    { time: 59, expected: "94287082" },
    { time: 1111111109, expected: "07081804" },
    { time: 1111111111, expected: "14050471" },
    { time: 1234567890, expected: "89005924" },
    { time: 2000000000, expected: "69279037" },
  ])("matches RFC 6238 vector at T=$time", ({ time, expected }) => {
    const { code } = currentTotpCode(
      RFC_SECRET_SHA1,
      { digits: 8, period: 30, algorithm: "SHA1" },
      time * 1000,
    );
    expect(code).toEqual(expected);
  });

  it("HOTP counter step matches the TOTP T=59 vector (T=59 → counter 1 at period 30)", () => {
    const code = hotpCode(RFC_SECRET_SHA1, 1, { digits: 8, algorithm: "SHA1" });
    expect(code).toEqual("94287082");
  });

  it("rotates to a different code once the period boundary passes", () => {
    const a = currentTotpCode(RFC_SECRET_SHA1, { digits: 8 }, 59_000);
    const b = currentTotpCode(RFC_SECRET_SHA1, { digits: 8 }, 89_000); // next 30s window
    expect(a.code).not.toEqual(b.code);
  });
});
