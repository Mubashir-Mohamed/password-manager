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
- **RLS policies were missing an explicit `TO authenticated`, and two
  `SECURITY DEFINER` functions (`is_vault_owner`, `get_emergency_vault_key`)
  were directly callable by `anon`.** Found by a `/supabase` skill audit
  against its Supabase-specific security checklist. Neither was exploitable
  as written — every policy already has an ownership predicate that
  evaluates to NULL/false for `anon` (`auth.uid()` is NULL), and both
  functions check `auth.uid()` internally — but both are exactly the
  failure-prone patterns the checklist calls out, so both were closed as
  defense-in-depth in `0004_restrict_policies_and_functions_to_authenticated.sql`.
  The first attempt at the function fix (`revoke execute ... from public`)
  turned out to be a no-op — verified live, `anon` could still call
  `is_vault_owner` directly and get a real answer back — because Supabase's
  project bootstrap grants EXECUTE to `anon` explicitly via
  `alter default privileges`, not just implicitly through PUBLIC. Same root
  cause as the `emergency_access` column-grant bug above (table/function
  REVOKE against the generic "everyone" grant doesn't touch a grant made
  directly to a specific role); the corrected version revokes from
  `public, anon, authenticated` before re-granting to `authenticated` only.
- **§7 step 7 (iOS native autofill), first pass:** the Credential Provider
  Extension is scaffolded (`apps/mobile/targets/credentials-provider/`) via
  `@bacons/apple-targets`, with a Swift decrypt-only crypto port
  (`VaultCrypto.swift`, linking the *same* `Clibsodium.xcframework` binary
  react-native-libsodium already vendors — not a reimplementation), a shared
  Keychain Access Group for the biometric-gated VMK cache, and a shared
  App Group `UserDefaults` suite (via `react-native-shared-group-preferences`)
  for the ciphertext item cache the extension reads. The extension
  deliberately does **not** derive the KDF itself or hold a live IPC
  connection to the main app — same "OS-level cache, not a live relay"
  pattern as the desktop Quick Access overlay's quick-unlock cache.
  - `@bacons/apple-targets` needs **CocoaPods 1.16.2+** (specifically an
    `xcodeproj` gem new enough to parse Xcode 16's `PBXFileSystemSynchronizedRootGroup`
    ISA) — this environment's system CocoaPods was 1.14.3 and choked with an
    opaque `xcodeproj` parse error; fixed with `gem install cocoapods
    --user-install` (1.17.0). Also needs `LANG=en_US.UTF-8`/`LC_ALL=en_US.UTF-8`
    set — CocoaPods 1.14.3 crashed outright without it (unrelated Ruby
    `unicode_normalize` bug), newer CocoaPods is more tolerant but it's
    worth keeping set.
  - `@bacons/apple-targets` picks up a `pods.rb` file inside a target
    directory automatically, evaluated inside a Podfile `target` block
    whose name is the **target directory's basename**, not the `name:`
    field in `expo-target.config.js` — those two must match exactly or
    `pod install` fails with "Unable to find a target named X". Used this
    to vendor `Clibsodium.xcframework` into the extension via a small
    generated local podspec (`plugins/withCredentialsProviderPod.js`,
    regenerated every `expo prebuild` since the xcframework's path depends
    on the current machine's node_modules resolution) referenced with
    `:path` (development-pod mode), not `:podspec =>` — the latter makes
    CocoaPods try to actually fetch `s.source`, which doesn't apply to an
    already-local vendored binary.
  - **Verified:** TS typecheck/lint/tests pass; `expo prebuild` generates
    the extension target cleanly; `pod install` succeeds (81 pods,
    including the custom `ClibsodiumXCFramework` linkage). **Not verified:**
    actual Swift compilation. This sandbox's Xcode 26.6 has no iOS platform
    component installed (only an old iOS 17.2 Simulator runtime left over
    from a prior install, which this Xcode version doesn't recognize as a
    valid destination) — every `xcodebuild build` destination (simulator,
    generic device) fails with "iOS 26.5 is not installed," and downloading
    that platform component is a multi-GB operation not attempted here.
    Swift syntax errors, API misuse, or entitlement/provisioning issues in
    `targets/credentials-provider/*.swift` are consequently **unconfirmed**
    — the next session with a fully-provisioned Xcode should run
    `xcodebuild build` (or just open the workspace and build from Xcode
    directly) before trusting this beyond "the surrounding plumbing works."
  - Android `AutofillService` is a separate, not-yet-started effort —
    `autofillSync.ts` already no-ops on Android in anticipation.
  - **§5 fast-follow — sharing's write-permission + multi-recipient, now built.**
    0001_init.sql had flagged the missing piece explicitly: "write-permission
    sharing ... needs a second UPDATE policy branch checking
    `shared_items.permission = 'write'` — left out of Phase 1 MVP on
    purpose." That branch (`has_write_share` + a new `vault_items` UPDATE
    policy, `0007_write_permission_sharing.sql`) is now in, plus a piece the
    original build plan hadn't called out: RLS authorizes the UPDATE at the
    row level but has no column-level equivalent, and a write-share
    recipient never holds the VMK — so they have no legitimate way to
    produce a new `wrapped_item_key`, move the item to a vault/folder they
    don't own, or touch its type/favorite/soft-delete state. A `BEFORE
    UPDATE` trigger (`restrict_shared_write_columns`) closes that gap,
    checked column-by-column against `OLD`. `0008_shared_items_recipient_
    email_and_dedup.sql` adds the two things multi-recipient sharing needed
    to be usable in the UI, not just possible in the schema: `to_email`
    denormalized onto the row (same reasoning as `from_public_key` in 0005 —
    the sharer can't SELECT a recipient's `profiles` row after the fact any
    more than the recipient could the sender's) so "shared by me" can show
    who each share is with, and a partial unique index
    (`item_id, to_user_id) where revoked_at is null`) so re-sharing with an
    already-active recipient updates their permission instead of silently
    duplicating the row.
    - **Verified against real Postgres**, same workaround this repo's own
      pgTAP suite documents using before pgtap was available in-sandbox — a
      throwaway local Postgres 16 instance (this sandbox has it installed;
      Docker's daemon does not run here), a stubbed `auth.users`/`auth.uid()`,
      every migration applied in order. Beyond the ad hoc scenarios (a
      write-share recipient updating content succeeds; the same recipient
      trying to smuggle a new `wrapped_item_key` or `vault_id` through the
      same UPDATE is rejected by the trigger; a revoked write-share loses
      access; a duplicate active share hits the unique index; permission
      bump-via-UPDATE works), the actual `supabase/tests/db/001-rls.sql`
      file itself was run — not just informally checked — against a small
      hand-written shim reimplementing just the four pgtap functions this
      suite actually calls (`plan`/`is`/`throws_ok`/`finish`) as plain
      PL/pgSQL, since the real `pgtap` extension isn't installed in this
      sandbox either. All 17 assertions (12 pre-existing + 5 new) passed
      unmodified through that shim. This is corroborating evidence, not a
      substitute for the real `supabase test db` / real pgTAP run — that's
      still the authoritative check and still hasn't happened in-sandbox,
      same caveat the existing pgTAP suite note already carries.
    - App layer: `shareItemWithEmail` takes a `permission` and is safe to
      call repeatedly for more recipients on the same item (multi-recipient
      was already inherent to `shared_items` being one row per
      item+recipient — the gap was entirely in the UI only ever showing/
      offering one). A `23505` from the new unique index falls back to
      `updateSharePermission` rather than surfacing as an error. A
      write-share recipient's save path is a new function,
      `encryptSharedItemUpdate` — deliberately *not* `encryptUpdatedItem`,
      since that one unwraps/rewraps via VMK the recipient never has;
      the new path re-encrypts with the raw item key `openBox` already
      recovered and never touches `wrapped_item_key`, matching what the
      server-side trigger allows. `ItemDetailScreen`'s share panel now shows
      current recipients (permission dropdown + revoke) inline, and
      `SharedScreen` groups "shared by me" by item instead of a flat share
      list, and lets a write-share recipient edit-and-save a shared login
      directly from "shared with me".
- **§7 step 7 (Android native autofill), first pass:** `native/android/autofill/`
  (Kotlin, registered into the generated project by
  `plugins/withAndroidAutofillService.js`) — `PasswordManagerAutofillService`
  (`AutofillService`) + `AutofillUnlockActivity` (the biometric-gated picker
  UI, Android's standard `Dataset.Builder#setAuthentication` pattern) + a
  decrypt-only crypto port + a Keystore-backed VMK cache + a plain
  SharedPreferences ciphertext cache (no App Group equivalent needed — same
  app process, unlike iOS).
  - **No NDK needed, unlike iOS.** Android has no libsodium `.so` bound to
    anything callable from arbitrary Kotlin (react-native-libsodium's own
    JNI bridge only installs a JSI binding for JS, not a Java/Kotlin API),
    and this sandbox has no NDK installed to build a custom JNI shim against
    the vendored `.so` anyway. Used Bouncy Castle's `XChaCha20Poly1305`
    (`org.bouncycastle.crypto.modes.XChaCha20Poly1305`, needs
    bcprov-jdk18on **>= ~1.80** — 1.79 doesn't have the class yet) instead —
    pure JVM, no native compilation. **Cross-checked, not assumed:** a real
    ciphertext produced by core-crypto's actual `encryptItem` (WASM
    libsodium) was decrypted with Bouncy Castle 1.85.2 using the identical
    key/nonce/aad and recovered byte-identical plaintext (ad hoc script, not
    committed — reproducible via `packages/core-crypto`'s exports + a
    `bcprov-jdk18on` jar from Maven Central).
  - VMK cache is Android Keystore-encrypted (AES-256-GCM, hardware-backed)
    but deliberately **not** `setUserAuthenticationRequired(true)` on the
    key itself — that would force a second biometric prompt on the main app
    immediately after every unlock. The biometric gate that matters is
    `AutofillUnlockActivity`'s own `BiometricPrompt` call before it *reads*
    the cache — see `VaultKeystore.kt`'s header comment. Same posture as
    desktop's Electron `safeStorage` cache.
  - **Verified end-to-end on a real emulator, not just "it compiles":**
    `expo prebuild --platform android` generates the service/activity/
    dependencies cleanly; **`./gradlew :app:assembleDebug` is BUILD
    SUCCESSFUL from a clean prebuild** (real APK, not just Kotlin
    compilation); the APK **installed and launched on a booted Android
    13 emulator** (Pixel 6 Pro API 34) without crashing; and
    **`dumpsys autofill` confirmed the OS itself recognizes and selects
    `PasswordManagerAutofillService`** (`Service Label: Vault Autofill`,
    correct component, `Setup complete: true`) after setting it as the
    active autofill service. This is a real OS-level integration check,
    not a lint pass. What's *not* verified: the interactive
    fill flow (BiometricPrompt → decrypt → pick → fill) — blocked by test-
    harness friction unrelated to this code (Chrome delegates to its own
    built-in password manager before third-party autofill services unless
    reconfigured via `chrome://password-manager/settings`, which isn't
    reachable via an external intent; the emulator's native fallback test
    surface, WiFi's password field, has a selection-state-dependent
    Settings spinner that resists coordinate-based automation; and
    starting Metro to test through this app's own screens hit a fourth,
    separate pre-existing pnpm/Metro module-resolution error, see below).
  - Three **pre-existing, unrelated** issues were hit and fixed/documented
    along the way (present in this Expo SDK 52 / RN 0.76 template
    regardless of autofill):
    1. **Fixed persistently** (`withKotlinVersionFix`): `expo-modules-core`
       2.2.3's Compose integration needs a Compose Compiler version that
       requires Kotlin 1.9.25+, but the generated `android/build.gradle`'s
       buildscript classpath resolves `kotlin-gradle-plugin` to 1.9.24
       (transitively, since it's declared with no explicit version) —
       broke compiling `expo-modules-core` itself, before ever reaching
       this project's own code. Pins the classpath dependency + forces it
       repo-wide via `resolutionStrategy`.
    2. **Fixed persistently** (`withPackageListFix`), and the root cause
       fully traced this time: the generated
       `app/build/generated/autolinking/.../PackageList.java` (React
       Native's own old-arch-interop autolinking, a *different* generator
       from Expo's own `ExpoModulesPackageList`) was emitting
       `import expo.core.ExpoModulesPackage;` — a class that doesn't
       exist. Root cause: `expo-modules-autolinking`'s Android resolver
       (`reactNativeConfig/androidResolver.js`) globs for any
       `*Package.{java,kt}` file implementing `ReactPackage` and returns
       as soon as it finds one — `ExpoModulesPackage.kt` matches, so the
       resolver returns *before* reaching the check that would otherwise
       skip Expo modules (`expo-module.config.json` presence), and it
       then computes the import's package name from
       `expo/android/build.gradle`'s `namespace "expo.core"` — a stale
       value that doesn't match `ExpoModulesPackage.kt`'s real
       `package expo.modules` declaration (which `expo`'s own
       `react-native.config.js` correctly declares separately, but that
       declaration is never reached because the glob match short-circuits
       first). A genuine upstream bug in the `expo` package, not this
       project or its dependency versions — worth an upstream report.
       Since config plugins only run at `expo prebuild` time (before this
       generated file exists — it's written by a Gradle task on every
       build, not by prebuild), the fix hooks the actual
       `generateAutolinkingPackageList` Gradle task and patches the
       file's text right after it's written, on every build.
    3. **Not fixed, only noted:** starting Metro (`npx expo start`) and
       loading the app in-dev-server hit
       `Unable to resolve module @babel/runtime/helpers/interopRequireDefault`
       — a separate, well-known class of pnpm-monorepo/Metro
       module-resolution mismatch (Metro's default resolver isn't fully
       aware of pnpm's symlinked `node_modules` layout in some configs).
       Affects the whole app's dev workflow, not just autofill — worth
       its own follow-up (`@expo/metro-config` pnpm support / hoisting).
  - Not started: `onSaveRequest` (offering to save a *new* password from
    a form) — declines every request for now (`callback.onFailure(...)`),
    matching this pass's fill-only scope.
  - **iOS, same session:** the missing Xcode platform component from the
    iOS pass turned out to be a fast local install, not a multi-GB
    download — `xcodebuild -downloadPlatform iOS` resolved in seconds
    (bundled with Xcode, just not yet "installed"/registered with
    CoreSimulator). With a fresh iOS 26.5 simulator, the **main app**
    target builds and links successfully; the **credentials-provider
    extension** target does not — `error: unable to resolve module
    dependency: 'Clibsodium'` on `targets/credentials-provider/VaultCrypto.swift`,
    confirming the exact FRAMEWORK_SEARCH_PATHS gap flagged as a risk in
    the original iOS pass (CocoaPods isn't propagating the vendored
    xcframework's search path to the `credentials-provider` target's
    build settings) — a fixable bug in `plugins/withCredentialsProviderPod.js`'s
    Podfile wiring, not attempted yet since the extension itself wasn't
    the focus of this pass.
- **Security review of 0007_write_permission_sharing.sql, same session as
  the write-permission-sharing fast-follow above.** A three-stage review
  (identify → independently re-verify each candidate against the actual
  migration files, discard anything below high confidence) surfaced two
  candidates and disqualified both as reportable vulnerabilities — neither
  had a working exploit path — but both were real, if low-impact, gaps
  against this project's own established conventions, so both got fixed in
  `0009_shared_write_hardening.sql` anyway rather than left as documented
  debt:
  - `vault_items_update_write_share` was created without `TO authenticated`
    (defaults to PUBLIC), reintroducing exactly the pattern
    0004_restrict_policies_and_functions_to_authenticated.sql eliminated
    project-wide. Not exploitable as written — 0006 only grants table-level
    UPDATE on `vault_items` to `authenticated` ("No anon grants anywhere"),
    and Postgres checks the base GRANT before RLS is even evaluated, so
    `anon` never reaches this policy regardless of its role list — but
    fixed for consistency regardless.
  - `restrict_shared_write_columns()`'s column allowlist (vault_id/
    folder_id/type/wrapped_item_key/favorite/is_deleted/domain_hmac) missed
    `created_at`, so a write-share recipient could smuggle an arbitrary
    `created_at` through the same UPDATE that legitimately changes content/
    version — contradicting the trigger's own stated intent. A repo-wide
    grep confirmed nothing in this codebase's RLS/edge functions/access
    control actually reads `vault_items.created_at` (display/sort metadata
    only), so real-world impact is negligible, but the fix is one line and
    matches the pattern already used for every other protected column.
  - Both fixes re-verified the same way as the rest of this session's
    sharing work: a fresh local Postgres 16 instance, every migration
    applied in order, plus the actual `supabase/tests/db/001-rls.sql` file
    (now 18 assertions, +1 for the `created_at` regression) run unmodified
    through the same pgtap-function shim described above. All pass. Real
    `supabase test db` / pgTAP still hasn't run in-sandbox — same
    open item as everywhere else in this addendum.
