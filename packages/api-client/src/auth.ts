import type { PasswordManagerClient } from "./client.js";
import type { Database } from "./database.types.js";

// Every function here takes `authLoginSecret` (base64), never a master
// password or a `Uint8Array` KEK — that's a deliberate API-boundary choice:
// this module should be structurally unable to leak the real master password
// to Supabase, because it never has it in the first place. Callers derive
// `authLoginSecret` via core-crypto's `deriveKeys` before calling in.

export interface SignUpParams {
  email: string;
  /** base64-encoded `authLoginSecret` from `deriveKeys` — used as the
   * Supabase Auth "password". */
  authLoginSecret: string;
  profile: Omit<Database["public"]["Tables"]["profiles"]["Insert"], "id" | "email">;
}

export async function signUp(client: PasswordManagerClient, params: SignUpParams) {
  const { data, error } = await client.auth.signUp({
    email: params.email,
    password: params.authLoginSecret,
  });
  if (error) throw error;
  if (!data.user) throw new Error("signUp succeeded but returned no user");

  // Runs as the newly-authenticated user (profiles_insert_self policy: id =
  // auth.uid()) — safe under RLS even though this executes right after
  // signUp with no separate privileged step. The `email` sent here is
  // advisory only: a database trigger (0003_bind_profile_email_to_auth.sql)
  // unconditionally overwrites it with the authoritative, lowercased value
  // from auth.users for this account — a client can't set profiles.email to
  // anyone else's address no matter what's passed in this call.
  const { error: profileError } = await client.from("profiles").insert({
    id: data.user.id,
    email: params.email,
    ...params.profile,
  });
  if (profileError) throw profileError;

  return data.user;
}

export async function signIn(client: PasswordManagerClient, email: string, authLoginSecret: string) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: authLoginSecret,
  });
  if (error) throw error;
  return data;
}

export async function signOut(client: PasswordManagerClient) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchOwnProfile(client: PasswordManagerClient) {
  const { data: session } = await client.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;

  const { data, error } = await client.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export interface KdfParamsForEmail {
  kdf_algo: string;
  kdf_salt: string;
  kdf_memlimit: number;
  kdf_opslimit: number;
  kdf_version: number;
}

/** Fetches the KDF params needed to derive `authLoginSecret` for a sign-in on
 * a device with no existing session — see build plan follow-up
 * `get-kdf-params` Edge Function. Always resolves (never 404s) for
 * enumeration resistance; a nonexistent email gets deterministic-looking fake
 * params instead, so the actual `signIn` call is what reveals whether the
 * account exists — same as it would for any login form. */
export async function fetchKdfParamsForEmail(
  client: PasswordManagerClient,
  email: string,
): Promise<KdfParamsForEmail> {
  const { data, error } = await client.functions.invoke("get-kdf-params", { body: { email } });
  if (error) throw error;
  return data;
}

export function onAuthStateChange(
  client: PasswordManagerClient,
  callback: Parameters<PasswordManagerClient["auth"]["onAuthStateChange"]>[0],
) {
  return client.auth.onAuthStateChange(callback);
}
