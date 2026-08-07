// Public, unauthenticated lookup of an account's KDF parameters by email —
// the missing piece that makes sign-in on a *new* device actually work.
//
// Why this has to exist: to derive `authLoginSecret` (what's sent to
// supabase.auth.signInWithPassword) the client needs this account's
// kdf_salt/memlimit/opslimit — but `profiles` SELECT is normally restricted
// to `id = auth.uid()`, and there's no session yet on a fresh device. KDF
// parameters are not secret (they're the public "how", not the private key
// material — same as bcrypt/argon2 storing its own params alongside the
// hash), so exposing them here doesn't weaken anything, but WHETHER an email
// is registered at all is worth not leaking cheaply. So: same
// enumeration-resistance pattern as lookup-public-key — always 200, and for
// an email with no account, return deterministic-looking-but-fake params
// (HMAC-derived from the email + a server-only pepper) instead of a 404, so
// the response shape and rough timing don't distinguish the two cases.
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const FAKE_MEMLIMIT = 268435456; // matches KDF_PROFILES.moderate in core-crypto
const FAKE_OPSLIMIT = 3;
const FAKE_VERSION = 1;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (typeof email !== "string" || !email.includes("@")) {
      return json({ error: "valid email required" }, 400);
    }

    const admin = supabaseAdmin();
    // Exact, lowercased match — NOT .ilike(), which passes '%'/'_' through as
    // SQL wildcards and would turn this into a pattern-search primitive
    // instead of a one-email-at-a-time lookup. See
    // 0003_bind_profile_email_to_auth.sql, which also guarantees
    // profiles.email is always stored lowercased.
    const { data: profile } = await admin
      .from("profiles")
      .select("kdf_algo, kdf_salt, kdf_memlimit, kdf_opslimit, kdf_version")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (profile) {
      return json(profile);
    }

    return json({
      kdf_algo: "argon2id",
      kdf_salt: await fakeSaltFor(email.trim().toLowerCase()),
      kdf_memlimit: FAKE_MEMLIMIT,
      kdf_opslimit: FAKE_OPSLIMIT,
      kdf_version: FAKE_VERSION,
    });
  } catch (err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  }
});

/** Deterministic per-email fake salt (HMAC-SHA256 truncated to 16 bytes,
 * base64url) so repeated lookups for the same nonexistent email are
 * consistent — an attacker re-querying can't use inconsistency as a signal
 * either. Keyed by a server-only pepper so the fake salt can't be predicted
 * or used to distinguish real vs. fake without the pepper. */
async function fakeSaltFor(email: string): Promise<string> {
  const pepper = Deno.env.get("KDF_DUMMY_PEPPER") ?? "dev-only-insecure-pepper-set-KDF_DUMMY_PEPPER-in-prod";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email));
  const bytes = new Uint8Array(sig).slice(0, 16);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
