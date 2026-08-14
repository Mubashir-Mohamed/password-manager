import { useEffect, useState } from "react";
import { Button, ConfirmSheet, PasswordField, TOTPCode, TextField } from "@password-manager/ui";
import { currentTotpCode } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import { createVaultItem, softDeleteVaultItem, updateVaultItem, type SharePermission } from "@password-manager/api-client";
import { encryptNewItem, encryptUpdatedItem } from "../lib/vaultCrypto.js";
import { fetchSharedByMe, revokeShare, shareItemWithEmail, updateSharePermission, type SharedByMeRow } from "../lib/sharing.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

const emptyLogin: LoginContent = { kind: "login", title: "", username: "", password: "", urls: [], notes: "" };

export interface ItemDetailScreenProps {
  /** Renders as a detail *pane* inside DesktopVaultShell's three-pane layout
   * (desktop design plan §4.1) instead of a full-page screen: no back
   * button, no page-level padding, and Save/Delete don't navigate away
   * (there's nowhere to navigate to — the pane just reflects the current
   * selection). The caller is expected to remount this component (e.g. via
   * a `key` on `activeItemId`) when the selected item changes, same as
   * every other piece of local form state here. */
  embedded?: boolean;
}

/** Handles both "add new login" (no activeItemId) and "view/edit existing
 * item" — MVP scope covers the `login` item type end-to-end; note/card/
 * identity share the same envelope-encryption path (encryptNewItem/
 * decryptItemContent) and just need their own form fields, following this
 * one as a template. */
