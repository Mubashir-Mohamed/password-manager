import { createPasswordManagerClient } from "@password-manager/api-client";

// Expo only exposes EXPO_PUBLIC_-prefixed env vars to app code — see
// .env.example and build plan §3.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createPasswordManagerClient({
  supabaseUrl: url ?? "https://placeholder.supabase.co",
  supabaseAnonKey: anonKey ?? "placeholder-anon-key",
});
