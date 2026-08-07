-- Phase 1 schema — zero-knowledge password manager.
--
-- Everything that is user secret data (vault key material, item content,
-- private keys) is stored as ciphertext produced client-side by
-- packages/core-crypto. Postgres never receives a plaintext password, note,
-- card number, or unwrapped key — see docs/design build plan §2 and §4.
--
-- Encrypted payload columns use one of two shapes, matching core-crypto's
-- output types exactly:
--   wrapped key   (WrappedPayload):  { "nonce": "...", "ciphertext": "..." }
--   item content  (ItemCiphertext):  { "nonce": "...", "ciphertext": "...", "aad": "..." }
-- Both are stored as jsonb so the shape is validated by a CHECK constraint
-- instead of trusting the client to send well-formed data.

create extension if not exists "pgcrypto";

-- ── helpers ─────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- `is_vault_owner` is defined further down, immediately after the `vaults`
-- table — a LANGUAGE SQL function body is validated against the catalog at
-- CREATE FUNCTION time, so it can't reference a table that doesn't exist yet.

create or replace function public.wrapped_payload_shape_ok(payload jsonb)
returns boolean
language sql
immutable
as $$
  select payload ? 'nonce' and payload ? 'ciphertext';
$$;

create or replace function public.item_ciphertext_shape_ok(payload jsonb)
returns boolean
language sql
immutable
as $$
  select payload ? 'nonce' and payload ? 'ciphertext' and payload ? 'aad';
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth.users row. Created client-side right after
-- supabase.auth.signUp() succeeds — NOT by a trigger — because the row's
-- content (kdf_salt, wrapped_vault_key, keypair) has to be computed by
-- core-crypto on the client before it exists anywhere.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,

  kdf_algo text not null default 'argon2id',
  kdf_salt text not null,
  kdf_memlimit integer not null,
  kdf_opslimit integer not null,
  kdf_version smallint not null default 1,

  wrapped_vault_key jsonb not null,
  public_key text not null,
  wrapped_private_key jsonb not null,

  -- Non-secret marker only (e.g. a short checksum/prefix) — never the Secret
  -- Key itself — used purely so the client can sanity-check a re-entered
  -- Secret Key before attempting a full unlock. See build plan §2 point 5.
  secret_key_marker text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Phase 2 headroom (not built now): default_organization_id, plan_tier.
  constraint wrapped_vault_key_shape check (public.wrapped_payload_shape_ok(wrapped_vault_key)),
  constraint wrapped_private_key_shape check (public.wrapped_payload_shape_ok(wrapped_private_key))
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- No delete policy — account deletion is a dedicated flow (Settings, not a
-- raw DELETE), left for a fast-follow.

-- ── vaults ──────────────────────────────────────────────────────────────────

create table public.vaults (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'My Vault',
  -- Phase 2 adds 'organization'; Phase 1 only ever creates 'personal' vaults.
  type text not null default 'personal' check (type in ('personal')),
  created_at timestamptz not null default now()
  -- Phase 2 headroom: organization_id uuid references organizations(id).
);

create or replace function public.is_vault_owner(target_vault_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.vaults
    where id = target_vault_id
      and owner_id = auth.uid()
  );
$$;
-- SECURITY DEFINER + a narrow, single-purpose body: every RLS policy below
-- calls this instead of inlining the join, so Phase 2's org-membership model
-- (build plan §4 "RLS strategy") is a one-function edit, not a policy rewrite
-- across every table that references a vault.

alter table public.vaults enable row level security;

create policy "vaults_select_own" on public.vaults
  for select using (owner_id = auth.uid());
create policy "vaults_insert_own" on public.vaults
  for insert with check (owner_id = auth.uid());
create policy "vaults_update_own" on public.vaults
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "vaults_delete_own" on public.vaults
  for delete using (owner_id = auth.uid());

-- ── folders ─────────────────────────────────────────────────────────────────

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  -- Folder names are encrypted too (users' folder names can themselves be
  -- sensitive, e.g. "Divorce lawyer", "Job search") — same ItemCiphertext shape.
  name_encrypted jsonb not null,
  created_at timestamptz not null default now(),
  constraint name_encrypted_shape check (public.item_ciphertext_shape_ok(name_encrypted))
);

