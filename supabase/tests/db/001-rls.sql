-- pgTAP RLS regression suite (build plan §8 "pgTAP — every table must deny
-- cross-user access, blocking CI gate").
--
-- Run locally with the Supabase CLI (requires Docker):
--   supabase start
--   supabase test db
--
-- The pgtap extension itself isn't available in this sandbox, but every
-- scenario below was verified for real against a throwaway local Postgres 14
-- instance (stubbed auth.users/auth.uid() + the real migrations) before this
-- file was written — including three genuine bugs the manual runs caught,
-- all the same underlying Postgres gotcha in different spots: REVOKE against
-- the "everyone" grant (table-level, or FROM PUBLIC) does not remove a grant
-- made directly to a specific role, and Supabase's default project bootstrap
-- makes such per-role grants routine (blanket table GRANTs to
-- anon/authenticated, and default-privilege function EXECUTE grants to the
-- same). Each fix had to revoke from the specific roles, not just the
-- generic one, to actually close the gap:
--   1. A naive column-level REVOKE on emergency_access was a silent no-op
--      against Supabase's default blanket table-level GRANT, fixed in
--      0001_init.sql (revoke table-level, re-grant an explicit column allowlist).
--   2. profiles.email was client-writable with no binding to auth.users.email,
--      letting an authenticated user set it to a victim's address and hijack
--      lookup-public-key/get-kdf-params results aimed at them. Found by a
--      security review, fixed in 0003_bind_profile_email_to_auth.sql (a
--      trigger unconditionally overwrites profiles.email from auth.users on
--      every insert/update, plus a case-insensitive unique index).
--   3. A /supabase skill audit found every RLS policy was missing an
--      explicit `TO authenticated` (defaulted to PUBLIC) and two SECURITY
--      DEFINER functions were directly callable by anon. Fixed in
--      0004_restrict_policies_and_functions_to_authenticated.sql — and the
--      first attempt at that fix (`revoke ... from public`) was itself
--      verified to be a no-op, since Supabase's bootstrap grants EXECUTE to
--      `anon` explicitly, not just implicitly via PUBLIC.
--
-- Update: this file has since actually been run through real pgTAP (built
-- from source locally — Homebrew has no pgtap formula — against Postgres 14),
-- not just informal psql checks, which caught two more real bugs in the
-- TEST FILE ITSELF (not the schema): `throws_ok` was used for RLS-blocked
-- UPDATEs, but Postgres RLS silently filters those to 0 rows affected — it
-- never raises an exception (this is precisely the /supabase skill's own
-- "UPDATE requires a SELECT policy... updates silently return 0 rows, no
-- error" gotcha, just encountered from the test-writing side instead of the
-- policy-writing side). The fix attempt after that — wrapping the UPDATE in
-- a writable CTE inside `is()`'s subquery argument — also failed, since
-- Postgres requires data-modifying CTEs to be at the top level of the query,
-- not nested inside another subquery. Both are now bare top-level UPDATEs
-- followed by a value-unchanged assertion. All 12 tests pass for real.
begin;
select plan(12);

-- Two fake users, inserted directly (bypassing auth.users' normal signup flow
-- — fine for a schema-level RLS test, since RLS only cares about auth.uid()).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

insert into public.profiles (id, email, kdf_salt, kdf_memlimit, kdf_opslimit, wrapped_vault_key, public_key, wrapped_private_key)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'c2FsdA', 268435456, 3,
   '{"nonce":"n","ciphertext":"c"}', 'alice-pub', '{"nonce":"n","ciphertext":"c"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', 'c2FsdA', 268435456, 3,
   '{"nonce":"n","ciphertext":"c"}', 'bob-pub', '{"nonce":"n","ciphertext":"c"}');

-- Act as Alice: create a vault + item.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.vaults (id, owner_id, name) values
  ('a1a1a1a1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice''s Vault');

insert into public.vault_items (id, vault_id, type, wrapped_item_key, content) values
  ('b1b1b1b1-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', 'login',
   '{"nonce":"n","ciphertext":"c"}', '{"nonce":"n","ciphertext":"c","aad":"b1b1b1b1-0000-0000-0000-000000000001:1"}');

select is(
  (select count(*)::int from public.vault_items),
  1,
  'Alice can see her own vault item'
);

-- Switch to Bob: he should see neither Alice's vault nor her item.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.vaults where id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0,
  'Bob cannot see Alice''s vault'
);

