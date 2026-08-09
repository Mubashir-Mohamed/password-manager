-- Secure sharing (build plan §7 step 5) needs the recipient to open the
-- crypto_box the sender wrapped the item key with — which requires the
-- SENDER's public key, not just the recipient's own keypair (crypto_box is
-- authenticated: each side needs the other's public key). The recipient
-- cannot fetch it from `profiles` directly — that table's SELECT policy is
-- (correctly) `id = auth.uid()` only, and there's no reason to weaken it
-- just for this.
--
-- Public keys aren't secret (profiles.public_key is already stored in
-- plaintext, by design — see 0001_init.sql), so denormalizing the sender's
-- public key directly onto the shared_items row at share-creation time is
-- the simplest correct fix: the sender already has their own public key
-- client-side (no lookup needed to write it), and the recipient can already
-- SELECT this row via the existing `shared_items_select_participant` policy.

alter table public.shared_items
  add column from_public_key text not null;

comment on column public.shared_items.from_public_key is
  'Sender''s X25519 public key at share time — lets the recipient open the crypto_box in wrapped_item_key without needing SELECT access to the sender''s profiles row.';
