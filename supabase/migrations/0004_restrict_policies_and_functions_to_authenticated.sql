-- Hardening pass from a /supabase skill audit of the existing schema — no
-- exploitable gap was found (every policy already carries an ownership
-- predicate, and the two affected functions check auth.uid() internally so
-- an anon caller gets a NULL comparison / rejection either way), but two
-- patterns fell short of current Supabase guidance and are worth closing as
-- defense-in-depth rather than leaving for later:
--
--   1. Every policy in 0001_init.sql was created without a `TO` clause,
--      which defaults to PUBLIC (i.e. also `anon`, not just `authenticated`).
--      None were exploitable — auth.uid() is NULL for anon, so every
--      ownership predicate (`owner_id = auth.uid()`, etc.) evaluates to
--      NULL/false regardless — but relying on that NULL-comparison side
--      effect instead of an explicit `TO authenticated` is fragile: it's
--      exactly the failure mode the Supabase security checklist calls out
--      for `auth.role() = 'authenticated'`-style checks once anonymous
--      sign-ins are enabled (this project doesn't enable them, but "doesn't
--      currently" isn't a property a migration should depend on silently).
--   2. `is_vault_owner` and `get_emergency_vault_key` are SECURITY DEFINER
--      functions in the `public` schema. Postgres grants EXECUTE on new
--      functions to PUBLIC by default, so both were callable directly by
--      `anon` — again not exploitable today (get_emergency_vault_key already
--      checks `grantee_id = auth.uid()` in its body; is_vault_owner checks
--      `owner_id = auth.uid()`), but the standard hardening is to revoke the
--      default PUBLIC grant and grant explicitly only to the role that
--      actually needs it.

-- ── restrict every existing policy to `authenticated` ──────────────────────
-- ALTER POLICY ... TO ... changes the applicable-roles list in place; it
-- does not touch the USING/WITH CHECK expressions, so this is a pure
-- narrowing with no behavior change for legitimate authenticated users.

alter policy "profiles_select_self" on public.profiles to authenticated;
alter policy "profiles_insert_self" on public.profiles to authenticated;
alter policy "profiles_update_self" on public.profiles to authenticated;

alter policy "vaults_select_own" on public.vaults to authenticated;
alter policy "vaults_insert_own" on public.vaults to authenticated;
alter policy "vaults_update_own" on public.vaults to authenticated;
alter policy "vaults_delete_own" on public.vaults to authenticated;

alter policy "folders_all_via_vault_ownership" on public.folders to authenticated;

alter policy "vault_items_insert_owner" on public.vault_items to authenticated;
alter policy "vault_items_update_owner" on public.vault_items to authenticated;
alter policy "vault_items_delete_owner" on public.vault_items to authenticated;
alter policy "vault_items_select_owner_or_shared" on public.vault_items to authenticated;

alter policy "shared_items_select_participant" on public.shared_items to authenticated;
alter policy "shared_items_insert_from_owner" on public.shared_items to authenticated;
alter policy "shared_items_revoke_from_owner" on public.shared_items to authenticated;

alter policy "devices_all_own" on public.devices to authenticated;

alter policy "emergency_access_select_participant" on public.emergency_access to authenticated;
alter policy "emergency_access_insert_grantor" on public.emergency_access to authenticated;

alter policy "audit_log_select_own" on public.audit_log to authenticated;

-- ── restrict the two callable SECURITY DEFINER functions ───────────────────
-- `authenticated` must keep EXECUTE on is_vault_owner: it's invoked from
-- inside several of the policies above, and RLS policy evaluation for the
-- `authenticated` role needs EXECUTE on any function a policy calls.
--
-- IMPORTANT — verified live, this was NOT a no-op fix to get right the first
-- time: `revoke execute ... from public` alone does not remove an EXECUTE
-- grant made directly to `anon`, and Supabase's standard project bootstrap
-- runs `alter default privileges ... grant all on functions to anon,
-- authenticated, service_role` — meaning every new function gets an EXPLICIT
-- per-role grant to `anon`, independent of and in addition to the implicit
-- PUBLIC grant Postgres gives new functions by default. Revoking only from
-- PUBLIC left `anon` still able to call both functions directly (confirmed
-- against a live Postgres instance with that same default-privilege rule
-- applied before this migration ran — `anon` could still successfully call
-- `is_vault_owner` and get a real boolean back). Same root cause as the
-- emergency_access column-grant bug in 0001_init.sql: table/function-level
-- REVOKE and role-specific GRANT are tracked independently, and only
-- revoking the "everyone" grant leaves specific-role grants untouched.
revoke execute on function public.is_vault_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_vault_owner(uuid) to authenticated;

revoke execute on function public.get_emergency_vault_key(uuid) from public, anon, authenticated;
grant execute on function public.get_emergency_vault_key(uuid) to authenticated;
