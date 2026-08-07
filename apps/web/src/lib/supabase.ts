import { createPasswordManagerClient } from "@password-manager/api-client";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fails loudly rather than silently hitting `undefined` — copy
  // .env.example to .env.local and fill in a real Supabase project's
  // anon key (build plan §3 "Supabase keys").
  console.error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Copy apps/web/.env.example to apps/web/.env.local.",
  );
}

export const supabase = createPasswordManagerClient({
  supabaseUrl: url ?? "https://placeholder.supabase.co",
  supabaseAnonKey: anonKey ?? "placeholder-anon-key",
});
