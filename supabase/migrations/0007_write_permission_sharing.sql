-- Write-permission sharing (build plan §5 fast-follow: "sharing
-- write-permission ... (read-only 1:1 sharing is built)"). 0001_init.sql
-- flagged this as deliberately deferred right where it belongs:
-- "write-permission sharing (build plan §4 fast-follow) needs a second
-- UPDATE policy branch checking `shared_items.permission = 'write'` — left
-- out of Phase 1 MVP on purpose; read-only sharing ships first."
--
-- Same SECURITY DEFINER helper-function pattern as `is_vault_owner` (build
-- plan §4 "RLS strategy") so this stays a one-function edit if Phase 2 needs
-- org-level write roles later.

create or replace function public.has_write_share(target_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.shared_items
    where item_id = target_item_id
      and to_user_id = auth.uid()
      and permission = 'write'
      and revoked_at is null
  );
$$;

comment on function public.has_write_share(uuid) is
  'True if the current user holds a non-revoked write-permission share on this item — the second UPDATE policy branch 0001_init.sql deferred.';

-- Same lesson as is_vault_owner's own grant history in this project
-- (0004_restrict_policies_and_functions_to_authenticated.sql): revoke from
-- every role Supabase's bootstrap may have granted EXECUTE to directly
-- (PUBLIC alone is not enough — see that migration's own note), then grant
-- only to authenticated.
revoke all on function public.has_write_share(uuid) from public, anon, authenticated;
grant execute on function public.has_write_share(uuid) to authenticated;

create policy "vault_items_update_write_share" on public.vault_items
  for update
  using (public.has_write_share(id))
  with check (public.has_write_share(id));

-- The policy above authorizes the UPDATE at the row level, but a
-- write-permission recipient must still be limited to the item's ciphertext
-- + version — they never hold the VMK, so they cannot legitimately produce a
-- new `wrapped_item_key`, and they have no business moving the item between
-- vaults/folders they don't own or touching its soft-delete/favorite state.
-- RLS policies can't restrict individual columns (Postgres has no per-column
-- RLS), so this is enforced with a BEFORE UPDATE trigger instead — same
-- "column-level restriction needs a mechanism beyond the RLS policy itself"
-- lesson as the `emergency_access.wrapped_vault_key_for_grantee` column-grant
-- fix in 0001_init.sql, just a trigger instead of a GRANT allowlist since
-- both owner and shared-write updates go through the same role.
create or replace function public.restrict_shared_write_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_vault_owner(old.vault_id) then
    return new; -- owner: no restriction, existing behavior unchanged
  end if;

  -- Reaching this point without being the owner means the row only passed
  -- the UPDATE policy via has_write_share(id) — enforce the column
  -- allowlist for that path: content + version only.
  if new.vault_id <> old.vault_id
    or new.folder_id is distinct from old.folder_id
    or new.type <> old.type
    or new.wrapped_item_key <> old.wrapped_item_key
    or new.favorite <> old.favorite
    or new.is_deleted <> old.is_deleted
    or new.domain_hmac is distinct from old.domain_hmac
  then
    raise exception 'write-permission sharing may only update item content, not %',
      case
        when new.vault_id <> old.vault_id then 'vault_id'
        when new.folder_id is distinct from old.folder_id then 'folder_id'
        when new.type <> old.type then 'type'
        when new.wrapped_item_key <> old.wrapped_item_key then 'wrapped_item_key'
        when new.favorite <> old.favorite then 'favorite'
        when new.is_deleted <> old.is_deleted then 'is_deleted'
        else 'domain_hmac'
      end
    using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger vault_items_restrict_shared_write
  before update on public.vault_items
  for each row execute function public.restrict_shared_write_columns();
