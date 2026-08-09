import { describe, expect, it, vi } from "vitest";
import { generateRandomKey } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";

// vaultCrypto.ts imports the module-level `supabase` singleton (for
// unlockOnNewDevice/unlockSameDevice) even though the functions under test
// here are pure. Stub it out rather than let the real
// createPasswordManagerClient() run — under plain Node (no native
// WebSocket below v22) it throws trying to set up its Realtime client, and
// these tests need no live client at all.
vi.mock("./supabase.js", () => ({ supabase: {} }));

const { decryptItemContent, encryptNewItem, encryptUpdatedItem } = await import("./vaultCrypto.js");

// Mirrors apps/web's vaultCrypto.test.ts "item round trip" cases — this app
// duplicates the orchestration layer per that file's header note, so it gets
// its own coverage rather than relying on web's tests to catch a regression
// here. unlockOnNewDevice/unlockSameDevice aren't covered here since they
// require a live Supabase client; encryptNewItem/encryptUpdatedItem/
// decryptItemContent are pure and the part genuinely new to this file.
describe("encryptNewItem / encryptUpdatedItem / decryptItemContent — item round trip", () => {
  const loginContent: LoginContent = {
    kind: "login",
    title: "Example",
    username: "alice",
    password: "hunter2-but-actually-strong",
    urls: ["https://example.com"],
  };

  it("round-trips a newly created item, with a valid v4 UUID id", async () => {
    const vmk = await generateRandomKey();

    const { id, wrappedItemKey, encryptedContent } = await encryptNewItem(loginContent, vmk);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

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

  it("generates unique ids across calls", async () => {
    const vmk = await generateRandomKey();
    const a = await encryptNewItem(loginContent, vmk);
    const b = await encryptNewItem(loginContent, vmk);
    expect(a.id).not.toEqual(b.id);
  });
});
