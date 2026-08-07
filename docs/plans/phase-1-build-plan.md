# Password Manager — Phase 1 Build Plan (Web + Desktop + Mobile + Browser Extensions, Supabase backend)

## Context

The repo (`password-manager`) is currently empty (just a README) — this is a from-scratch build. The goal is a production-ready, cross-platform password manager: web app, desktop app (Mac + Windows, Electron), mobile app (React Native), and browser extensions (Chrome/Firefox/Edge), backed by Supabase Cloud.

Research into current password managers (1Password, Bitwarden, Dashlane, NordPass, Keeper — Aug 2026) shows the table-stakes bar is: zero-knowledge end-to-end encryption, cross-platform sync, password generator, TOTP/2FA storage, secure notes/cards/identities, breach/dark-web monitoring, biometric unlock, secure item sharing, emergency access, and import/export. The clearest emerging/competitive gap to plan for (not necessarily ship on day one) is **passkey (WebAuthn credential) storage and autofill** — increasingly treated as essential rather than a nice-to-have — plus post-quantum-readiness as a roadmap note.

**Decisions confirmed with the user:**
- Mobile: **React Native** (share TS crypto/business logic with web where possible)
- Desktop: **Electron**, targeting **macOS + Windows** (desktop is the priority platform)
- Backend: **Supabase Cloud** (managed, not self-hosted)
- Browser extensions: Chrome, Firefox, Edge (Manifest V3)
- **This plan is Phase 1 only**: a lean, secure core product for personal/small-team use — no billing/subscriptions, no admin console, no enterprise SSO, no marketing site. Phase 2 (out of scope, future work) turns this into a commercial SaaS product (Stripe billing, plan tiers, org/team admin, enterprise SSO/SCIM). **The Phase 1 schema and architecture must leave clean extension points for Phase 2** without requiring a rewrite.

The single most important constraint driving this plan: **Supabase's own auth (email/password login) must be architecturally separate from the vault's encryption key.** Supabase (like any backend) only ever sees a domain-separated, derived value used for login — never the master password, never the actual vault encryption key, never plaintext vault data. Getting this key-derivation/envelope-encryption model right is the foundation everything else depends on, so it's built and tested first.

---

## 1. Monorepo Architecture

**Tooling:** Turborepo + pnpm workspaces (simpler fit than Nx for a mostly-TS build/test pipeline across Vite/Expo/Electron).

```
password-manager/
  apps/
    web/                  # Vite + React SPA
    desktop/               # Electron shell (main + preload), loads apps/web build
    mobile/                 # Expo React Native app (prebuild + EAS, not Expo Go)
    browser-extension/      # MV3 extension via WXT (Chrome/Firefox/Edge from one codebase)
  packages/
    core-crypto/            # pure TS: KDF, HKDF domain separation, envelope encryption, keypairs, TOTP — platform-adapter pattern over libsodium
    core-domain/             # Zod item schemas, password generator, health-check scoring, sync/reconciliation logic
    api-client/              # typed Supabase client wrapper (auth, RPC, Realtime helpers)
    ui/                       # Radix + Tailwind component library (DOM targets: web/desktop/extension popup only)
    config/                    # shared eslint/tsconfig/tailwind configs
  supabase/
    migrations/
    functions/                 # Deno edge functions
    tests/                      # pgTAP RLS regression tests
  turbo.json
  pnpm-workspace.yaml
```

**Sharing reality:** `core-crypto`, `core-domain`, `api-client` are shared by all four surfaces (RN uses `react-native-libsodium` behind the same adapter interface as `libsodium-wrappers-sumo` on web/electron/extension, so ciphertext is cross-compatible). `packages/ui` is DOM-only — React Native gets its own components but reuses the same hooks/logic from `core-domain`. Desktop is a thin Electron wrapper around the built `apps/web` output plus native-only capabilities (secure storage, menu, auto-update) — not a parallel app.

---

## 2. Security & Cryptography Model

This is the section to get exactly right before writing any app UI.

