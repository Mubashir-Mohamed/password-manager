import type { PasswordManagerClient } from "./client.js";
import type { Database } from "./database.types.js";

type WrappedPayloadRow = Database["public"]["Tables"]["shared_items"]["Row"]["wrapped_item_key"];

/** Resolves an email to `{ userId, publicKey }` via the enumeration-resistant
 * Edge Function (never a direct table query — RLS wouldn't allow it anyway).
 * See build plan §4 "lookup-public-key". */
export async function lookupPublicKey(
  client: PasswordManagerClient,
  email: string,
): Promise<{ found: false } | { found: true; userId: string; publicKey: string }> {
  const { data, error } = await client.functions.invoke("lookup-public-key", { body: { email } });
  if (error) throw error;
  return data;
}

/** Postgres error code for a unique-constraint violation — 0008's partial
 * unique index (`shared_items_active_recipient_idx`) rejects a second active
 * share to the same item+recipient with exactly this code, which `shareItem`
 * surfaces on `error.code` (PostgREST passes the underlying pg error code
 * straight through) so callers can distinguish "already shared, bump the
 * permission instead" from a real failure. */
export const UNIQUE_VIOLATION = "23505";

export async function shareItem(
  client: PasswordManagerClient,
  params: {
    itemId: string;
    fromUserId: string;
    /** Sender's own X25519 public key — stored on the row so the recipient
     * can open the crypto_box without needing SELECT access to the sender's
     * profiles row (see 0005_shared_items_sender_public_key.sql). */
    fromPublicKey: string;
    toUserId: string;
    /** Recipient's email, lowercased — denormalized onto the row for the
     * same reason as `fromPublicKey` (see 0008_shared_items_recipient_
     * email_and_dedup.sql). Already known to the caller: it's what
     * `lookupPublicKey` was just called with. */
    toEmail: string;
    wrappedItemKeyForRecipient: WrappedPayloadRow; // built with core-crypto's boxForRecipient()
    permission?: "read" | "write";
  },
) {
  const { data, error } = await client
    .from("shared_items")
    .insert({
      item_id: params.itemId,
      from_user_id: params.fromUserId,
      from_public_key: params.fromPublicKey,
      to_user_id: params.toUserId,
      to_email: params.toEmail,
      wrapped_item_key: params.wrappedItemKeyForRecipient,
      permission: params.permission ?? "read",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Changes the permission level of an existing, still-active share — used
 * both for an explicit "make this read/write" action and as the fallback
 * when `shareItem` hits 0008's unique-index conflict (already shared with
 * this recipient; the caller's intent is "update the access level", not "add
 * a duplicate row"). */
export async function updateSharePermission(
  client: PasswordManagerClient,
  itemId: string,
  toUserId: string,
  permission: "read" | "write",
) {
  const { data, error } = await client
    .from("shared_items")
    .update({ permission })
    .eq("item_id", itemId)
    .eq("to_user_id", toUserId)
    .is("revoked_at", null)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function revokeShare(client: PasswordManagerClient, shareId: string) {
  const { error } = await client
    .from("shared_items")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);
  if (error) throw error;
}

export async function listSharedWithMe(client: PasswordManagerClient) {
  const { data, error } = await client
    .from("shared_items")
    .select("*")
    .is("revoked_at", null);
  if (error) throw error;
  return data;
}

export async function listSharedByMe(client: PasswordManagerClient, fromUserId: string) {
  const { data, error } = await client
    .from("shared_items")
    .select("*")
    .eq("from_user_id", fromUserId);
  if (error) throw error;
  return data;
}
