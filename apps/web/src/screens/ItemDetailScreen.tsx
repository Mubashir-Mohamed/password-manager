import { useState } from "react";
import { Button, ConfirmSheet, TOTPCode, TextField } from "@password-manager/ui";
import { currentTotpCode } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import { createVaultItem, softDeleteVaultItem, updateVaultItem } from "@password-manager/api-client";
import { encryptNewItem, encryptUpdatedItem } from "../lib/vaultCrypto.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

const emptyLogin: LoginContent = { kind: "login", title: "", username: "", password: "", urls: [], notes: "" };

/** Handles both "add new login" (no activeItemId) and "view/edit existing
 * item" — MVP scope covers the `login` item type end-to-end; note/card/
 * identity share the same envelope-encryption path (encryptNewItem/
 * decryptItemContent) and just need their own form fields, following this
 * one as a template. */
export function ItemDetailScreen() {
  const vaultId = useAppStore((s) => s.vaultId);
  const vmk = useAppStore((s) => s.vmk);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const items = useAppStore((s) => s.items);
  const upsertItem = useAppStore((s) => s.upsertItem);
  const removeItem = useAppStore((s) => s.removeItem);
  const setScreen = useAppStore((s) => s.setScreen);
  const showToast = useAppStore((s) => s.showToast);

  const existing = items.find((i) => i.row.id === activeItemId);
  const [form, setForm] = useState<LoginContent>(
    existing && existing.content.kind === "login" ? existing.content : emptyLogin,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    showToast({ message: "Copied — clears in 30s", tone: "default" });
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30_000);
  }

  async function handleSave() {
    if (!vaultId || !vmk || !form.title || !form.password) return;
    setBusy(true);
    try {
      if (existing) {
        const { wrappedItemKey, encryptedContent } = await encryptUpdatedItem(
          existing.row.id,
          existing.row.version + 1,
          form,
          existing.row.wrapped_item_key,
          vmk,
        );
        const updated = await updateVaultItem(supabase, existing.row.id, existing.row.version, {
          wrapped_item_key: wrappedItemKey,
          content: encryptedContent,
        });
        if (updated) upsertItem({ row: updated, content: form });
      } else {
        const { id, wrappedItemKey, encryptedContent } = await encryptNewItem(form, vmk);
        const row = await createVaultItem(supabase, {
          id,
          vault_id: vaultId,
          type: "login",
          wrapped_item_key: wrappedItemKey,
          content: encryptedContent,
        });
        upsertItem({ row, content: form });
      }
      showToast({ message: "Saved", tone: "success" });
      setScreen("vault");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    await softDeleteVaultItem(supabase, existing.row.id);
    removeItem(existing.row.id);
    showToast({ message: "Deleted", tone: "default" });
    setScreen("vault");
  }

  const totp = form.totp ? currentTotpCode(form.totp.secret, form.totp) : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-6">
      <button className="self-start text-sm text-white/60 hover:text-white/85" onClick={() => setScreen("vault")}>
        ← Back
      </button>
      <h1 className="text-lg font-semibold text-white/95">{existing ? form.title || "Edit item" : "Add login"}</h1>

      <TextField label="Name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <TextField
        label="Username"
        value={form.username ?? ""}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
      />
      <div className="flex items-end gap-2">
        <TextField
          label="Password"
          type="text"
          className="flex-1 font-mono font-mono-nums"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          hint="Paste one, or generate from the Generator tab."
        />
        <Button type="button" variant="secondary" onClick={() => form.password && copy(form.password)}>
          Copy
        </Button>
      </div>
      <TextField
        label="Website"
        value={form.urls[0] ?? ""}
        onChange={(e) => setForm({ ...form, urls: e.target.value ? [e.target.value] : [] })}
      />

      {totp && <TOTPCode code={totp.code} remainingSeconds={totp.remainingSeconds} />}

      <div className="mt-4 flex gap-3">
        <Button onClick={handleSave} disabled={busy || !form.title || !form.password}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {existing && (
          <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      {confirmingDelete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-5">
          <div className="w-full max-w-sm">
            <ConfirmSheet
              title="Delete this item?"
              description="This can't be undone from this screen."
              confirmLabel="Delete"
              destructive
              onConfirm={handleDelete}
              onCancel={() => setConfirmingDelete(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
