// Enumeration-resistant public-key lookup for secure sharing (build plan §2
// "Secure sharing" / §4 "lookup-public-key").
//
// A raw `select * from profiles where email = ...` is blocked by RLS anyway
// (profiles' SELECT policy is `id = auth.uid()`), so this function exists to
// give the *sender* a legitimate way to resolve a recipient's public key
// without exposing a general user-search endpoint: always returns HTTP 200,
// with `{ found: false }` rather than a 404, so response status/timing can't
// be used to enumerate registered emails, and it's rate-limited per caller.
import { corsHeaders } from "../_shared/cors.ts";
import { callerUserId, supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const RATE_LIMIT_PER_MINUTE = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = callerUserId(req);
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { email } = await req.json();
    if (typeof email !== "string" || !email.includes("@")) {
      return json({ error: "valid email required" }, 400);
    }

    const admin = supabaseAdmin();

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "lookup_public_key")
      .gte("created_at", oneMinuteAgo);
    if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return json({ error: "rate limited" }, 429);
    }

    await admin.from("audit_log").insert({ user_id: userId, action: "lookup_public_key" });

    // Exact, lowercased match against the unique index on lower(email)
    // (0003_bind_profile_email_to_auth.sql) — NOT .ilike(), which passes
    // '%'/'_' through as SQL wildcards and would let a caller pattern-match
    // ("%victim%@%") instead of testing one exact address at a time,
    // undermining this endpoint's one-email-at-a-time design intent.
    const { data: profile } = await admin
      .from("profiles")
      .select("id, public_key")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (!profile) return json({ found: false });

    // Never resolve to yourself — sharing an item with yourself isn't
    // meaningful and the DB has a `no_self_share` constraint anyway.
    if (profile.id === userId) return json({ found: false });

    return json({ found: true, userId: profile.id, publicKey: profile.public_key });
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
