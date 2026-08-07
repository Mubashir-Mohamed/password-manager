import { createPasswordManagerClient } from "@password-manager/api-client";

// WXT exposes `WXT_`-prefixed env vars to extension code (its equivalent of
// Vite's `VITE_` convention) — see .env.example.
const url = import.meta.env.WXT_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.WXT_SUPABASE_ANON_KEY as string | undefined;

export const supabase = createPasswordManagerClient({
  supabaseUrl: url ?? "https://placeholder.supabase.co",
  supabaseAnonKey: anonKey ?? "placeholder-anon-key",
});
