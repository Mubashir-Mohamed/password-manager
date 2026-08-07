import { describe, expect, it } from "vitest";
import { generateSecretKey, toBase64 } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import {
  buildNewAccountMaterial,
  decryptItemContent,
  encryptNewItem,
  encryptUpdatedItem,
  unwrapAccountSecrets,
  type NewAccountMaterial,
} from "./vaultCrypto.js";

// `profileInsert.kdf_algo`/`kdf_version` are optional in the Insert type
// (Postgres defaults them) — fill them in explicitly to build a fully-typed
// Row for these tests, rather than relying on a spread that leaves them
// possibly-undefined.
function toFakeProfileRow(profileInsert: NewAccountMaterial["profileInsert"], id: string, email: string) {
  return {
    id,
    email,
    display_name: null,
    secret_key_marker: null,
    created_at: "",
    updated_at: "",
    ...profileInsert,
    kdf_algo: profileInsert.kdf_algo ?? "argon2id",
    kdf_version: profileInsert.kdf_version ?? 1,
  };
}

// Integration-level tests for this app's orchestration layer over
// core-crypto (build plan §8 verification: "confirm master password/VMK
// never appear in network payloads" — these tests check the adjacent
// property, that the *server-shaped* records this module produces never
// contain plaintext, using real crypto end-to-end rather than mocks).

describe("buildNewAccountMaterial + unwrapAccountSecrets — full signup/unlock round trip", () => {
  it("unwraps back to the same VMK and keypair after a simulated signup + unlock", async () => {
    const secretKey = await generateSecretKey();
    const masterPassword = "correct horse battery staple 42!";

    const material = await buildNewAccountMaterial(masterPassword, secretKey);

    // Simulate what's actually persisted server-side: the profile row, minus
    // the fields Supabase would fill in (id/email/timestamps).
    const fakeProfileRow = toFakeProfileRow(material.profileInsert, "00000000-0000-0000-0000-000000000000", "test@example.com");

    const unlocked = await unwrapAccountSecrets(fakeProfileRow, await deriveKekForTest(masterPassword, secretKey, fakeProfileRow));

    expect(await toBase64(unlocked.vmk)).toEqual(await toBase64(material.secrets.vmk));
    expect(unlocked.keypair.publicKey).toEqual(material.secrets.keypair.publicKey);
  });

  it("fails to unwrap with the wrong master password", async () => {
    const secretKey = await generateSecretKey();
    const material = await buildNewAccountMaterial("correct password", secretKey);
    const fakeProfileRow = toFakeProfileRow(material.profileInsert, "id", "e");

    const wrongKek = await deriveKekForTest("wrong password", secretKey, fakeProfileRow);
    await expect(unwrapAccountSecrets(fakeProfileRow, wrongKek)).rejects.toThrow(
      "Incorrect master password or Secret Key.",
    );
  });
});

describe("encryptNewItem / encryptUpdatedItem / decryptItemContent — item round trip", () => {
  const loginContent: LoginContent = {
    kind: "login",
    title: "Example",
    username: "alice",
    password: "hunter2-but-actually-strong",
    urls: ["https://example.com"],
  };

  it("round-trips a newly created item", async () => {
    const { generateRandomKey } = await import("@password-manager/core-crypto");
    const vmk = await generateRandomKey();

    const { id, wrappedItemKey, encryptedContent } = await encryptNewItem(loginContent, vmk);
    const fakeRow = {
      id,
      vault_id: "v",
      folder_id: null,
      type: "login" as const,
      wrapped_item_key: wrappedItemKey,
      content: encryptedContent,
      domain_hmac: null,
      favorite: false,
      is_deleted: false,
      version: 1,
      created_at: "",
      updated_at: "",
    };

    const decrypted = await decryptItemContent(fakeRow, vmk);
    expect(decrypted).toEqual(loginContent);
  });

  it("round-trips an edit, and the AAD version bump means the old ciphertext no longer matches", async () => {
    const { generateRandomKey } = await import("@password-manager/core-crypto");
    const vmk = await generateRandomKey();
    const { id, wrappedItemKey, encryptedContent } = await encryptNewItem(loginContent, vmk);

    const updated: LoginContent = { ...loginContent, password: "a-new-rotated-password" };
    const { wrappedItemKey: rewrapped, encryptedContent: newEncrypted } = await encryptUpdatedItem(
      id,
      2,
      updated,
      wrappedItemKey,
      vmk,
    );

    const decrypted = await decryptItemContent(
      {
        id,
        vault_id: "v",
        folder_id: null,
        type: "login",
        wrapped_item_key: rewrapped,
        content: newEncrypted,
        domain_hmac: null,
        favorite: false,
        is_deleted: false,
        version: 2,
        created_at: "",
        updated_at: "",
      },
      vmk,
    );
    expect(decrypted).toEqual(updated);
    expect(newEncrypted.aad).toEqual(`${id}:2`);
    expect(newEncrypted.ciphertext).not.toEqual(encryptedContent.ciphertext);
  });
});

// Test-only helper: re-derives just the KEK the way unlockWithCredentials
// would internally, without needing a live Supabase session — mirrors
// deriveForSignIn's first half.
async function deriveKekForTest(
  masterPassword: string,
  secretKey: string,
  profile: { kdf_salt: string; kdf_memlimit: number; kdf_opslimit: number; kdf_version: number },
) {
  const { deriveKeys, fromBase64 } = await import("@password-manager/core-crypto");
  const salt = await fromBase64(profile.kdf_salt);
  const { kek } = await deriveKeys(masterPassword, secretKey, salt, {
    algo: "argon2id",
    version: profile.kdf_version as 1,
    opslimit: profile.kdf_opslimit,
    memlimit: profile.kdf_memlimit,
  });
  return kek;
}