**Key derivation & domain separation:**
1. User sets a master password. A random 16-byte `kdf_salt` is generated client-side.
2. `stretchedKey = Argon2id(masterPassword + SecretKey, kdf_salt, params)` via libsodium `crypto_pwhash` (32 bytes). Params stored per-user (`kdf_memlimit`, `kdf_opslimit`, `kdf_version`) so they can be upgraded later. Baseline: 256 MiB/opslimit 3 on web/desktop, 64 MiB/opslimit 2 on mobile/extension.
3. HKDF-SHA256 splits `stretchedKey` into two domain-separated secrets:
   - `KEK` (info=`"vault-kek"`) — stays on-device, wraps the vault key. Never transmitted.
   - `authLoginSecret` (info=`"supabase-auth"`) — this, not the real master password, is what's passed to `supabase.auth.signInWithPassword`. Supabase only ever bcrypt-hashes this derived value.
4. A **random** 32-byte Vault Master Key (VMK) is generated at signup (not password-derived), wrapped by `KEK` (XChaCha20-Poly1305), stored as `profiles.wrapped_vault_key`. Changing the master password only re-wraps VMK — never re-encrypts every item.
5. **Adopt a 1Password-style "Secret Key"**: a random 128-bit value generated at signup, shown once, fed into step 2's KDF alongside the master password. This means a database leak + weak master password alone isn't enough to brute-force a vault. Build this in from day one — retrofitting it later is disruptive.

**Envelope encryption for items:** each `vault_items` row has its own random item key, wrapped by VMK. Content encrypted with the item key (XChaCha20-Poly1305, random nonce, AAD bound to item id+version to block ciphertext-swap attacks). Per-item keys are what make secure sharing possible without exposing VMK.

**Secure sharing (asymmetric):** each user has an X25519 keypair; public key stored plaintext, private key wrapped by VMK. Sharing an item re-wraps just that item's key to the recipient's public key via `crypto_box` — the server never sees plaintext content or an unwrapped key. Public-key lookup goes through a rate-limited edge function to resist email enumeration.

**Biometric unlock (wraps the derived key, never replaces the KDF):**
- Desktop: Electron `safeStorage` (Keychain/DPAPI-backed) for quick-unlock, gated by a native Touch ID/Windows Hello prompt where available, with graceful fallback.
- Mobile: `react-native-keychain`, biometric-gated (Face ID/Touch ID/Android Keystore+BiometricPrompt).
- Extension: no reliable OS biometric hook — use `chrome.storage.session` (in-memory, cleared on browser close) for a bounded unlock TTL in Phase 1.

**TOTP:** stored as an optional encrypted field inside a login item's ciphertext — no separate table needed. Codes generated client-side (RFC 6238) via the `otpauth` package.