export function ItemDetailScreen({ embedded = false }: ItemDetailScreenProps = {}) {
  const vaultId = useAppStore((s) => s.vaultId);
  const vmk = useAppStore((s) => s.vmk);
  const keypair = useAppStore((s) => s.keypair);
  const profile = useAppStore((s) => s.profile);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const items = useAppStore((s) => s.items);
  const upsertItem = useAppStore((s) => s.upsertItem);
  const removeItem = useAppStore((s) => s.removeItem);
  const setScreen = useAppStore((s) => s.setScreen);
  const setActiveItemId = useAppStore((s) => s.setActiveItemId);
  const showToast = useAppStore((s) => s.showToast);

  const existing = items.find((i) => i.row.id === activeItemId);
  const [form, setForm] = useState<LoginContent>(
    existing && existing.content.kind === "login" ? existing.content : emptyLogin,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [sharing, setSharing] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<SharePermission>("read");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<SharedByMeRow[] | null>(null);
  const [recipientBusyId, setRecipientBusyId] = useState<string | null>(null);

  // Multi-recipient sharing (build plan §5 fast-follow): show who this item
  // is already shared with — read on load whenever an existing item is open,
  // not gated behind the "Share" panel toggle, since revoking/upgrading
  // access is useful even without opening the share form.
  useEffect(() => {
    if (!existing || !profile) {
      setRecipients(null);
      return;
    }
    let cancelled = false;
    fetchSharedByMe(supabase, profile.id).then((rows) => {
      if (!cancelled) setRecipients(rows.filter((r) => r.itemId === existing.row.id));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.row.id, profile?.id]);

  async function handleRevokeRecipient(shareId: string) {
    setRecipientBusyId(shareId);
    try {
      await revokeShare(supabase, shareId);
      setRecipients((rows) => rows?.filter((r) => r.shareId !== shareId) ?? null);
      showToast({ message: "Access revoked", tone: "default" });
    } finally {
      setRecipientBusyId(null);
    }
  }

  async function handleChangeRecipientPermission(row: SharedByMeRow, permission: SharePermission) {
    setRecipientBusyId(row.shareId);
    try {
      await updateSharePermission(supabase, row.itemId, row.toUserId, permission);
      setRecipients((rows) => rows?.map((r) => (r.shareId === row.shareId ? { ...r, permission } : r)) ?? null);
      showToast({ message: `${row.toEmail} now has ${permission} access`, tone: "default" });
    } finally {
      setRecipientBusyId(null);
    }
  }

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
        // Embedded (desktop three-pane): select the just-created item so the
        // detail pane reflects it — no navigation to bounce through.
        if (embedded) setActiveItemId(row.id);
      }
      showToast({ message: "Saved", tone: "success" });
      if (!embedded) setScreen("vault");
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!existing || !vmk || !keypair || !profile || !shareEmail) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const result = await shareItemWithEmail(supabase, {
        itemId: existing.row.id,
        itemWrappedKey: existing.row.wrapped_item_key,
        recipientEmail: shareEmail,
        vmk,
        myUserId: profile.id,
        myPublicKey: keypair.publicKey,
        myPrivateKey: keypair.privateKey,
        permission: sharePermission,
      });
      if (result.shared) {
        showToast({ message: `Shared with ${shareEmail} (${sharePermission} access)`, tone: "success" });
        setShareEmail("");
        setSharePermission("read");
        setSharing(false);
        // Re-fetch rather than optimistically patch local state — this call
        // may have been a fresh share OR a permission bump on an existing
        // one (0008's dedup fallback in shareItemWithEmail), and the server
        // is the source of truth for which.
        fetchSharedByMe(supabase, profile.id).then((rows) =>
          setRecipients(rows.filter((r) => r.itemId === existing.row.id)),
        );
      } else if (result.reason === "not-found") {
        setShareError("No account found for that email.");
      } else if (result.reason === "self") {
        setShareError("You can't share an item with yourself.");
      } else {
        setShareError("Couldn't share this item. Try again.");
      }
    } finally {
      setShareBusy(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    await softDeleteVaultItem(supabase, existing.row.id);
    removeItem(existing.row.id);
    showToast({ message: "Deleted", tone: "default" });
    if (embedded) setActiveItemId(null);
    else setScreen("vault");
  }

  const totp = form.totp ? currentTotpCode(form.totp.secret, form.totp) : null;

  return (
    <div className={embedded ? "flex flex-col gap-5 p-6" : "mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-6"}>
      {!embedded && (
        <button className="self-start text-sm text-white/60 hover:text-white/85" onClick={() => setScreen("vault")}>
          ← Back
        </button>
      )}
      <h1 className="text-lg font-semibold text-white/95">{existing ? form.title || "Edit item" : "Add login"}</h1>

      <TextField label="Name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <TextField
        label="Username"
        value={form.username ?? ""}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
      />
      <PasswordField
        label="Password"
        value={form.password}
        onChange={(password) => setForm({ ...form, password })}
        placeholder="Paste one, or generate from the Generator tab."
        onCopy={() => form.password && copy(form.password)}
      />
      <TextField
        label="Website"
        value={form.urls[0] ?? ""}
        onChange={(e) => setForm({ ...form, urls: e.target.value ? [e.target.value] : [] })}
      />
      <TextField
        label="Notes"
        value={form.notes ?? ""}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />

      {totp && <TOTPCode code={totp.code} remainingSeconds={totp.remainingSeconds} />}

      <div className="mt-4 flex gap-3">
        <Button onClick={handleSave} disabled={busy || !form.title || !form.password}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {existing && (
          <Button variant="secondary" onClick={() => setSharing((s) => !s)}>
            Share{recipients && recipients.length > 0 ? ` (${recipients.length})` : ""}
          </Button>
        )}
        {existing && (
          <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      {sharing && existing && (
        <div className="flex flex-col gap-4 rounded-md border border-white/[0.08] bg-surface p-4">
          {recipients && recipients.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Shared with</p>
              {recipients.map((r) => (
                <div key={r.shareId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-white/85">{r.toEmail}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      className="rounded-sm border border-white/[0.08] bg-base px-2 py-1 text-xs text-white/85 outline-none focus:border-accent"
                      value={r.permission}
                      disabled={recipientBusyId === r.shareId}
                      onChange={(e) => handleChangeRecipientPermission(r, e.target.value as SharePermission)}
                    >
                      <option value="read">Read</option>
                      <option value="write">Write</option>
                    </select>
                    <button
                      className="text-xs text-danger hover:underline disabled:opacity-40"
                      disabled={recipientBusyId === r.shareId}
                      onClick={() => handleRevokeRecipient(r.shareId)}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <TextField
              label="Share with (email)"
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              error={shareError ?? undefined}
              hint="They must already have an account. You can add more recipients any time."
            />
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/85">Access level</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-sm border px-3 py-2 text-sm transition-colors ${
                    sharePermission === "read"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-white/[0.08] text-white/60 hover:text-white/85"
                  }`}
                  onClick={() => setSharePermission("read")}
                >
                  Read only
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-sm border px-3 py-2 text-sm transition-colors ${
                    sharePermission === "write"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-white/[0.08] text-white/60 hover:text-white/85"
                  }`}
                  onClick={() => setSharePermission("write")}
                >
                  Can edit
                </button>
              </div>
            </div>
            <Button onClick={handleShare} disabled={shareBusy || !shareEmail}>
              {shareBusy ? "Sharing…" : "Share"}
            </Button>
          </div>
        </div>
      )}

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