create index folders_vault_id_idx on public.folders (vault_id);

alter table public.folders enable row level security;

create policy "folders_all_via_vault_ownership" on public.folders
  for all using (public.is_vault_owner(vault_id)) with check (public.is_vault_owner(vault_id));

-- ── vault_items ─────────────────────────────────────────────────────────────

create table public.vault_items (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  type text not null check (type in ('login', 'note', 'card', 'identity')),

  wrapped_item_key jsonb not null,
  content jsonb not null, -- ItemCiphertext, aad bound to `${id}:${version}`

  -- Optional keyed-HMAC of the normalized domain (computed client-side, key
  -- never leaves the client) — lets a future autofill-matching query filter
  -- server-side without leaking which sites a user has accounts on in
  -- plaintext. Fast-follow optimization, nullable in Phase 1.
  domain_hmac text,

  favorite boolean not null default false,
  is_deleted boolean not null default false, -- soft-delete/tombstone for sync
  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wrapped_item_key_shape check (public.wrapped_payload_shape_ok(wrapped_item_key)),
  constraint content_shape check (public.item_ciphertext_shape_ok(content))
);

create index vault_items_vault_id_idx on public.vault_items (vault_id);
create index vault_items_folder_id_idx on public.vault_items (folder_id);
create index vault_items_domain_hmac_idx on public.vault_items (domain_hmac) where domain_hmac is not null;

create trigger vault_items_set_updated_at
  before update on public.vault_items
  for each row execute function public.set_updated_at();

alter table public.vault_items enable row level security;

-- The SELECT policy (owner OR non-revoked share recipient) is created further
-- down, right after the `shared_items` table — it needs that table to exist
-- first, and `shared_items.item_id` in turn references `vault_items(id)`, so
-- the two tables have a circular ordering dependency that's resolved by
-- splitting "create the tables" from "add the cross-referencing policy".
create policy "vault_items_insert_owner" on public.vault_items
  for insert with check (public.is_vault_owner(vault_id));
create policy "vault_items_update_owner" on public.vault_items
  for update using (public.is_vault_owner(vault_id)) with check (public.is_vault_owner(vault_id));
create policy "vault_items_delete_owner" on public.vault_items
  for delete using (public.is_vault_owner(vault_id));
-- NOTE: write-permission sharing (build plan §4 fast-follow) needs a second
-- UPDATE policy branch checking `shared_items.permission = 'write'` — left out
-- of Phase 1 MVP on purpose; read-only sharing ships first.

-- ── shared_items ────────────────────────────────────────────────────────────

create table public.shared_items (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.vault_items (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  wrapped_item_key jsonb not null, -- item key re-wrapped to to_user's public key (crypto_box)
  permission text not null default 'read' check (permission in ('read', 'write')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint wrapped_item_key_shape check (public.wrapped_payload_shape_ok(wrapped_item_key)),
  constraint no_self_share check (from_user_id <> to_user_id)
);

create index shared_items_to_user_idx on public.shared_items (to_user_id);
create index shared_items_item_id_idx on public.shared_items (item_id);

alter table public.shared_items enable row level security;

create policy "shared_items_select_participant" on public.shared_items
  for select using (to_user_id = auth.uid() or from_user_id = auth.uid());
create policy "shared_items_insert_from_owner" on public.shared_items
  for insert with check (
    from_user_id = auth.uid()
    and exists (
      select 1 from public.vault_items vi
      where vi.id = item_id and public.is_vault_owner(vi.vault_id)
    )
  );
create policy "shared_items_revoke_from_owner" on public.shared_items
  for update using (from_user_id = auth.uid()) with check (from_user_id = auth.uid());

-- Deferred from the vault_items section above: owner has full access, and a
-- recipient of a (non-revoked) share can now also SELECT the same encrypted
-- row and decrypt it locally with the item key `shared_items` gave them — the
-- row itself is never duplicated for sharing.
create policy "vault_items_select_owner_or_shared" on public.vault_items
  for select using (
    public.is_vault_owner(vault_id)
    or exists (
      select 1 from public.shared_items si
      where si.item_id = vault_items.id
        and si.to_user_id = auth.uid()
        and si.revoked_at is null
    )
  );

-- ── devices ─────────────────────────────────────────────────────────────────

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text,
  platform text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index devices_user_id_idx on public.devices (user_id);

alter table public.devices enable row level security;

create policy "devices_all_own" on public.devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── emergency_access ────────────────────────────────────────────────────────

create table public.emergency_access (
  id uuid primary key default gen_random_uuid(),
  grantor_id uuid not null references public.profiles (id) on delete cascade,
  grantee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'recovery_requested', 'recovery_approved', 'recovery_rejected')),
  wait_time_days integer not null default 7,
  -- VMK wrapped to the grantee's public key — populated only once recovery is
  -- approved and released; null until then.
  wrapped_vault_key_for_grantee jsonb,
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_self_grant check (grantor_id <> grantee_id),
  constraint wrapped_vault_key_for_grantee_shape check (
    wrapped_vault_key_for_grantee is null or public.wrapped_payload_shape_ok(wrapped_vault_key_for_grantee)
  )
);

