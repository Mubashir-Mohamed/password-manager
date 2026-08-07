import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

export type PasswordManagerClient = SupabaseClient<Database>;

export interface ClientConfig {
  /** e.g. `import.meta.env.VITE_SUPABASE_URL` (web/desktop/extension) or
   * `process.env.EXPO_PUBLIC_SUPABASE_URL` (mobile) — see .env.example. */
  supabaseUrl: string;
  /** The `anon` key — safe to embed in client bundles. NEVER pass a
   * service_role key here; that key only ever belongs in an Edge Function or
   * CI secret store. See build plan §3. */
  supabaseAnonKey: string;
}

/** One client per app/process. Auth uses the domain-separated
 * `authLoginSecret` (see core-crypto `deriveKeys`) as the Supabase password —
 * see `auth.ts` — so this client never sees a real master password. */
export function createPasswordManagerClient(config: ClientConfig): PasswordManagerClient {
  return createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
