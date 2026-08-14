import { describe, expect, it } from "vitest";
import {
  boxForRecipient,
  decryptItem,
  encryptItem,
  generateKeypair,
  generateRandomKey,
  openBox,
  toBase64,
  unwrapKey,
  wrapKey,
} from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import { groupSharedByMeByItem, type SharedByMeRow } from "./sharing.js";

// sharing.ts's shareItemWithEmail/fetchSharedWithMe are coupled to the live
// Supabase client (lookupPublicKey/shareItem/listSharedWithMe are network
// calls) and can't be exercised end-to-end without a live project — but the
// exact crypto sequence they perform can be, using the same core-crypto
// calls in the same order. This is the thing that actually matters to get
// right (build plan §2 "Secure sharing (asymmetric)"): the server only ever
// sees ciphertext and re-wrapped keys, never plaintext.

describe("secure sharing — full crypto protocol, sender to recipient", () => {
  it("recipient recovers the exact item content using only their own private key + the sender's public key", async () => {
    // --- Alice's side (owner) ---
    const aliceVmk = await generateRandomKey();
    const alice = await generateKeypair();

    const itemKey = await generateRandomKey();
    const wrappedItemKeyForAlice = await wrapKey(itemKey, aliceVmk);

    const content: LoginContent = {
      kind: "login",
      title: "Shared Wifi",
      username: undefined,
      password: "correct-horse-battery-staple",
      urls: [],
    };
    const encryptedContent = await encryptItem(JSON.stringify(content), itemKey, "item-1:1");

    // --- Bob's side (recipient) — has their own independent keypair ---
    const bob = await generateKeypair();

    // Alice: unwrap with her VMK (what shareItemWithEmail does), then box to
    // Bob's public key using her own private key.
    const unwrappedItemKey = await unwrapKey(wrappedItemKeyForAlice, aliceVmk);
    const wrappedForBob = await boxForRecipient(unwrappedItemKey, bob.publicKey, alice.privateKey);

    // Bob: open the box with Alice's public key + his own private key (what
    // fetchSharedWithMe does), then decrypt the item content.
    const recoveredItemKey = await openBox(wrappedForBob, alice.publicKey, bob.privateKey);
    const plaintext = await decryptItem(encryptedContent, recoveredItemKey);

    expect(JSON.parse(plaintext)).toEqual(content);
    expect(await toBase64(recoveredItemKey)).toEqual(await toBase64(unwrappedItemKey));
  });

  it("a third party's keypair cannot open a box meant for someone else", async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const mallory = await generateKeypair();
    const itemKey = await generateRandomKey();

    const wrappedForBob = await boxForRecipient(itemKey, bob.publicKey, alice.privateKey);

    await expect(openBox(wrappedForBob, alice.publicKey, mallory.privateKey)).rejects.toThrow();
  });

  it("the recipient rejects a box that doesn't actually claim to be from who they think shared it", async () => {
    const alice = await generateKeypair();
    const impostor = await generateKeypair();
    const bob = await generateKeypair();
    const itemKey = await generateRandomKey();

    // Impostor sends a box, but the client is told (incorrectly) it came
    // from Alice — crypto_box's authentication must catch this.
    const wrapped = await boxForRecipient(itemKey, bob.publicKey, impostor.privateKey);
    await expect(openBox(wrapped, alice.publicKey, bob.privateKey)).rejects.toThrow();
  });

  it("multi-recipient: the same item key can be independently boxed to several recipients, and each opens only their own box", async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const carol = await generateKeypair();
    const itemKey = await generateRandomKey();

    const wrappedForBob = await boxForRecipient(itemKey, bob.publicKey, alice.privateKey);
    const wrappedForCarol = await boxForRecipient(itemKey, carol.publicKey, alice.privateKey);

    const bobsKey = await openBox(wrappedForBob, alice.publicKey, bob.privateKey);
    const carolsKey = await openBox(wrappedForCarol, alice.publicKey, carol.privateKey);

    expect(await toBase64(bobsKey)).toEqual(await toBase64(itemKey));
    expect(await toBase64(carolsKey)).toEqual(await toBase64(itemKey));
    // Neither recipient's box works with the other's keypair — sharing with
    // more people doesn't loosen this.
    await expect(openBox(wrappedForBob, alice.publicKey, carol.privateKey)).rejects.toThrow();
    await expect(openBox(wrappedForCarol, alice.publicKey, bob.privateKey)).rejects.toThrow();
  });
});

describe("groupSharedByMeByItem", () => {
  function row(overrides: Partial<SharedByMeRow>): SharedByMeRow {
    return {
      shareId: "share-1",
      itemId: "item-1",
      toUserId: "user-1",
      toEmail: "someone@example.com",
      permission: "read",
      createdAt: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("groups multiple recipients of the same item together, preserving order, and keeps different items separate", () => {
    const rows: SharedByMeRow[] = [
      row({ shareId: "s1", itemId: "item-a", toEmail: "bob@example.com", permission: "read" }),
      row({ shareId: "s2", itemId: "item-b", toEmail: "carol@example.com", permission: "write" }),
      row({ shareId: "s3", itemId: "item-a", toEmail: "dave@example.com", permission: "write" }),
    ];

    const grouped = groupSharedByMeByItem(rows);

    expect(Array.from(grouped.keys())).toEqual(["item-a", "item-b"]);
    expect(grouped.get("item-a")?.map((r) => r.toEmail)).toEqual(["bob@example.com", "dave@example.com"]);
    expect(grouped.get("item-b")?.map((r) => r.toEmail)).toEqual(["carol@example.com"]);
  });

  it("returns an empty map for no shares", () => {
    expect(groupSharedByMeByItem([]).size).toBe(0);
  });
});
