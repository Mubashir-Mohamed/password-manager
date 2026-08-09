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
      wrapped_item_key: params.wrappedItemKeyForRecipient,
      permission: params.permission ?? "read",
    })
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
