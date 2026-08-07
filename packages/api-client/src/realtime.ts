import type { PasswordManagerClient } from "./client.js";
import type { Database } from "./database.types.js";

type VaultItemRow = Database["public"]["Tables"]["vault_items"]["Row"];

/** Cross-device sync (build plan §4 Realtime): subscribes to `postgres_changes`
 * for a vault's items, RLS-scoped automatically by Supabase Realtime. Caller
 * decrypts locally and merges into its cache — this module only moves
 * ciphertext + metadata, never touches plaintext. Returns an unsubscribe fn. */
export function subscribeToVaultItems(
  client: PasswordManagerClient,
  vaultId: string,
  onChange: (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; row: VaultItemRow | null }) => void,
): () => void {
  const channel = client
    .channel(`vault_items:${vaultId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vault_items", filter: `vault_id=eq.${vaultId}` },
      (payload) => {
        onChange({
          eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
          row: (payload.new as VaultItemRow) ?? (payload.old as VaultItemRow) ?? null,
        });
      },
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
