import type { PasswordManagerClient } from "./client.js";
import type { Database } from "./database.types.js";

type VaultItemRow = Database["public"]["Tables"]["vault_items"]["Row"];
type VaultItemInsert = Database["public"]["Tables"]["vault_items"]["Insert"];

export async function createVault(client: PasswordManagerClient, ownerId: string, name = "My Vault") {
  const { data, error } = await client
    .from("vaults")
    .insert({ owner_id: ownerId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listVaults(client: PasswordManagerClient) {
  const { data, error } = await client.from("vaults").select("*").order("created_at");
  if (error) throw error;
  return data;
}

/** Fetches the encrypted rows for a vault — decryption happens entirely
 * client-side via core-crypto, never here. `is_deleted` tombstones are
 * excluded by default since they only matter for sync reconciliation. */
export async function listVaultItems(
  client: PasswordManagerClient,
  vaultId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<VaultItemRow[]> {
  let query = client.from("vault_items").select("*").eq("vault_id", vaultId);
  if (!opts.includeDeleted) query = query.eq("is_deleted", false);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Fetches specific vault_items rows by id, regardless of which vault they
 * belong to — for the "shared with me" case, where the caller doesn't own
 * the vault and can't list it via `listVaultItems`, but RLS's
 * `vault_items_select_owner_or_shared` policy still lets them SELECT the
 * specific rows a non-revoked share grants them. */
export async function fetchVaultItemsByIds(
  client: PasswordManagerClient,
  itemIds: string[],
): Promise<VaultItemRow[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await client.from("vault_items").select("*").in("id", itemIds);
  if (error) throw error;
  return data;
}

export async function createVaultItem(client: PasswordManagerClient, item: VaultItemInsert) {
  const { data, error } = await client.from("vault_items").insert(item).select().single();
  if (error) throw error;
  return data;
}

/** Optimistic-concurrency update: only succeeds if `expectedVersion` still
 * matches the row's current `version` — the caller should treat a 0-row
 * result as a conflict to resolve (build plan §4 Realtime "Conflict handling"). */
export async function updateVaultItem(
  client: PasswordManagerClient,
  itemId: string,
  expectedVersion: number,
  patch: Partial<Pick<VaultItemInsert, "wrapped_item_key" | "content" | "folder_id" | "favorite">>,
) {
  const { data, error } = await client
    .from("vault_items")
    .update({ ...patch, version: expectedVersion + 1 })
    .eq("id", itemId)
    .eq("version", expectedVersion)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data; // null => version conflict, caller should refetch and re-apply
}

export async function softDeleteVaultItem(client: PasswordManagerClient, itemId: string) {
  const { error } = await client.from("vault_items").update({ is_deleted: true }).eq("id", itemId);
  if (error) throw error;
}

export async function createFolder(
  client: PasswordManagerClient,
  vaultId: string,
  nameEncrypted: Database["public"]["Tables"]["folders"]["Row"]["name_encrypted"],
  parentId: string | null = null,
) {
  const { data, error } = await client
    .from("folders")
    .insert({ vault_id: vaultId, name_encrypted: nameEncrypted, parent_id: parentId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listFolders(client: PasswordManagerClient, vaultId: string) {
  const { data, error } = await client.from("folders").select("*").eq("vault_id", vaultId);
  if (error) throw error;
  return data;
}
