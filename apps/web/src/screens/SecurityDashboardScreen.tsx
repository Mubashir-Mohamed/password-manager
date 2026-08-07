import { useMemo, useState } from "react";
import { Button, Card } from "@password-manager/ui";
import { findReusedPasswords, findWeakPasswords } from "@password-manager/core-domain";
import { checkItemsForBreaches } from "../lib/breachCheck.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

/** Opens with a single confident status line, never a wall of red — mobile
 * design plan §4.7 "Security Dashboard": "never a wall of red, per the
 * calm-not-alarming principle". Breach check is opt-in (button press) rather
 * than automatic, since it's a network round-trip per item against a
 * rate-limited endpoint. */
export function SecurityDashboardScreen() {
  const items = useAppStore((s) => s.items);
  const setScreen = useAppStore((s) => s.setScreen);
  const setActiveItemId = useAppStore((s) => s.setActiveItemId);

  const [breachChecking, setBreachChecking] = useState(false);
  const [breachProgress, setBreachProgress] = useState<{ checked: number; total: number } | null>(null);
  const [breachedIds, setBreachedIds] = useState<Set<string> | null>(null);
  const [breachError, setBreachError] = useState<string | null>(null);

  const loginRows = useMemo(
    () =>
      items
        .filter((i): i is typeof i & { content: { kind: "login"; password: string; title: string } } => i.content.kind === "login")
        .map((i) => ({ itemId: i.row.id, title: i.content.title, password: i.content.password })),
    [items],
  );

  const weak = useMemo(() => findWeakPasswords(loginRows), [loginRows]);
  const reused = useMemo(() => findReusedPasswords(loginRows), [loginRows]);

  const totalIssues = weak.length + reused.reduce((n, g) => n + g.items.length, 0) + (breachedIds?.size ?? 0);

  async function runBreachCheck() {
    setBreachChecking(true);
    setBreachError(null);
    setBreachProgress({ checked: 0, total: loginRows.length });
    try {
      const result = await checkItemsForBreaches(supabase, items, setBreachProgress);
      setBreachedIds(result);
    } catch (err) {
      setBreachError(err instanceof Error ? err.message : "Breach check failed.");
    } finally {
      setBreachChecking(false);
    }
  }

  function openItem(itemId: string) {
    setActiveItemId(itemId);
    setScreen("item");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-5 py-6 pb-24">
      <button className="self-start text-sm text-white/60 hover:text-white/85" onClick={() => setScreen("settings")}>
        ← Back
      </button>
      <h1 className="text-lg font-semibold text-white/95">Security</h1>

      <Card>
        <p className="text-md font-semibold text-white/95">
          {totalIssues === 0 && !breachChecking
            ? "Your vault looks good"
            : `${totalIssues} issue${totalIssues === 1 ? "" : "s"} need${totalIssues === 1 ? "s" : ""} attention`}
        </p>
        <p className="mt-1 text-sm text-white/60">
          {loginRows.length} login{loginRows.length === 1 ? "" : "s"} checked
        </p>
      </Card>

      {weak.length > 0 && (
        <IssueCard title="Weak passwords" items={weak.map((w) => ({ id: w.itemId, title: w.title }))} onOpen={openItem} />
      )}

      {reused.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-white/85">Reused passwords</h2>
          <div className="flex flex-col gap-4">
            {reused.map((group, i) => (
              <div key={i} className="flex flex-col gap-2">
                <p className="text-xs text-white/60">Used across {group.items.length} items</p>
                {group.items.map((item) => (
                  <button
                    key={item.itemId}
                    onClick={() => openItem(item.itemId)}
                    className="rounded-sm bg-warning/10 px-3 py-2 text-left text-sm text-white/95 hover:bg-warning/[0.15]"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white/85">Breached passwords</h2>
            <p className="mt-1 text-xs text-white/60">Checked against Have I Been Pwned — nothing is sent except a partial hash.</p>
          </div>
          <Button variant="secondary" onClick={runBreachCheck} disabled={breachChecking || loginRows.length === 0}>
            {breachChecking
              ? `Checking ${breachProgress?.checked ?? 0}/${breachProgress?.total ?? 0}…`
              : "Check now"}
          </Button>
        </div>
        {breachError && <p className="mt-3 text-sm text-danger">{breachError}</p>}
        {breachedIds && breachedIds.size === 0 && !breachChecking && (
          <p className="mt-3 text-sm text-success">No breached passwords found.</p>
        )}
      </Card>

      {breachedIds && breachedIds.size > 0 && (
        <IssueCard
          title="Breached passwords"
          tone="danger"
          items={items.filter((i) => breachedIds.has(i.row.id)).map((i) => ({ id: i.row.id, title: i.content.title }))}
          onOpen={openItem}
        />
      )}
    </div>
  );
}

function IssueCard({
  title,
  items,
  onOpen,
  tone = "warning",
}: {
  title: string;
  items: Array<{ id: string; title: string }>;
  onOpen: (id: string) => void;
  tone?: "warning" | "danger";
}) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-white/85">{title}</h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onOpen(item.id)}
            className={`rounded-sm px-3 py-2 text-left text-sm text-white/95 hover:brightness-110 ${
              tone === "danger" ? "bg-danger/10" : "bg-warning/10"
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>
    </Card>
  );
}
