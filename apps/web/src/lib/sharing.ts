// App-specific orchestration over @password-manager/core-crypto's secure-
// sharing primitives (build plan §2 "Secure sharing (asymmetric)" / §7 step
// 5) — same per-app pattern as vaultCrypto.ts and vaultExport.ts.
import { boxForRecipient, decryptItem, openBox, unwrapKey } from "@password-manager/core-crypto";
import {
  fetchVaultItemsByIds,
  listSharedByMe,
  listSharedWithMe,
  lookupPublicKey,
  revokeShare,
  shareItem,
  type Database,
  type PasswordManagerClient,
} from "@password-manager/api-client";
import { vaultItemContentSchema, type VaultItemContent } from "@password-manager/core-domain";

export type ShareOutcome =
  | { shared: true }
  | { shared: false; reason: "not-found" | "self" | "error" };

/** Shares one vault item with another user by email. Unwraps the item's key
 * with the sender's own VMK, then re-wraps it to the recipient's public key
 * via `crypto_box` — the server never sees the plaintext item key. */
export async function shareItemWithEmail(
  client: PasswordManagerClient,
  params: {
    itemId: string;
    itemWrappedKey: Database["public"]["Tables"]["vault_items"]["Row"]["wrapped_item_key"];
    recipientEmail: string;
    vmk: Uint8Array;
    myUserId: string;
    myPublicKey: string;
    myPrivateKey: Uint8Array;
  },
): Promise<ShareOutcome> {
  const lookup = await lookupPublicKey(client, params.recipientEmail);
  if (!lookup.found) return { shared: false, reason: "not-found" };
  if (lookup.userId === params.myUserId) return { shared: false, reason: "self" };

  try {
    const itemKey = await unwrapKey(params.itemWrappedKey, params.vmk);
    const wrappedForRecipient = await boxForRecipient(itemKey, lookup.publicKey, params.myPrivateKey);
    await shareItem(client, {
      itemId: params.itemId,
      fromUserId: params.myUserId,
      fromPublicKey: params.myPublicKey,
      toUserId: lookup.userId,
      wrappedItemKeyForRecipient: wrappedForRecipient,
    });
    return { shared: true };
  } catch {
    return { shared: false, reason: "error" };
  }
}

export { revokeShare };

export interface SharedByMeRow {
  shareId: string;
  itemId: string;
  toUserId: string;
  permission: "read" | "write";
  createdAt: string;
}

export async function fetchSharedByMe(client: PasswordManagerClient, myUserId: string): Promise<SharedByMeRow[]> {
  const rows = await listSharedByMe(client, myUserId);
  return rows
    .filter((r) => !r.revoked_at)
    .map((r) => ({ shareId: r.id, itemId: r.item_id, toUserId: r.to_user_id, permission: r.permission, createdAt: r.created_at }));
}

export interface SharedWithMeItem {
  shareId: string;
  row: Database["public"]["Tables"]["vault_items"]["Row"];
  content: VaultItemContent;
  permission: "read" | "write";
}

/** Fetches and decrypts everything currently shared with the caller. Opens
 * each item's `crypto_box` with the sender's public key (denormalized onto
 * `shared_items` — see 0005_shared_items_sender_public_key.sql) and the
 * caller's own private key, then decrypts the item content with the
 * recovered item key. One bad row (revoked mid-fetch, sender key mismatch)
 * is skipped rather than failing the whole list. */
export async function fetchSharedWithMe(
  client: PasswordManagerClient,
  myPrivateKey: Uint8Array,
): Promise<SharedWithMeItem[]> {
  const shares = await listSharedWithMe(client);
  if (shares.length === 0) return [];

  const rows = await fetchVaultItemsByIds(client, shares.map((s) => s.item_id));
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const results: SharedWithMeItem[] = [];
  for (const share of shares) {
    const row = rowById.get(share.item_id);
    if (!row) continue;
    try {
      const itemKey = await openBox(share.wrapped_item_key, share.from_public_key, myPrivateKey);
      const plaintext = await decryptItem(row.content, itemKey);
      const content = vaultItemContentSchema.parse(JSON.parse(plaintext));
      results.push({ shareId: share.id, row, content, permission: share.permission });
    } catch {
      // Skip — shouldn't happen with a valid keypair, but one bad share
      // (e.g. a race with revocation) must not break the rest of the list.
    }
  }
  return results;
}
