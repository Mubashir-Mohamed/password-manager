-- Every migration through 0005 assumed Supabase's platform automatically
-- grants table-level access to `anon`/`authenticated` on new tables in the
-- `public` schema (this repo's own `/supabase` skill flags exactly this as
-- something to check, not assume: "newly created tables may not be
-- automatically exposed via the Data API... anon and authenticated roles
-- will need to be explicitly granted access" — depends on the project's Data
-- API settings). That assumption was never actually verified against a real
-- Supabase environment until CI's `supabase test db` job did, for real,
-- against the actual `supabase start` Postgres image: every DML statement in
-- the pgTAP suite failed with "permission denied for table X" — a base
-- GRANT failure, which happens BEFORE row-level security is even evaluated
-- (RLS violations say "new row violates row-level security policy"; this
-- says "permission denied for table", a different failure mode entirely).
--
-- Fix: stop assuming, grant explicitly — least-privilege, matching exactly
-- the operations each table's RLS policies (0001_init.sql) actually define.
-- No `anon` grants anywhere (matches 0004's authenticated-only hardening).

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.vaults to authenticated;
grant select, insert, update, delete on public.folders to authenticated;
grant select, insert, update, delete on public.vault_items to authenticated;
grant select, insert, update on public.shared_items to authenticated;
grant select, insert, update, delete on public.devices to authenticated;

-- emergency_access: INSERT was never granted at all (emergency_access_insert_grantor
-- policy was unreachable without it). SELECT is deliberately NOT re-granted
-- here at the table level — 0004_restrict_policies_and_functions_to_authenticated.sql
-- already grants it as an explicit column allowlist (excluding
-- wrapped_vault_key_for_grantee), and that narrower grant is what should win.
grant insert on public.emergency_access to authenticated;

-- audit_log: SELECT only (audit_log_select_own policy) — INSERT/UPDATE/DELETE
-- deliberately stay ungranted to `authenticated`; only the service_role
-- client in Edge Functions writes audit entries, so a compromised client
-- can't forge or omit them (see 0001_init.sql's audit_log section).
grant select on public.audit_log to authenticated;

-- breach_check_cache: no grants to authenticated/anon at all, by design —
-- only the service_role client in the hibp-check Edge Function touches it.

-- ── service_role ────────────────────────────────────────────────────────
-- Same discovery, same fix: `service_role` carries the `bypassrls` role
-- attribute (set when the role is created — see supabase_stub.sql locally;
-- Supabase's platform does the equivalent), which bypasses RLS *policy*
-- checks, but that is a completely separate mechanism from base table
-- GRANTs — a role can bypass every RLS policy on a table and still get
-- "permission denied for table X" if it was never granted access to the
-- table at all. Confirmed live: the emergency-access-cron-release Edge
-- Function's UPDATE (service_role, bypasses RLS) still failed with exactly
-- that error until this grant was added. service_role is the trusted
-- backend identity for every Edge Function in this project (hibp-check,
-- lookup-public-key, get-kdf-params, emergency-access-cron-release) and is
-- never exposed to a client, so it gets full access on every table,
-- including the ones authenticated/anon can't touch at all.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant all privileges on functions to service_role;
