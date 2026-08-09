import { useMemo, useState } from "react";
import { EmptyState, TextField } from "@password-manager/ui";
import { useAppStore, type Screen } from "../state/store.js";
import { ItemDetailScreen } from "./ItemDetailScreen.js";
import { TYPE_GLYPH } from "./VaultHomeScreen.js";

// Sidebar nav entries beyond "Vaults" aren't backed by anything yet — no
// folder/favorite/trash UI or data model wiring exists (see the design-plan
// compliance pass this follows). Shown, greyed out and inert, so the
// three-pane structure reads correctly without pretending they work.
const COMING_SOON_NAV = ["Folders", "Favorites", "Trash"];

// App.tsx's mobile-style bottom tab bar doesn't make sense floating over a
// three-pane window, so at desktop widths the sidebar takes over as the
// primary navigation to every other already-built screen instead (App.tsx
// hides the bottom nav once this shell is active).
const OTHER_SCREENS: Array<[Screen, string]> = [
  ["generator", "Generator"],
  ["security", "Security"],
  ["import-export", "Import & Export"],
  ["shared", "Shared"],
  ["settings", "Settings"],
];

/** Desktop design plan §4.1 "Main Window (three-pane)": sidebar (chrome) →
 * item list → detail pane, all visible at once — replaces the narrow
 * VaultHomeScreen/ItemDetailScreen screen-swap at desktop widths (App.tsx
 * picks between the two via useIsDesktopWidth). Core structure only for
 * this pass: no pulsing lock-ring animation, no multi-select, no Folders/
 * Favorites/Trash filtering — see the commit this shipped in for the full
 * list of what's deliberately deferred. */
export function DesktopVaultShell() {
  const items = useAppStore((s) => s.items);
  const loading = useAppStore((s) => s.itemsLoading);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const setActiveItemId = useAppStore((s) => s.setActiveItemId);
  const profile = useAppStore((s) => s.profile);
  const showToast = useAppStore((s) => s.showToast);
  const lock = useAppStore((s) => s.lock);
  const setScreen = useAppStore((s) => s.setScreen);

  const [query, setQuery] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.content.title.toLowerCase().includes(q) ||
        ("username" in item.content && item.content.username?.toLowerCase().includes(q)),
    );
  }, [items, query]);

  async function copyField(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    showToast({ message: `${label} copied — clears in 30s`, tone: "default" });
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30_000);
  }

  const showingDetail = activeItemId !== null || creatingNew;

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar — bg/chrome, one step darker than bg/surface (desktop design
          plan §0), fixed 240px per §2's foundations table. */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-chrome">
        <div className="px-5 pb-4 pt-6">
          <p className="text-sm font-semibold text-white/95">Password Manager</p>
          {profile?.email && <p className="mt-1 truncate text-xs text-white/50">{profile.email}</p>}
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          <div className="rounded-sm bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">Vaults</div>
          {COMING_SOON_NAV.map((label) => (
            <div key={label} className="flex items-center justify-between rounded-sm px-3 py-2 text-sm text-white/35">
              {label}
              <span className="text-[11px] uppercase tracking-wide">Soon</span>
            </div>
          ))}
        </nav>

        <div className="mx-3 my-3 border-t border-white/[0.06]" />

        <nav className="flex flex-col gap-0.5 px-3">
          {OTHER_SCREENS.map(([target, label]) => (
            <button
              key={target}
              onClick={() => setScreen(target)}
              className="rounded-sm px-3 py-2 text-left text-sm text-white/70 hover:bg-white/[0.04] hover:text-white/95"
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-3">
          <button
            onClick={lock}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-xs text-white/50 hover:bg-white/[0.04] hover:text-white/85"
          >
            <span className="h-2 w-2 rounded-full bg-success" />
            Unlocked — lock now
          </button>
        </div>
      </aside>

      {/* Item list — bg/surface, 320px min per §2. */}
      <section className="flex w-80 shrink-0 flex-col border-r border-white/[0.06] bg-surface">
        <div className="flex items-center gap-2 border-b border-white/[0.06] p-4">
          <TextField
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <button
            onClick={() => {
              setActiveItemId(null);
              setCreatingNew(true);
            }}
            aria-label="Add item"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-accent text-lg text-white hover:brightness-110"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-sm bg-white/[0.03]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<span className="text-2xl">🔑</span>}
                title={items.length === 0 ? "No items yet" : "No matches"}
                description={items.length === 0 ? "Add your first password with the + button." : "Try a different search."}
              />
            </div>
          ) : (
            <ul>
              {filtered.map(({ row, content }) => {
                const selected = row.id === activeItemId;
                return (
                  <li key={row.id} className="group relative">
                    <button
                      onClick={() => {
                        setCreatingNew(false);
                        setActiveItemId(row.id);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                        selected ? "bg-accent/10" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="shrink-0 text-base">{TYPE_GLYPH[row.type] ?? "🔒"}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-semibold ${selected ? "text-accent" : "text-white/95"}`}>
                          {content.title}
                        </p>
                        {"username" in content && content.username && (
                          <p className="truncate text-xs text-white/50">{content.username}</p>
                        )}
                      </div>
                    </button>
                    {/* Inline hover actions, not swipe-to-reveal — desktop
                        design plan §4.1's stated delta from mobile's row
                        pattern. */}
                    {"password" in content && content.password && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyField("Password", content.password);
                        }}
                        aria-label={`Copy password for ${content.title}`}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm border border-white/10 bg-surface px-2 py-1 text-[11px] text-white/70 opacity-0 hover:text-white/95 group-hover:opacity-100"
                      >
                        Copy
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Detail pane — flexes to fill remaining width per §4.1. */}
      <section className="flex-1 overflow-y-auto">
        {showingDetail ? (
          <ItemDetailScreen key={activeItemId ?? "new"} embedded />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={<span className="text-3xl">🔒</span>}
              title="Select an item"
              description="Choose something from the list, or add a new one."
            />
          </div>
        )}
      </section>
    </div>
  );
}
