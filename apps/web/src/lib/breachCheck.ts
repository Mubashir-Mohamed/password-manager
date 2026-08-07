// Client-side half of the HIBP k-anonymity check (build plan §4 "hibp-check").
// SHA-1 here is not a cryptographic-strength choice — it's mandated by the
// HIBP Range API's k-anonymity protocol, which the Edge Function proxies.
// Only the 5-char hash prefix ever leaves this module; see
// packages/api-client/src/edgeFunctions.ts for the full-suffix comparison,
// which also happens entirely client-side.
import { checkPasswordBreach, type PasswordManagerClient } from "@password-manager/api-client";
import type { DecryptedItem } from "../state/store.js";

async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export interface BreachCheckProgress {
  checked: number;
  total: number;
}

/** Checks every login item's password against HIBP, one at a time (the Edge
 * Function is rate-limited to 20/min per user — see build plan §3 — so a
 * large vault intentionally isn't parallelized here). A single item's
 * network failure doesn't abort the rest of the check. */
export async function checkItemsForBreaches(
  client: PasswordManagerClient,
  items: DecryptedItem[],
  onProgress?: (progress: BreachCheckProgress) => void,
): Promise<Set<string>> {
  const loginItems = items.filter(
    (item): item is DecryptedItem & { content: { kind: "login"; password: string } } =>
      item.content.kind === "login" && !!item.content.password,
  );

  const breached = new Set<string>();

  for (let i = 0; i < loginItems.length; i++) {
    const item = loginItems[i]!;
    try {
      const hash = await sha1Hex(item.content.password);
      const result = await checkPasswordBreach(client, hash.slice(0, 5), hash.slice(5));
      if (result.breached) breached.add(item.row.id);
    } catch {
      // Network/rate-limit failure for this one item — skip it, don't fail
      // the whole check. The dashboard should show "couldn't check N items"
      // rather than nothing at all (fast-follow UI polish).
    }
    onProgress?.({ checked: i + 1, total: loginItems.length });
  }

  return breached;
}
