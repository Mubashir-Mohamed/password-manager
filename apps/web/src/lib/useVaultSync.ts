import { useEffect } from "react";
import { listVaultItems, subscribeToVaultItems } from "@password-manager/api-client";
import { decryptItemContent } from "./vaultCrypto.js";
import { supabase } from "./supabase.js";
import { useAppStore } from "../state/store.js";

/** Loads the active vault's items once unlocked and keeps them in sync via
 * Realtime (build plan §4) — lifted out of VaultHomeScreen so `vaultId`/
 * `items` are populated as soon as the vault unlocks, regardless of which
 * screen is showing first. Needed once more than one screen renders vault
 * data at a time (desktop design plan's three-pane shell renders the item
 * list and detail pane together, not as separate screens), and incidentally
 * fixes a latent ordering dependency other screens already had on
 * `vaultId` having been set by a prior visit to Vault Home. Call this once,
 * near the app root — not per-screen, or the Realtime channel subscribes
 * once per mounted caller. */
export function useVaultSync() {
  const vmk = useAppStore((s) => s.vmk);
  const setVaultId = useAppStore((s) => s.setVaultId);
  const setItems = useAppStore((s) => s.setItems);
  const setItemsLoading = useAppStore((s) => s.setItemsLoading);

  useEffect(() => {
    if (!vmk) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function load() {
      setItemsLoading(true);
      const { data: vaults } = await supabase.from("vaults").select("id").limit(1);
      const vaultId = vaults?.[0]?.id;
      if (!vaultId) {
        if (!cancelled) setItemsLoading(false);
        return;
      }
      if (cancelled) return;
      setVaultId(vaultId);

      const rows = await listVaultItems(supabase, vaultId);
      const decrypted = await Promise.all(
        rows.map(async (row) => ({ row, content: await decryptItemContent(row, vmk!) })),
      );
      if (cancelled) return;
      setItems(decrypted);
      setItemsLoading(false);

      unsubscribe = subscribeToVaultItems(supabase, vaultId, async ({ row }) => {
        if (!row) return;
        if (row.is_deleted) {
          useAppStore.getState().removeItem(row.id);
          return;
        }
        const content = await decryptItemContent(row, vmk!);
        useAppStore.getState().upsertItem({ row, content });
      });
    }
    load();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmk]);
}