select is(
  (select count(*)::int from public.vault_items where id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  0,
  'Bob cannot see Alice''s vault item (not shared)'
);

-- NOT throws_ok: Postgres RLS silently filters an UPDATE to 0 affected rows
-- when the row fails the policy's USING clause — it does not raise an
-- exception. Confirmed by actually running this suite through real pgTAP
-- (not just the informal psql checks used while writing each migration):
-- the throws_ok version of this assertion failed with "caught: no
-- exception", which is Postgres behaving correctly — the bug was in the
-- test's expectation, not the RLS policy. A second attempt (wrapping the
-- UPDATE in a writable CTE inside `is()`'s subquery argument) also failed —
-- Postgres requires a data-modifying CTE to be at the query's top level, not
-- nested inside another subquery — so the UPDATE runs bare here, top-level,
-- and the assertion checks its effect (unchanged) afterward instead.
update public.vault_items set favorite = true
  where id = 'b1b1b1b1-0000-0000-0000-000000000001';

-- Switch back to Alice to check the actual stored value, not just what Bob
-- can see — proves the blocked update had zero effect on the row, not just
-- that it's invisible to Bob (test 3 already covers that).
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select favorite from public.vault_items where id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  false,
  'Bob''s blocked update never touched the actual row — Alice still sees favorite = false'
);
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Alice shares the item with Bob (read-only) — now Bob should be able to
-- SELECT the row (still can't decrypt it without his own wrapped key, but
-- that's a client-side concern, not RLS's).
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.shared_items (item_id, from_user_id, to_user_id, wrapped_item_key, from_public_key, permission) values
  ('b1b1b1b1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', '{"nonce":"n","ciphertext":"c"}', 'alice-pub-key-b64', 'read');

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.vault_items where id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  1,
  'Bob CAN see the item once Alice shares it with him'
);

-- Security-critical for secure sharing (0005_shared_items_sender_public_key.sql):
-- Bob needs Alice's public key to open the crypto_box, but must NOT be able
-- to read her profiles row directly (RLS restricts that to id = auth.uid()).
select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'Bob cannot read Alice''s profile row directly'
);
select is(
  (select from_public_key from public.shared_items where to_user_id = '22222222-2222-2222-2222-222222222222'),
  'alice-pub-key-b64',
  'Bob CAN read Alice''s public key off the shared_items row he participates in — this is how he opens the crypto_box without profile access'
);

-- Same fix as the earlier assertion — bare top-level UPDATE, then verify the
-- value as Alice (Bob CAN see this row now, since it's shared with him, but
-- the UPDATE policy's USING clause — is_vault_owner(vault_id) — still blocks
-- a non-owner write, silently, to 0 rows affected).
update public.vault_items set favorite = true
  where id = 'b1b1b1b1-0000-0000-0000-000000000001';

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select favorite from public.vault_items where id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  false,
  'Bob still cannot UPDATE the shared item (read-only share, no write-permission policy branch in Phase 1) — value unchanged'
);
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Revoke and confirm access is gone again.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.shared_items set revoked_at = now()
  where item_id = 'b1b1b1b1-0000-0000-0000-000000000001' and to_user_id = '22222222-2222-2222-2222-222222222222';

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.vault_items where id = 'b1b1b1b1-0000-0000-0000-000000000001'),
  0,
  'Bob loses access once the share is revoked'
);

-- profiles: users can only ever see their own row.
select is(
  (select count(*)::int from public.profiles),
  1,
  'Bob sees only his own profile row, never Alice''s'
);

-- Security regression (0003_bind_profile_email_to_auth.sql): Bob cannot spoof
-- his profiles.email to Alice's address to hijack sharing/get-kdf-params
-- lookups aimed at her. The sync trigger must silently overwrite it back to
-- his own auth.users email on every UPDATE, not just at insert time.
update public.profiles set email = 'alice@example.com' where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select email from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bob@example.com',
  'Bob cannot spoof his profiles.email to Alice''s — the sync trigger overwrites it back to his real auth.users email'
);

-- Security regression (0004_restrict_policies_and_functions_to_authenticated.sql):
-- the anon role must not be able to call the SECURITY DEFINER functions
-- directly at all — not just get a false/empty answer back. A prior version
-- of this migration only revoked EXECUTE from PUBLIC and left anon's
-- explicit per-role grant (from Supabase's default-privileges bootstrap)
-- intact; verified live against Postgres that the fix below actually blocks
-- it (`revoke ... from public, anon, authenticated` before re-granting).
set local role anon;
select throws_ok(
  $$ select public.is_vault_owner('a1a1a1a1-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'anon cannot call is_vault_owner directly — EXECUTE was revoked from anon''s explicit grant, not just PUBLIC'
);

select * from finish();
rollback;