**Recovery:** because VMK is random and nothing is server-recoverable, a lost master password + Secret Key is genuinely unrecoverable (must be disclosed to users). Mitigation: an **Emergency Access** flow (trusted contact's public key wraps a copy of VMK, released after a server-enforced 7–14 day wait unless denied) plus a printable/exportable "Emergency Kit" (email + Secret Key) at signup.

**Crypto library standardization:** libsodium everywhere — `libsodium-wrappers-sumo` (web/electron/extension) and `react-native-libsodium` (RN), both wrapped behind one adapter interface in `core-crypto` (`deriveKeys`, `wrapKey`/`unwrapKey`, `encryptItem`/`decryptItem`, `generateKeypair`, `boxForRecipient`) so ciphertext is portable across platforms.

---

## 3. Application Secrets & Credentials Management

Distinct from user vault data (§2 covers that): this is about *our own* infrastructure secrets — API keys, signing certs, service credentials.

**Supabase keys:**
- `anon` key: public, safe to ship in client bundles (web/desktop/mobile/extension) — RLS is the actual access control, not key secrecy.
- `service_role` key: bypasses RLS entirely — **never** shipped to any client. Used only inside Edge Functions (injected as a Supabase-managed function secret) and CI migration jobs. Treated as the single highest-value secret in the system.
- Per-environment Supabase projects (dev/staging/prod) each get their own key pairs — no key reuse across environments.

**Third-party API keys** (HIBP, Resend/Postmark for transactional email, future breach-monitoring providers): held only as Edge Function environment secrets (`supabase secrets set`), never in client bundles, never in a table.

**Local development:** `.env.local` per app (gitignored via a shared `.gitignore` pattern), `.env.example` committed with placeholder keys so onboarding is copy-and-fill. No real prod/staging secrets ever touch a developer's `.env.local` — dev points at the dev Supabase project only.

**CI/CD secrets (GitHub Actions):** stored as encrypted repo/environment secrets, scoped per environment (dev/staging/prod each with protected branches + required reviewers on prod deploys):
- Supabase `service_role` key + project refs (per env) for migration jobs.
- Code-signing material: Apple Developer ID cert + notarization credentials, Windows code-signing cert (e.g. Azure Trusted Signing) — for `release-desktop`.
- Store-submission credentials: Chrome Web Store / AMO / Edge Partner Center API credentials, Apple/Google mobile store credentials — for `release-extension` / `release-mobile`.
- Never printed to logs; GitHub Actions masks registered secrets automatically, but avoid `echo`-ing them regardless.

**Rotation & handling:**
- `service_role` key and third-party API keys rotated on a fixed schedule (e.g. quarterly) and immediately on any suspected exposure (accidental log, contributor offboarding).
- No secret is ever committed — enforce with a pre-commit/CI secret-scanning step (e.g. `gitleaks`) as part of the `ci.yml` pipeline from day one.
- For a solo/small team, GitHub Actions' own encrypted secrets store is sufficient for Phase 1 — no need to stand up a dedicated secrets manager (Vault/Doppler) unless the team grows or Phase 2's compliance needs require it; note this as a Phase 2 reconsideration point, not a Phase 1 gap.

---

## 4. Supabase Backend Design

**Core tables (all RLS-enabled):** `profiles` (kdf params, wrapped VMK, keypair, Secret Key marker), `vaults` (`type` constrained to `'personal'` in Phase 1, leaving room for `'organization'` later), `folders`, `vault_items` (wrapped item key, ciphertext, nonce, AAD, soft-delete tombstone + version for sync), `shared_items` (item key re-wrapped per recipient, permission, revocation), `devices`, `emergency_access` (status machine enforced server-side), `audit_log` (service-role-only writes for sharing/emergency-access events).

**RLS strategy:** ownership checks via SQL helper functions (e.g. `is_vault_owner(vault_id)`) rather than inlining joins in every policy — so Phase 2's org-membership model is a one-function change, not a policy rewrite across every table. `emergency_access` status transitions go through a `SECURITY DEFINER` edge function, never a raw client `UPDATE`, so the wait-period logic can't be bypassed.

**Edge Functions (Deno):** `hibp-check` (k-anonymity breach-check proxy, cached, rate-limited), `lookup-public-key` (enumeration-resistant sharing lookup), `get-kdf-params` (public, enumeration-resistant KDF-params-by-email lookup — needed so a fresh device can sign in at all), `emergency-access-request/-approve/-cron-release` (scheduled release after wait period), `send-notification` (transactional email for share/new-device/emergency-access events).

**Realtime & Storage:** `postgres_changes` subscriptions (RLS-scoped automatically) drive cross-device sync; clients decrypt locally into an encrypted-at-rest local cache (IndexedDB on web/extension, SQLite on RN) — plaintext only ever lives in memory. Conflict handling via `version` column, last-write-wins with a prompt only on genuine concurrent edits. Private `attachments` Storage bucket, client-encrypted before upload, short-lived signed URLs for download.

**Phase 2 headroom (not built now, just left open):** `vaults.type` already extensible to `'organization'`; no billing/plan columns yet — future `organizations`/`subscriptions` tables are additive migrations; RLS-via-helper-function pattern chosen specifically so org-membership checks extend cleanly later.

---

## 5. Phase 1 Feature Set

**MVP-critical:** zero-knowledge signup/auth + unlock/auto-lock, vault CRUD (logins/notes/cards/identities), folders/favorites/search, password generator (length/charset/passphrase + entropy display), TOTP generation with clipboard auto-clear, cross-device Realtime sync, browser-extension autofill (gesture-triggered, MV3), biometric/OS-native unlock on desktop + mobile, basic 1:1 secure sharing (read), CSV/1Password/Bitwarden import + encrypted export, client-side password health (`zxcvbn` reused/weak detection) + HIBP breach check.

**Fast-follow (still Phase 1, sequenced after MVP):** emergency access workflow, encrypted attachments, sharing write-permission + revocation + multi-recipient, **passkey support** (store/display passkey metadata + conditional-mediation autofill via the extension — a full custom WebAuthn virtual authenticator is bigger scope, sequence it after core surfaces ship), hardware security key as an MFA factor on Supabase Auth login, broader import coverage (Dashlane/Keeper/NordPass/LastPass).

**Explicitly out of scope for Phase 1:** proprietary dark-web scraping beyond HIBP, AI anomaly detection, post-quantum crypto (roadmap note only), travel-mode vault hiding, and everything Phase 2 (billing, org admin, SSO).

---

## 6. Per-Surface Implementation Notes

- **Web** (`apps/web`): Vite + React + TS, Zustand/Jotai + TanStack Query over Supabase, React Hook Form + Zod (from `core-domain`), Tailwind + `packages/ui`, IndexedDB local cache.
- **Desktop** (`apps/desktop`, Electron): wraps `apps/web` build; `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, minimal `contextBridge` API. `safeStorage` for quick-unlock. `electron-builder` + `electron-updater`; Mac notarization (`@electron/notarize` + Apple Developer ID) and Windows code signing required for distribution.
- **Mobile** (`apps/mobile`, Expo/React Native): Expo prebuild + EAS Build (not Expo Go — native modules like `react-native-libsodium`/`react-native-keychain` require it). React Navigation, biometric-gated VMK via `react-native-keychain`. Native autofill (iOS Credential Provider extension, Android AutofillService) is the heaviest lift — flagged as its own fast-follow milestone after core mobile CRUD/sync ships.
- **Browser Extension** (`apps/browser-extension`): **WXT** framework for one codebase → Chrome/Firefox/Edge MV3 builds. Service worker holds no persistent secrets in module state (unlocked VMK lives in `chrome.storage.session` only). Content scripts detect forms but never do crypto — they message the background worker. Default to narrow, incrementally-requested `host_permissions` (not `<all_urls>`), autofill only on explicit user gesture.

---

## 7. Build Order

0. **Foundations:** monorepo scaffold, Supabase dev project, `core-crypto` + known-answer tests, `core-domain` schemas, Postgres schema/RLS drafted and pgTAP-tested.
1. **Web MVP:** auth/unlock, vault CRUD, generator, TOTP, folders/search, verified Realtime sync across two sessions.
2. **Browser extension MVP:** WXT scaffold, form detection, gesture-triggered autofill/save, cross-browser builds.
3. **Desktop packaging:** Electron shell, `safeStorage` quick-unlock, signing/notarization, auto-update.
4. **Health check + breach check + import/export.**
5. **Secure sharing:** key lookup, send/accept/revoke, notifications.
6. **Mobile core:** Expo app, auth/CRUD/sync, biometric unlock.
7. **Mobile native autofill:** iOS Credential Provider, Android Autofill Service.
8. **Emergency access, attachments, passkey stretch.**
9. **Hardening & store submissions:** security checklist pass, Chrome/Firefox/Edge store submissions, TestFlight/Play internal tracks.

Building all four surfaces at once isn't realistic for a small team — web ships first (fastest to validate the crypto/sync model), then extension (biggest competitive gap if missing), then desktop (thin wrapper, low marginal cost once web exists), then mobile (highest native-code cost, especially autofill).

---

## 8. Testing, CI/CD, Release

- **Unit:** Vitest for `core-crypto` (Argon2id/HKDF/AEAD known-answer tests, RFC 6238 TOTP vectors, keypair round-trips — these gate every release) and `core-domain` (schemas, generator entropy, health scoring, import mapping fixtures).
- **Integration/e2e:** Playwright (web flows + MV3 extension loaded unpacked, autofill against fixture forms), Maestro (Expo app), pgTAP (RLS regression — every table must deny cross-user access, blocking CI gate).
- **CI (GitHub Actions):** shared `ci.yml` (lint/typecheck/unit via `turbo run`, Playwright, local `supabase start` + pgTAP), separate release workflows per surface — `release-web` (Vercel/Cloudflare Pages), `release-extension` (WXT → Chrome Web Store/AMO/Partner Center), `release-desktop` (electron-builder matrix on macos-latest/windows-latest with signing secrets), `release-mobile` (EAS Build + Submit).
- **Environments:** separate Supabase projects for dev/staging/prod; migrations go through staging first; secrets only via CI, never committed.

---

## 9. Verification

- Crypto known-answer-test suite blocking in CI before any release.
- Manual security checklist per release: confirm master password/VMK never appear in network payloads (proxy/devtools inspection against staging), RLS cross-user denial spot-checks, clipboard auto-clear timing, auto-lock triggers, extension gesture-only autofill, MV3 manifest lint (no remote code).
- Cross-device sync test: edit propagation latency, offline-then-reconnect reconciliation, sharing propagation to recipient.
- Extension autofill regression pass against real sites with varied form patterns (multi-step, iframe-embedded, dynamically injected).
- Import/export round-trip diff test against real Bitwarden/1Password export fixtures.
- Internal store tracks (Chrome unlisted, Firefox self-hosted signed xpi, TestFlight/Play internal) before any public submission.

---

## Critical Files to Start With

- `packages/core-crypto/src/index.ts` — KDF/HKDF/envelope-encryption/keypair adapter every surface depends on; build and test this first.
- `supabase/migrations/0001_init.sql` — foundational schema (`profiles`/`vaults`/`vault_items`/`shared_items`/`emergency_access`) + RLS policies.
- `packages/core-domain/src/schemas.ts` — shared Zod item schemas used by every surface's forms and sync logic.
- `packages/api-client/src/client.ts` — typed Supabase client + Realtime subscription helpers.
- `apps/browser-extension/wxt.config.ts` — MV3 cross-browser build and permission model (the most architecturally constrained surface).

---

## Addendum — what changed during implementation

This plan was written before any code existed. A few real adjustments came up
while actually building Phase 1, recorded here rather than silently editing
the plan above:

- **HKDF-SHA256 isn't actually exposed as a callable function** in the
  installed `libsodium-wrappers-sumo` build (only the byte-length *constants*
  are — verified at runtime). Domain separation uses
  `crypto_kdf_derive_from_key` instead (libsodium's own multi-subkey KDF,
  designed for exactly this "derive N keys from 1 master key" case) — see
  `packages/core-crypto/src/kdf.ts`.
- **A public `get-kdf-params` Edge Function was added**, not originally listed
  above. Signing in on a brand-new device needs this account's KDF
  salt/params *before* a session exists, and `profiles` SELECT is
  (correctly) restricted to `id = auth.uid()`. KDF params aren't secret
  (same as any password hash's stored params), but *whether an email is
  registered* is worth not leaking cheaply — this function returns
  deterministic-looking fake params for a nonexistent email so its response
  shape/timing don't distinguish the two cases, same posture as
  `lookup-public-key`.
- **Column-level `REVOKE` on `emergency_access.wrapped_vault_key_for_grantee`
  needed a second step.** Postgres computes access as the union of
  table-level and column-level grants — revoking just the column was a
  no-op against Supabase's default blanket table-level `GRANT`. Fixed by
  revoking the table grant and re-granting an explicit column allowlist.
  Caught by applying the migration against a real local Postgres instance,
  not by inspection.
- **`profiles.email` was client-writable and unbound from `auth.users.email`**,
  with no uniqueness constraint. A security review (parallel agent-verified,
  confidence 9/10) found that any authenticated user could set their own
  `profiles.email` to a victim's real address — since `lookup-public-key` and
  `get-kdf-params` both resolve identity purely via `profiles.email`, this
  let an attacker hijack secure-sharing key lookups aimed at the real victim.
  A related, lower-severity issue (confidence 7/10, independently confirmed
  with a working exploit reproduction): both functions used `.ilike()`
  instead of an exact match, letting `%`/`_` wildcards turn a
  one-email-at-a-time lookup into a partial-match search primitive. Fixed
  together in `0003_bind_profile_email_to_auth.sql`: a trigger
  unconditionally overwrites `profiles.email` from `auth.users` (lowercased)
  on every insert/update, a case-insensitive unique index backs it, and both
  Edge Functions switched to exact `.eq()` matches. Verified live against
  Postgres — a spoofing attempt is now silently overwritten back to the
  attacker's own email.
