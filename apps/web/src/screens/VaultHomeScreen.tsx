import { useMemo, useState } from "react";
import { Button, EmptyState, TextField } from "@password-manager/ui";
import { useAppStore } from "../state/store.js";

// Small custom glyph set for item types — design plan §2 Iconography reserves
// custom icons specifically for concepts the OS icon set doesn't have.
export const TYPE_GLYPH: Record<string, string> = { login: "🔑", note: "📝", card: "💳", identity: "🪪" };

/** Search pinned at top (never scrolls away), FAB for add — mobile design
 * plan §4.3 "Vault Home". This is the narrow-viewport rendering; at desktop
 * widths App.tsx renders DesktopVaultShell instead (desktop design plan
 * §4.1's three-pane layout). Item loading + Realtime sync live in
 * useVaultSync, called once near the app root so both layouts share one
 * subscription. */
export function VaultHomeScreen() {
  const items = useAppStore((s) => s.items);
  const loading = useAppStore((s) => s.itemsLoading);
  const setActiveItemId = useAppStore((s) => s.setActiveItemId);
  const setScreen = useAppStore((s) => s.setScreen);

  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.content.title.toLowerCase().includes(q) ||
        ("username" in item.content && item.content.username?.toLowerCase().includes(q)),
    );
  }, [items, query]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-24 pt-6">
      <h1 className="mb-4 text-lg font-semibold text-white/95">Vault</h1>
      <TextField placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4" />

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-sm bg-surface" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl">🔑</span>}
          title={items.length === 0 ? "Add your first password" : "No matches"}
          description={
            items.length === 0
              ? "Everything you save is encrypted on this device before it's sent anywhere."
              : "Try a different search."
          }
          action={
            items.length === 0 && (
              <Button onClick={() => setScreen("item")}>Add item</Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-white/[0.06]">
          {filtered.map(({ row, content }) => (
            <li key={row.id}>
              <button
                onClick={() => {
                  setActiveItemId(row.id);
                  setScreen("item");
                }}
                className="flex w-full items-center gap-3 py-4 text-left hover:bg-white/[0.03]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-accent/10 text-sm font-semibold text-accent">
                  {content.title.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/95">{content.title}</p>
                  {"username" in content && content.username && (
                    <p className="truncate text-xs text-white/60">{content.username}</p>
                  )}
                </div>
                <span className="text-base" aria-label={row.type} title={row.type}>
                  {TYPE_GLYPH[row.type] ?? "🔒"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => {
          setActiveItemId(null);
          setScreen("item");
        }}
        aria-label="Add item"
        className="fixed bottom-8 right-1/2 flex h-14 w-14 translate-x-1/2 items-center justify-center rounded-full bg-accent text-2xl text-white shadow-lg shadow-accent/30 transition-transform hover:scale-105 sm:right-8 sm:translate-x-0"
      >
        +
      </button>
    </div>
  );
}
