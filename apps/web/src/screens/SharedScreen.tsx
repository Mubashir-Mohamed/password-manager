import { useEffect, useState } from "react";
import { Button, Card, EmptyState, PasswordField, TextField } from "@password-manager/ui";
import type { LoginContent } from "@password-manager/core-domain";
import type { SharePermission } from "@password-manager/api-client";
import { updateVaultItem } from "@password-manager/api-client";
import {
  fetchSharedByMe,
  fetchSharedWithMe,
  groupSharedByMeByItem,
  revokeShare,
  updateSharePermission,
  type SharedByMeRow,
  type SharedWithMeItem,
} from "../lib/sharing.js";
import { encryptSharedItemUpdate } from "../lib/vaultCrypto.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

/** Two sections — items others have shared with the signed-in user
 * (decrypted, editable inline if the share is write-permission), and items
 * the user has shared out, grouped by item so multi-recipient sharing shows
 * every recipient (with their own permission + revoke) instead of a flat
 * list of rows. Build plan §5 "secure sharing" + its write-permission/
 * multi-recipient fast-follow. */
export function SharedScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const keypair = useAppStore((s) => s.keypair);
  const profile = useAppStore((s) => s.profile);
  const myItems = useAppStore((s) => s.items);
  const showToast = useAppStore((s) => s.showToast);

  const [sharedWithMe, setSharedWithMe] = useState<SharedWithMeItem[] | null>(null);
  const [sharedByMe, setSharedByMe] = useState<SharedByMeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipientBusyId, setRecipientBusyId] = useState<string | null>(null);
  const [editingShareId, setEditingShareId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LoginContent | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  async function load() {
    if (!keypair || !profile) return;
    setLoading(true);
    const [withMe, byMe] = await Promise.all([
      fetchSharedWithMe(supabase, keypair.privateKey),
      fetchSharedByMe(supabase, profile.id),
    ]);
    setSharedWithMe(withMe);
    setSharedByMe(byMe);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRevoke(shareId: string) {
    setRecipientBusyId(shareId);
    try {
      await revokeShare(supabase, shareId);
      setSharedByMe((rows) => rows?.filter((r) => r.shareId !== shareId) ?? null);
      showToast({ message: "Access revoked", tone: "default" });
    } finally {
      setRecipientBusyId(null);
    }
  }

  async function handlePermissionChange(row: SharedByMeRow, permission: SharePermission) {
    setRecipientBusyId(row.shareId);
    try {
      await updateSharePermission(supabase, row.itemId, row.toUserId, permission);
      setSharedByMe((rows) => rows?.map((r) => (r.shareId === row.shareId ? { ...r, permission } : r)) ?? null);
      showToast({ message: `${row.toEmail} now has ${permission} access`, tone: "default" });
    } finally {
      setRecipientBusyId(null);
    }
  }

  function startEditing(item: SharedWithMeItem) {
    if (item.content.kind !== "login") return; // MVP scope: login items only, same as ItemDetailScreen
    setEditingShareId(item.shareId);
    setEditForm(item.content);
  }

  async function saveEdit(item: SharedWithMeItem) {
    if (!editForm) return;
    setEditBusy(true);
    try {
      const nextVersion = item.row.version + 1;
      const { encryptedContent } = await encryptSharedItemUpdate(item.row.id, nextVersion, editForm, item.itemKey);
      const updated = await updateVaultItem(supabase, item.row.id, item.row.version, { content: encryptedContent });
      if (!updated) {
        showToast({ message: "Someone else edited this item first — reloading.", tone: "default" });
        await load();
      } else {
        setSharedWithMe((rows) =>
          rows?.map((r) => (r.shareId === item.shareId ? { ...r, row: updated, content: editForm } : r)) ?? null,
        );
        showToast({ message: "Saved", tone: "success" });
      }
      setEditingShareId(null);
      setEditForm(null);
    } finally {
      setEditBusy(false);
    }
  }

  const byItem = sharedByMe ? groupSharedByMeByItem(sharedByMe) : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-5 py-6 pb-24">
      <button className="self-start text-sm text-white/60 hover:text-white/85" onClick={() => setScreen("settings")}>
        ← Back
      </button>
      <h1 className="text-lg font-semibold text-white/95">Sharing</h1>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/85">Shared with me</h2>
        {loading ? (
          <p className="text-sm text-white/60">Loading…</p>
        ) : !sharedWithMe || sharedWithMe.length === 0 ? (
          <EmptyState title="Nothing shared with you yet" description="Items someone shares with you will show up here." />
        ) : (
          <div className="flex flex-col gap-2">
            {sharedWithMe.map((item) => (
              <Card key={item.shareId} className="flex flex-col gap-2">
                {editingShareId === item.shareId && editForm ? (
                  <div className="flex flex-col gap-3">
                    <TextField
                      label="Name"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />
                    <TextField
                      label="Username"
                      value={editForm.username ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    />
                    <PasswordField
                      label="Password"
                      value={editForm.password}
                      onChange={(password) => setEditForm({ ...editForm, password })}
                    />
                    <TextField
                      label="Notes"
                      value={editForm.notes ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => saveEdit(item)} disabled={editBusy || !editForm.title || !editForm.password}>
                        {editBusy ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingShareId(null);
                          setEditForm(null);
                        }}
                        disabled={editBusy}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-white/95">{item.content.title}</p>
                    {"username" in item.content && item.content.username && (
                      <p className="text-xs text-white/60">{item.content.username}</p>
                    )}
                    {"password" in item.content && (
                      <p className="font-mono font-mono-nums text-sm text-white/85">{item.content.password}</p>
                    )}
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-white/35">{item.permission} access</span>
                      {item.permission === "write" && item.content.kind === "login" && (
                        <button className="text-xs text-accent hover:underline" onClick={() => startEditing(item)}>
                          Edit
                        </button>
                      )}
                    </div>
                  </>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/85">Shared by me</h2>
        {loading ? (
          <p className="text-sm text-white/60">Loading…</p>
        ) : !byItem || byItem.size === 0 ? (
          <EmptyState title="You haven't shared anything" description="Share an item from its detail screen." />
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from(byItem.entries()).map(([itemId, shares]) => {
              const item = myItems.find((i) => i.row.id === itemId);
              return (
                <Card key={itemId} className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-white/95">{item?.content.title ?? "(item)"}</p>
                  <div className="flex flex-col gap-2">
                    {shares.map((share) => (
                      <div key={share.shareId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-white/85">{share.toEmail}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <select
                            className="rounded-sm border border-white/[0.08] bg-base px-2 py-1 text-xs text-white/85 outline-none focus:border-accent"
                            value={share.permission}
                            disabled={recipientBusyId === share.shareId}
                            onChange={(e) => handlePermissionChange(share, e.target.value as SharePermission)}
                          >
                            <option value="read">Read</option>
                            <option value="write">Write</option>
                          </select>
                          <Button
                            variant="destructive"
                            disabled={recipientBusyId === share.shareId}
                            onClick={() => handleRevoke(share.shareId)}
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
