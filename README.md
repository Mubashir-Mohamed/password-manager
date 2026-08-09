# Password Manager

A zero-knowledge password manager — web app, desktop app (macOS/Windows), browser extensions (Chrome/Firefox/Edge), and a mobile app (iOS/Android) — backed by Supabase. Client-side encryption means Supabase (and anyone with database access) only ever sees ciphertext; the encryption keys are derived from your master password and never leave your device.

This is **Phase 1**: a lean, secure core product for personal/small-team use. See:
- [`docs/plans/phase-1-build-plan.md`](docs/plans/phase-1-build-plan.md) — the full build plan (architecture, security model, backend design, build order), plus an addendum of what changed while actually implementing it
- [`docs/design/mobile-ui-design-plan.md`](docs/design/mobile-ui-design-plan.md) — mobile (iOS/Android) design system and screen specs
- [`docs/design/desktop-ui-design-plan.md`](docs/design/desktop-ui-design-plan.md) — desktop (macOS/Windows) design system, aligned with mobile

## Status

Everything below has been **built and verified in this repo** — not just scaffolded:

| Area | Status |
|---|---|
| `packages/core-crypto` | Real Argon2id + HKDF-equivalent KDF, XChaCha20-Poly1305 envelope encryption, X25519 sharing, RFC 6238 TOTP. **23/23 tests passing**, including RFC 6238 known-answer vectors and AEAD tamper-detection. |
| `packages/core-domain` | Zod item schemas, password/passphrase generator, strength/reuse scoring, CSV login parser (Chrome/Bitwarden-style exports). **23/23 tests passing**. |
| `packages/api-client` | Typed Supabase client wrapper (auth, CRUD, sharing, Realtime, Edge Function calls). Typechecks clean against a hand-written `Database` type. |
| `packages/ui` | Shared component library (Button, Card, TextField, PasswordField, TOTPCode, StrengthMeter, EmptyState, Toast, ConfirmSheet) implementing the design tokens from both design docs. |
| `supabase/migrations` | Full schema + RLS policies (5 migrations). **Every migration applied against a real local Postgres instance during development** — caught and fixed three genuine bugs along the way: a column-level `REVOKE` that was a silent no-op against Supabase's default table-level `GRANT` (`emergency_access`); client-writable `profiles.email` unbound from `auth.users.email` (secure-sharing identity spoofing, found by a security review); and RLS policies/`SECURITY DEFINER` functions missing explicit `TO authenticated` (found by a `/supabase` skill audit — the function-grant fix itself needed a second pass, since `revoke ... from public` alone didn't touch Supabase's explicit per-role grant to `anon`). All scenarios — cross-user denial, sharing + revocation, the emergency-access RPC gate, ciphertext-shape constraints, the email-spoof fix, the anon-lockout fix — were exercised against live Postgres, not just written. |
| `apps/web` | Vite/React MVP — signup (with Secret Key reveal), unlock, vault CRUD, password generator, TOTP, Security Dashboard, CSV import, encrypted vault export/import, and **secure 1:1 item sharing** (X25519, read-only, with revoke). **Builds clean, 11/11 integration tests passing (real crypto round-trips, no mocks — including sharing's full sender→recipient protocol and two attack scenarios: a third party can't open someone else's box, and a forged sender identity is rejected), and manually smoke-tested in a live browser** — confirmed `generateSecretKey()`, the strength meter, and the full signup UI work correctly with zero runtime errors. |
| `apps/desktop` | Electron shell (main/preload/tray/secureStorage/global-shortcut Quick Access window). Typechecks clean. **Not runtime-tested** — no GUI environment available in this session; needs a real run on macOS/Windows to verify. |
| `apps/browser-extension` | WXT MV3 extension (popup, background service worker, content script with gesture-triggered fill). **Builds clean** — real `manifest.json`/`background.js`/`content.js`/`popup.html` generated. One deliberate, documented scope gap: the content script's `<all_urls>` `matches` is an install-time broad grant, not yet the incrementally-requested per-site permission the design calls for (flagged in code, not silently left broken). |
| `apps/mobile` | Expo/React Native app — Unlock + Vault Home + item CRUD screens (add/edit/delete, Realtime sync across devices), biometric-keychain wrapper, and a **real** `sodium.native.ts` adapter (not a stub) that Metro auto-resolves for `react-native-libsodium`. Native autofill (iOS Credential Provider Extension + Android AutofillService), first pass: real Swift/Kotlin decrypt-only crypto ports of `envelope.ts` (Bouncy Castle on Android, cross-verified byte-for-byte against core-crypto's real ciphertext; the same `Clibsodium` binary the main app uses on iOS), Keychain/Keystore-backed biometric-gated VMK caching. **Android verified further**: `./gradlew :app:assembleDebug` succeeds, installs and runs on a real emulator, and `dumpsys autofill` confirms the OS selected the service as active — the interactive fill flow itself (tap field → unlock → pick → fill) not yet exercised end-to-end. **iOS partially verified**: the main app builds and links on a real simulator; the credentials-provider extension target has a known, unfixed linking gap (missing `FRAMEWORK_SEARCH_PATHS` for `Clibsodium`) blocking its own compilation. Full verification notes and open items in the build plan §7 addendum. |
| CI | `.github/workflows/ci.yml` (lint/typecheck/test/build, blocking pgTAP RLS gate) + per-surface release workflows. **The actual GitHub Actions run is green** — both jobs, every step — confirmed via the API, not just local `pnpm turbo run` (which had been passing the whole time while real CI silently failed on all 4 prior pushes; local checks don't run the Docker-based pgTAP job or gitleaks, so several real bugs — a pnpm version conflict, pgTAP never being set up correctly, a gitleaks false positive, missing base table `GRANT`s that only a real `supabase start` environment surfaces, and a generated-file dependency that happened to already exist locally — only showed up once the real pipeline was actually checked). |

## Architecture

```
password-manager/
  apps/
    web/                 Vite + React SPA
    desktop/              Electron shell wrapping apps/web
    mobile/                Expo/React Native app
    browser-extension/     WXT MV3 extension (Chrome/Firefox/Edge)
  packages/
    core-crypto/            KDF, envelope encryption, keypairs, TOTP — the security-critical core
    core-domain/             Item schemas, password generator, health scoring
    api-client/               Typed Supabase client wrapper
    ui/                         Shared React components (web/desktop/extension — not mobile, which is DOM-incompatible)
    config/                      Shared eslint/tsconfig/tailwind config + design tokens
  supabase/
    migrations/                  Postgres schema + RLS
    functions/                    Edge Functions (hibp-check, lookup-public-key, get-kdf-params, emergency-access-cron-release)
    tests/                         pgTAP RLS regression suite
```

Turborepo + pnpm workspaces. See the build plan for the full rationale.

## Setup

### 1. Prerequisites
- Node.js ≥ 20, pnpm (`corepack enable && corepack prepare pnpm@9 --activate`)
- A [Supabase](https://supabase.com) project (Cloud, per the build plan) — or the [Supabase CLI](https://supabase.com/docs/guides/cli) for local dev (`supabase start`)

### 2. Install
```bash
pnpm install
```

### 3. Set up Supabase
```bash
# Apply the schema to your project (or a local `supabase start` instance)
supabase link --project-ref YOUR-PROJECT-REF
supabase db push

# Deploy Edge Functions
supabase functions deploy hibp-check lookup-public-key get-kdf-params emergency-access-cron-release

# Set the function secrets they need (service_role key is provisioned automatically;
# KDF_DUMMY_PEPPER is yours to set — see get-kdf-params/index.ts)
supabase secrets set KDF_DUMMY_PEPPER="$(openssl rand -hex 32)"
```

### 4. Configure each app's environment
Copy the relevant `.env.example` and fill in your project's `anon` key — **never** the `service_role` key (see build plan §3):
```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/browser-extension/.env.example apps/browser-extension/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

### 5. Run
```bash
pnpm --filter @password-manager/web dev              # web app — http://localhost:5173
pnpm --filter @password-manager/desktop dev           # desktop (wraps the web dev server)
pnpm --filter @password-manager/browser-extension dev  # extension — load .output/chrome-mv3 unpacked
pnpm --filter @password-manager/mobile start            # Expo — needs a prebuild for native modules, not Expo Go
```

## Testing

```bash
pnpm turbo run lint typecheck test    # everything, monorepo-wide
pnpm --filter @password-manager/core-crypto test   # KDF/encryption/TOTP known-answer tests
supabase test db                                    # pgTAP RLS suite (needs `supabase start`, Docker)
```

## Security model, in one paragraph

Your master password and a randomly-generated Secret Key are combined and stretched with Argon2id, then split into two keys that never touch the same context: one (`authLoginSecret`) is sent to Supabase as your login password — Supabase only ever bcrypt-hashes it; the other (`KEK`) stays on your device and unwraps a random Vault Master Key, which in turn unwraps a per-item key for every password/note/card you save. Sharing an item re-wraps just that item's key to the recipient's public key via X25519 — the server never sees a plaintext key or plaintext content at any point. Full details: build plan §2.

## What's next (fast-follow, not built yet)

Emergency access UI, encrypted attachments, write-permission sharing + multi-recipient (read-only 1:1 sharing is built), passkey support, hardware security keys, broader import formats (1Password/Dashlane/Keeper/NordPass/LastPass), the desktop Quick Access overlay's renderer-side UI, the browser extension's per-site incremental permission flow, and finishing mobile native autofill (fix the iOS extension's `Clibsodium` linking gap, verify the interactive Android fill flow end-to-end, add "save new password" support (`onSaveRequest`) on both platforms). All scoped and sequenced in the build plan §7.
