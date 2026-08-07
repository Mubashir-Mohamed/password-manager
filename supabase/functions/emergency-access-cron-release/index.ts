// Scheduled release for the Emergency Access wait period (build plan §2
// "Recovery" / §4 "emergency-access-request/-approve/-cron-release").
//
// The grantor's client pre-computes `wrapped_vault_key_for_grantee` (VMK
// wrapped to the grantee's public key) at *accept* time and uploads it then —
// this server never has the plaintext VMK and can't compute that wrapping
// itself. What this function enforces is purely the *timing* gate: it flips
// status from 'recovery_requested' to 'recovery_approved' once
// `wait_time_days` has elapsed since the request, unless the grantor denied
// it in the meantime (status would already be 'recovery_rejected').
//
// Wire this up as a Supabase Scheduled Function (or pg_cron -> pg_net POST)
// running every, e.g., 15 minutes — not on every request.
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  // No verify_jwt (config.toml) — this is invoked by the scheduler, not a
  // logged-in user. Still worth a shared-secret check in production:
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: pending, error } = await admin
    .from("emergency_access")
    .select("id, wait_time_days, requested_at, wrapped_vault_key_for_grantee, grantee_id")
    .eq("status", "recovery_requested")
    .not("requested_at", "is", null);

  if (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const now = Date.now();
  const toRelease = (pending ?? []).filter((row) => {
    if (!row.wrapped_vault_key_for_grantee) return false; // grantor never pre-uploaded — nothing to release
    const requestedAtMs = new Date(row.requested_at as string).getTime();
    const waitMs = row.wait_time_days * 24 * 60 * 60 * 1000;
    return now - requestedAtMs >= waitMs;
  });

  for (const row of toRelease) {
    await admin.from("emergency_access").update({ status: "recovery_approved" }).eq("id", row.id);
    await admin.from("audit_log").insert({
      user_id: row.grantee_id,
      action: "emergency_access_released",
      metadata: { emergency_access_id: row.id },
    });
  }

  return new Response(JSON.stringify({ released: toRelease.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
