-- Two small fixes needed to make multi-recipient sharing usable in the UI
-- (build plan §5 fast-follow: "multi-recipient (read-only 1:1 sharing is
-- built)"):
--
-- 1. The "shared by me" list needs to show *who* each share is with, but
--    `shared_items` only ever stored `to_user_id` (a uuid) — `profiles` SELECT
--    is (correctly) restricted to `id = auth.uid()`, so the sharer can't look
--    a recipient's email back up after the fact any more than the recipient
--    could look the sender's public key up in 0005. Same fix as 0005's
--    `from_public_key`: denormalize the one piece of already-known-to-the-
--    sharer identity onto the row at share time, lowercased to match the
--    canonical form `lookup-public-key` and the profiles.email unique index
--    (0003_bind_profile_email_to_auth.sql) both use.
alter table public.shared_items
  add column to_email text not null;

comment on column public.shared_items.to_email is
  'Recipient''s email at share time (lowercased, matching profiles.email''s canonical form) — lets the sharer''s own "shared by me" list show who each share is with, without needing SELECT access to the recipient''s profiles row.';

-- 2. Sharing the same item with the same still-active recipient twice (e.g.
--    to bump them from read to write) previously just inserted a second row
--    — both would independently satisfy `vault_items_select_owner_or_shared`,
--    but only one is meaningful and stale duplicates would accumulate. A
--    partial unique index (scoped to non-revoked shares only, so re-sharing
--    after a revoke is unaffected) makes "one active share per
--    item+recipient" a real constraint instead of an app-layer convention;
--    the app now upserts permission on a 23505 conflict instead of erroring.
create unique index shared_items_active_recipient_idx
  on public.shared_items (item_id, to_user_id)
  where revoked_at is null;
