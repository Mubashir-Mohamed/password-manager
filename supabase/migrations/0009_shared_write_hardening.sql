-- Two defense-in-depth fixes to 0007_write_permission_sharing.sql, found by
-- a security review of that migration. Neither has a working exploit path
-- today (see the analysis in each item below) — same "not exploitable as
-- written, but exactly the failure-prone pattern this project has already
-- been burned by twice" posture as
-- 0004_restrict_policies_and_functions_to_authenticated.sql's own fixes.

-- 1. `vault_items_update_write_share` was created without `TO authenticated`
--    (defaults to PUBLIC, i.e. anon too), reintroducing the exact pattern
--    0004 set out to eliminate project-wide. Not currently exploitable:
--    0006_grant_authenticated_table_access.sql only grants table-level
--    UPDATE on vault_items to `authenticated` ("No anon grants anywhere"),
--    and Postgres requires a role to pass the base GRANT before RLS is even
--    evaluated — so anon is blocked at the grant layer regardless of what
--    this policy's role list says, and has_write_share() would separately
--    evaluate false for anon anyway (auth.uid() is NULL). Fixed for
--    consistency with every other policy in this project regardless.
alter policy "vault_items_update_write_share" on public.vault_items
  to authenticated;

-- 2. `restrict_shared_write_columns()`'s column allowlist for a
--    write-permission (non-owner) update checked vault_id/folder_id/type/
--    wrapped_item_key/favorite/is_deleted/domain_hmac, but missed
--    created_at — so a write-share recipient could smuggle an arbitrary
--    created_at through the same UPDATE that legitimately changes
--    content/version, contradicting the migration's own stated intent
--    ("limited to the item's ciphertext + version"). Low real-world impact
--    (nothing in this codebase's RLS policies, edge functions, or access
--    control reads vault_items.created_at — it's display/sort metadata
--    only, per a repo-wide grep done as part of this review), but the fix
--    is one line and matches the pattern already used for every other
--    protected column, so there's no reason to leave the gap open.
create or replace function public.restrict_shared_write_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_vault_owner(old.vault_id) then
    return new; -- owner: no restriction, existing behavior unchanged
  end if;

  if new.vault_id <> old.vault_id
    or new.folder_id is distinct from old.folder_id
    or new.type <> old.type
    or new.wrapped_item_key <> old.wrapped_item_key
    or new.favorite <> old.favorite
    or new.is_deleted <> old.is_deleted
    or new.domain_hmac is distinct from old.domain_hmac
    or new.created_at <> old.created_at
  then
    raise exception 'write-permission sharing may only update item content, not %',
      case
        when new.vault_id <> old.vault_id then 'vault_id'
        when new.folder_id is distinct from old.folder_id then 'folder_id'
        when new.type <> old.type then 'type'
        when new.wrapped_item_key <> old.wrapped_item_key then 'wrapped_item_key'
        when new.favorite <> old.favorite then 'favorite'
        when new.is_deleted <> old.is_deleted then 'is_deleted'
        when new.domain_hmac is distinct from old.domain_hmac then 'domain_hmac'
        else 'created_at'
      end
    using errcode = '42501';
  end if;

  return new;
end;
$$;
