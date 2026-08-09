-- pgTAP isn't auto-enabled by `supabase test db` — it must be created
-- explicitly, in a file that sorts before the tests that use it (test files
-- run in alphabetical order; hence the `000-` prefix). Confirmed against
-- current Supabase docs (docs.../local-development/testing/pgtap-extended)
-- while diagnosing a real CI failure: `supabase/tests/rls.test.sql` was in
-- the wrong location (needs to be under `supabase/tests/db/`, not
-- `supabase/tests/` directly) AND never created this extension, so every run
-- failed at `select plan(...)` with "function plan does not exist".
create extension if not exists pgtap with schema extensions;

begin;
select plan(1);
select ok(true, 'pgTAP is enabled');
select * from finish();
rollback;
