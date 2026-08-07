// service_role client — bypasses RLS entirely. Only ever instantiated inside
// an Edge Function, never shipped to a client bundle. See build plan §3
// "Application Secrets & Credentials Management".
import { createClient } from "npm:@supabase/supabase-js@2";

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set for this function");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Extracts the calling user's id from the Authorization: Bearer <jwt> header
 * (present automatically when `verify_jwt = true` in config.toml already
 * validated it) — used for per-user rate limiting and audit_log writes. */
export function callerUserId(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1] ?? ""));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
