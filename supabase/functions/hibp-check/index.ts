// k-anonymity breach-check proxy (build plan §4 "hibp-check").
//
// Preserves k-anonymity end-to-end: the client SHA-1-hashes the password
// locally, sends only the first 5 hex characters of that hash, and does the
// final suffix comparison itself against the list this function returns.
// This function's job is just to (a) proxy to the Have I Been Pwned Range API
// so the client never talks to a third party directly with anything
// password-derived, (b) cache by prefix so repeat lookups across users don't
// keep re-hitting HIBP, and (c) rate-limit per user.
import { corsHeaders } from "../_shared/cors.ts";
import { callerUserId, supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — HIBP's own dataset doesn't change that fast
const RATE_LIMIT_PER_MINUTE = 20;
const PREFIX_RE = /^[A-F0-9]{5}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = callerUserId(req);
    if (!userId) {
      return json({ error: "unauthorized" }, 401);
    }

    const { prefix } = await req.json();
    if (typeof prefix !== "string" || !PREFIX_RE.test(prefix)) {
      return json({ error: "prefix must be 5 uppercase hex characters" }, 400);
    }

    const admin = supabaseAdmin();

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "hibp_check")
      .gte("created_at", oneMinuteAgo);
    if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return json({ error: "rate limited" }, 429);
    }

    const { data: cached } = await admin
      .from("breach_check_cache")
      .select("response_body, fetched_at")
      .eq("hash_prefix", prefix)
      .maybeSingle();

    let responseBody: string;
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      responseBody = cached.response_body;
    } else {
      const hibpRes = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
      });
      if (!hibpRes.ok) {
        return json({ error: "breach database unavailable" }, 502);
      }
      responseBody = await hibpRes.text();
      await admin
        .from("breach_check_cache")
        .upsert({ hash_prefix: prefix, response_body: responseBody, fetched_at: new Date().toISOString() });
    }

    await admin.from("audit_log").insert({ user_id: userId, action: "hibp_check", metadata: { prefix } });

    return json({ prefix, suffixes: responseBody });
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
