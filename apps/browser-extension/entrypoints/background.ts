import { decryptItem, fromBase64, unwrapKey } from "@password-manager/core-crypto";
import { listVaultItems } from "@password-manager/api-client";
import { vaultItemContentSchema } from "@password-manager/core-domain";
import { getSession } from "../lib/session.js";
import { normalizeDomain } from "../lib/domain.js";
import { supabase } from "../lib/supabase.js";
import type { ExtensionMessage, FillResponse, LockStateResponse, MatchResponse } from "../lib/messages.js";

// MV3 service worker: no persistent secrets in module state (mobile design
// plan §3). The unlocked VMK lives only in `browser.storage.session` — this
// file re-derives what it needs (via a fresh decrypt pass) on every message
// rather than caching plaintext at module scope, since the worker can be
// killed and restarted between messages at any time.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    handle(message as ExtensionMessage).then(sendResponse);
    return true; // keep the message channel open for the async response
  });
});

async function handle(message: ExtensionMessage) {
  switch (message.type) {
    case "vault:lock-state":
      return await lockState();
    case "vault:match-domain":
      return await matchDomain(message.domain);
    case "vault:fill-item":
      return await fillItem(message.itemId);
    default:
      return null;
  }
}

async function lockState(): Promise<LockStateResponse> {
  const session = await getSession();
  return { unlocked: !!session };
}

// Known Phase 1 inefficiency: this re-fetches and re-decrypts every item in
// the vault on every match/fill request rather than caching. Fine at MVP
// scale; the schema's `domain_hmac` column (0001_init.sql) exists precisely
// so a fast-follow can filter server-side instead of decrypting everything
// client-side on every keystroke-adjacent request.
async function matchDomain(domain: string): Promise<MatchResponse> {
  const session = await getSession();
  if (!session) return { matches: [] };

  const vmk = await fromBase64(session.vmkB64);
  const rows = await listVaultItems(supabase, session.vaultId);
  const target = normalizeDomain(domain);

  const matches: MatchResponse["matches"] = [];
  for (const row of rows) {
    if (row.type !== "login") continue;
    try {
      const itemKey = await unwrapKey(row.wrapped_item_key, vmk);
      const plaintext = await decryptItem(row.content, itemKey);
      const content = vaultItemContentSchema.parse(JSON.parse(plaintext));
      if (content.kind !== "login") continue;
      const belongs = content.urls.some((u) => normalizeDomain(u) === target);
      if (belongs) matches.push({ itemId: row.id, title: content.title, username: content.username });
    } catch {
      // Skip items that fail to decrypt (shouldn't happen with a valid VMK) —
      // never let one bad row break the whole match list.
    }
  }
  return { matches };
}

async function fillItem(itemId: string): Promise<FillResponse | null> {
  const session = await getSession();
  if (!session) return null;

  const vmk = await fromBase64(session.vmkB64);
  const rows = await listVaultItems(supabase, session.vaultId);
  const row = rows.find((r) => r.id === itemId);
  if (!row) return null;

  const itemKey = await unwrapKey(row.wrapped_item_key, vmk);
  const plaintext = await decryptItem(row.content, itemKey);
  const content = vaultItemContentSchema.parse(JSON.parse(plaintext));
  if (content.kind !== "login") return null;

  return { username: content.username, password: content.password };
}