create index emergency_access_grantor_idx on public.emergency_access (grantor_id);
create index emergency_access_grantee_idx on public.emergency_access (grantee_id);

alter table public.emergency_access enable row level security;

create policy "emergency_access_select_participant" on public.emergency_access
  for select using (grantor_id = auth.uid() or grantee_id = auth.uid());
create policy "emergency_access_insert_grantor" on public.emergency_access
  for insert with check (grantor_id = auth.uid());
-- Deliberately NO client-facing UPDATE policy: status transitions (accept,
-- request recovery, approve/reject, and — critically — the wait-period
-- release that populates wrapped_vault_key_for_grantee) all go through
-- SECURITY DEFINER edge functions using the service_role key, per build plan
-- §2 "Recovery" and §4 "emergency-access-request/-approve/-cron-release" —
-- so the wait-time logic can't be bypassed by a direct client UPDATE.

-- RLS is row-level, not column-level — the SELECT policy above lets a grantee
-- see their emergency_access row (so the UI can show status/wait countdown)
-- but that alone would also expose wrapped_vault_key_for_grantee the instant
-- it's written, before the wait period actually elapses.
--
-- IMPORTANT: Postgres computes effective access as the UNION of table-level
-- and column-level grants — revoking SELECT on just one column (`revoke
-- select (col) ... from authenticated`) is a silent no-op as long as a
-- blanket table-level SELECT still exists, which Supabase's `public` schema
-- grants to `authenticated` by default. Verified against a live Postgres
-- instance while writing this migration: the naive single-column REVOKE did
-- NOT block access. The table-level grant has to be revoked and replaced
-- with an explicit column allowlist for the REVOKE to mean anything.
revoke select on public.emergency_access from authenticated;
grant select (id, grantor_id, grantee_id, status, wait_time_days, requested_at, created_at)
  on public.emergency_access to authenticated;
-- wrapped_vault_key_for_grantee is deliberately excluded from that column
-- list — the only way to read it is through the SECURITY DEFINER function
-- below, which enforces status = 'recovery_approved'.

create or replace function public.get_emergency_vault_key(access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select wrapped_vault_key_for_grantee into result
  from public.emergency_access
  where id = access_id
    and grantee_id = auth.uid()
    and status = 'recovery_approved';

  if result is null then
    raise exception 'Emergency access key not available yet';
  end if;

  return result;
end;
$$;

grant execute on function public.get_emergency_vault_key(uuid) to authenticated;

-- ── audit_log ───────────────────────────────────────────────────────────────

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  item_id uuid,
  metadata jsonb not null default '{}',
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_log_user_id_idx on public.audit_log (user_id);

alter table public.audit_log enable row level security;

create policy "audit_log_select_own" on public.audit_log
  for select using (user_id = auth.uid());
-- No insert/update/delete policy for the `authenticated` role: audit entries
-- for security-sensitive actions (sharing, emergency access) are written
-- server-side only (service_role, from Edge Functions), so a compromised
-- client can't forge or omit them. See build plan §4.
