import { useEffect, useState } from "react";
import { Button, Card, EmptyState } from "@password-manager/ui";
import { fetchSharedByMe, fetchSharedWithMe, revokeShare, type SharedByMeRow, type SharedWithMeItem } from "../lib/sharing.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

/** Two sections — items others have shared with the signed-in user
 * (decrypted, read-only), and items the user has shared out (with revoke).
 * Build plan §5 "basic 1:1 secure sharing (read)". */
export function SharedScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const keypair = useAppStore((s) => s.keypair);
  const profile = useAppStore((s) => s.profile);
  const myItems = useAppStore((s) => s.items);
  const showToast = useAppStore((s) => s.showToast);

  const [sharedWithMe, setSharedWithMe] = useState<SharedWithMeItem[] | null>(null);
  const [sharedByMe, setSharedByMe] = useState<SharedByMeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

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
    await revokeShare(supabase, shareId);
    setSharedByMe((rows) => rows?.filter((r) => r.shareId !== shareId) ?? null);
    showToast({ message: "Access revoked", tone: "default" });
  }

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
              <Card key={item.shareId} className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-white/95">{item.content.title}</p>
                {"username" in item.content && item.content.username && (
                  <p className="text-xs text-white/60">{item.content.username}</p>
                )}
                {"password" in item.content && (
                  <p className="font-mono font-mono-nums text-sm text-white/85">{item.content.password}</p>
                )}
                <span className="mt-1 text-xs uppercase tracking-wide text-white/35">{item.permission} access</span>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/85">Shared by me</h2>
        {loading ? (
          <p className="text-sm text-white/60">Loading…</p>
        ) : !sharedByMe || sharedByMe.length === 0 ? (
          <EmptyState title="You haven't shared anything" description="Share an item from its detail screen." />
        ) : (
          <div className="flex flex-col gap-2">
            {sharedByMe.map((share) => {
              const item = myItems.find((i) => i.row.id === share.itemId);
              return (
                <Card key={share.shareId} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white/95">{item?.content.title ?? "(item)"}</p>
                    <p className="text-xs text-white/60">{share.permission} access</p>
                  </div>
                  <Button variant="destructive" onClick={() => handleRevoke(share.shareId)}>
                    Revoke
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
