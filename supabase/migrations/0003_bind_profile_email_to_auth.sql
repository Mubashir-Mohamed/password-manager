-- Security fix: `profiles.email` was client-writable and unbound from
-- `auth.users.email`, with no uniqueness constraint. Combined with
-- `profiles_insert_self`/`profiles_update_self` policies that only check
-- `id = auth.uid()`, any authenticated user could set their own
-- `profiles.email` to an arbitrary value (e.g. a real victim's address).
-- `lookup-public-key` and `get-kdf-params` both resolve identity purely via
-- `profiles.email` — an attacker could set their email to a victim's, then
-- have items shared with "them" wrap the item key to the attacker's public
-- key instead. Two independent fixes, both required:
--
--   1. `email` is now server-controlled: a trigger overwrites whatever the
--      client sent with the authoritative value from `auth.users` for
--      `auth.uid()`, on every insert AND update. The client can no longer
--      set it to anything but their own real account email.
--   2. A case-insensitive unique index prevents two profiles from ever
--      claiming the same email (which would otherwise make `.maybeSingle()`
--      lookups in the Edge Functions ambiguous/erroring).
--
-- As a consequence, `lookup-public-key`/`get-kdf-params` are switched from
-- `.ilike(email, ...)` (which also let `%`/`_` wildcard characters through,
-- undermining their one-email-at-a-time design intent) to an exact,
-- lowercased `.eq()` match — see those functions' updated source.

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  real_email text;
begin
  select email into real_email from auth.users where id = new.id;
  if real_email is null then
    raise exception 'No matching auth.users row for this profile id';
  end if;
  -- Stored lowercased so a plain `.eq("email", x.toLowerCase())` from the
  -- Edge Functions always matches regardless of the case auth.users.email
  -- happens to be stored in — the unique index below is *also* on
  -- lower(email) as a second layer, but the column itself being pre-
  -- lowercased is what makes exact-match queries actually work.
  new.email := lower(real_email);
  return new;
end;
$$;

create trigger profiles_sync_email
  before insert or update on public.profiles
  for each row execute function public.sync_profile_email();

-- Backfill safety: in case any row was already written with a spoofed email
-- before this migration (dev/staging only — Phase 1 has no production users
-- yet), the unique index would fail to create if duplicates already exist.
-- Re-run the trigger's logic once for existing rows so the index below is
-- guaranteed to succeed.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

create unique index profiles_email_unique_idx on public.profiles (lower(email));
