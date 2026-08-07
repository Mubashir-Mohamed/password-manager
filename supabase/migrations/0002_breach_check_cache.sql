-- Server-side cache for the HIBP k-anonymity proxy (supabase/functions/hibp-check).
-- Only ever stores a 5-character SHA-1 prefix and HIBP's response for that
-- prefix — never a password or a full password hash. This table is written
-- only by the Edge Function (service_role); it's not exposed to clients.

create table public.breach_check_cache (
  hash_prefix text primary key check (hash_prefix ~ '^[A-F0-9]{5}$'),
  response_body text not null,
  fetched_at timestamptz not null default now()
);

alter table public.breach_check_cache enable row level security;
-- No policies for `authenticated`/`anon` at all: this table is read/written
-- exclusively by the Edge Function's service_role client, which bypasses RLS.
