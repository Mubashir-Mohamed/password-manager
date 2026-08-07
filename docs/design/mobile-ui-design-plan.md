# Mobile App UI/UX Design Plan — iOS & Android

Companion to the [Phase 1 build plan](../../../../.claude/plans/generate-a-plan-to-distributed-barto.md). This is a design instruction document for `apps/mobile` (Expo/React Native) — it defines the visual language, screen structure, and platform conventions to follow when building the actual screens. It does not cover web/desktop/extension UI.

---

## Context

**App type:** password manager — a high-trust, security-critical utility. Users open it in two very different mental states: (a) calm, routine lookup ("what's my Netflix password") and (b) stressed, time-pressured ("I'm mid-signup on a stranger's checkout form and need this fast"). The UI has to serve both without feeling clinical or cold.

**Primary users on mobile:** the same account as web/desktop, but mobile is disproportionately used for two things — quick lookups/autofill during real-world tasks, and TOTP code retrieval. Vault *editing* happens more on desktop; mobile should optimize for **fast, confident retrieval**, not data entry.

**What the user should feel:** in control, protected, never rushed into a mistake. Not "delighted" in a playful-app sense — the emotional register here is closer to Revolut/a banking app than Duolingo: calm competence, subtle reassurance, zero gimmicks around anything security-critical (no cute mascots on the unlock screen).

**Platforms:** iOS (SF Symbols, native nav patterns, Face ID) and Android (Material 3, dynamic color, BiometricPrompt) — one React Native codebase, but platform-aware components where the OS convention differs meaningfully (see §3).

---

## 1. Design Philosophy & Principles

1. **Speed beats decoration.** The most common action (find a credential, copy/autofill it, get a TOTP code) should be reachable in ≤2 taps from unlock. Resist adding visual flourish that slows down the retrieval path.
2. **Never make security feel scary.** Breach alerts, weak-password warnings, and re-auth prompts use amber/informative tones, not alarm-red screens with heavy iconography — a password manager that constantly panics trains users to ignore it.
3. **Trust is built in the boring moments.** The unlock screen, the biometric prompt, the "copied to clipboard" toast — these happen dozens of times a day. They should feel identical and instant every single time. Consistency here matters more than any single "wow" screen.
4. **Mobile = retrieval-first, entry-second.** Bias every layout decision toward scanning and one-tap actions over multi-field forms.

---

## 2. Design System Foundations

### Color (60/30/10)
- **60% neutral base:** app defaults to **dark mode as primary** (matches user expectation for security tools; also better for the frequent "checking my phone at a checkout counter" context) — `#0E0F13` background, with a fully-designed light theme as the alternate, not an afterthought. Light base: `#F7F7F9`.
- **30% complementary:** near-black/near-white text and card surfaces — dark theme cards at `#1A1B21` (one step up from background, no pure-black-on-black), light theme cards at `#FFFFFF` with a `#EAEAEE` border.
- **10% accent:** a single brand accent used sparingly — recommend a deep indigo/violet (`#6C5CE7`-family) rather than the security-industry-default blue, so the product doesn't visually blend into Bitwarden/1Password/Dashlane screenshots. Reserve pure accent-fill for primary CTAs and the "unlocked" state indicator only.
- **Semantic colors, used narrowly:** success `#3DDC97` (item saved, copied), warning/breach `#F5A524` (amber — informative, not alarming), destructive `#F45B69` (delete/revoke confirmations only). No semantic color appears as a large fill — text/icon/border only, except confirmed-destructive action buttons.
- **Text hierarchy via opacity on the neutral, not new colors:** headings 100%, body 85%, secondary/meta 60%, disabled 35%.
- Category/folder chips: soft accent-tinted backgrounds at ~10% opacity fill + full-opacity icon, not solid color blocks (keeps the vault list calm when there are 8+ categories on screen at once).

### Typography
- One family: **Inter** (or the platform system font — SF Pro / Roboto — as a pragmatic fallback for zero extra bundle weight; Inter if a custom font is acceptable for brand consistency across web/mobile).
- 4 sizes only: **28/22/16/13** (screen title / section header / body / meta-caption).
- 2 weights: **Semibold** (titles, item names, values) / **Regular** (body, labels, meta).
- **Tabular/monospace numerals** for anything numeric and glanceable: TOTP codes, password-strength scores, card numbers, the Secret Key. Use `font-variant-numeric: tabular-nums` (or a monospace face for the TOTP code specifically — it's the single most "must be instantly readable" number in the app).
- Vault item titles truncate at one line; usernames/emails truncate with middle-ellipsis so the domain-relevant tail stays visible (`j***@gmail.com` beats `jonathanmiddleinitial…`).

### Spacing (8pt grid)
- Screen horizontal margin: 20px (not 16 — mobile password manager cards benefit from slightly more breathing room than a dense feed app; still divisible into the 4-grid).
- Vault list row: 16px vertical padding, 12px gap between icon/title/subtitle block.
- Card padding: 24px.
- Section gap: 32px; major section gap (e.g. between "Suggestions" and "All Items"): 48px.
- Bottom sheet / modal content: 24px padding, 12px above the primary CTA, CTA itself in the thumb zone with 16px bottom safe-area padding.

### Shadows & Surfaces
- Dark theme: no drop shadows — use a 1px hairline border (`rgba(255,255,255,0.08)`) plus a subtle lighter card surface to convey elevation, since shadows read poorly on dark backgrounds.
- Light theme: soft shadows only, tinted toward the accent hue at very low opacity (`rgba(108,92,231,0.08)`), never pure gray/black.
- The unlock/biometric card gets a faint accent glow (blur+opacity) behind it — the one place a bit of visual "specialness" is earned, since it's the app's signature moment.

### Iconography
- **SF Symbols on iOS, Material Symbols on Android** (platform-native icon sets via `react-native-vector-icons` or per-platform mapping) rather than one custom icon set — icons like the lock, Face ID, fingerprint, and share-sheet glyphs should match what users already recognize from the OS itself. Reserve a small custom icon set only for domain-specific concepts the OS doesn't have (item-type glyphs: login/card/identity/note).
- Site/app favicons (fetched, cached) as the primary visual identifier in the vault list instead of generic lock icons — recognition speed matters more here than in most apps, since users are scanning for "the Chase icon" not reading text.

---

## 3. Platform-Specific Conventions

| | iOS | Android |
|---|---|---|
| Navigation | Bottom tab bar (Vault / Generator / Authenticator / Settings), native large-title headers that collapse on scroll | Bottom nav bar (Material 3), top app bar with dynamic elevation on scroll |
| Biometric | Face ID / Touch ID via `expo-local-authentication`, system-native prompt — never build a custom biometric UI, always defer to the OS sheet | BiometricPrompt (fingerprint/face, device-dependent), same rule — OS-native prompt only |
| Color | Respect Dark Mode as an OS-level signal but let in-app theme override be independent (users may want the app dark even if OS is light, given it's often used at night) | Support **Material You dynamic color** as an optional theme (derives accent from wallpaper) behind a toggle — off by default, since a consistent brand accent matters more for trust than personalization here |
| Gestures | Swipe-back navigation, swipe-to-reveal actions (copy/delete) on vault list rows | Android back gesture/button parity, same swipe actions but confirm destructive swipes with a follow-up tap (Android users are more used to accidental back-swipes) |
| Autofill | iOS Credential Provider Extension — appears in the system AutoFill sheet with its own minimal UI (search + biometric unlock), not the main app UI | Android `AutofillService` — inline suggestion chips above the keyboard; requires its own compact, fast-rendering picker UI, separate design pass from the main app |
| Text scaling | Support Dynamic Type up to at least "Large" without breaking the 4-tier type scale | Support Android font-scale settings equivalently |
| Haptics | `expo-haptics` light impact on successful copy/unlock, notification-style haptic on breach alert | Equivalent Android haptic feedback via same API |

---

## 4. Screen-by-Screen Structure

### 4.1 Onboarding & Account Creation
- Welcome screen: 2–3 sentence value prop, no marketing fluff, single primary CTA ("Create Account") + secondary ("Sign In").
- Master password creation: live strength meter (color + label, not just a bar), inline requirements checklist that ticks off as satisfied (reduces anxiety vs. a static rule list).
- **Secret Key reveal screen** (critical, one-time): full-screen, no back-swipe-to-skip, explicit "I've saved this" confirmation required before proceeding, with a prominent "Save to Files / Print / Copy" action set. This is the single highest-stakes screen in onboarding — treat it like a legal-document acknowledgment, not a casual step.
- Biometric opt-in: shown once, framed around convenience ("Unlock in under a second next time") not security theater.

### 4.2 Unlock / Lock Screen
- The screen users see most often. Minimal: logo mark, biometric prompt auto-triggered on screen focus, master-password fallback field always visible below (not hidden behind a link) so a failed biometric doesn't dead-end the user.
- Auto-lock triggers (configurable: immediately / 1 min / 5 min / on background) surfaced clearly in Settings, not buried.

### 4.3 Vault Home
- Search bar pinned at top (never scrolls away — this is the single most-used control on the screen).
- "Suggestions" section (favicon-matched to the currently relevant context if opened via autofill deep-link) above the full alphabetical/recency list — same pattern as smart search guidance in §"Smarter Search" of the base skill.
- Row = favicon + title + username (truncated) + item-type glyph, swipe-left reveals Copy Password / Copy Username / Delete.
- FAB (bottom-right, thumb zone) for "Add Item," expands to a short-list of type choices (Login/Note/Card/Identity) rather than a full-screen type picker.
- Folders/categories as horizontally scrollable chips above the list, not a separate drilled-into screen — keeps everything one tap away.

### 4.4 Item Detail
- Favicon + site name as header, fields below grouped logically (credentials block, then notes, then metadata/history).
- Password field masked by default with a tap-to-reveal (not a toggle icon buried in a corner — the whole field is tappable), monospace font when revealed.
- Copy actions give immediate feedback: haptic + toast ("Copied — clears in 30s") + the OS clipboard-expiry API where available, reinforcing that the app manages clipboard hygiene for them.
- TOTP code (if present) shown as a large monospace 6-digit code with a circular countdown ring — this is a **peak moment**: it should feel instant and satisfying to glance at, akin to a boarding-pass QR code.

### 4.5 Password Generator
- Large generated password display (monospace, tap-to-copy) at top — the result, not the controls, is the visual hero (echoes the base skill's "emphasize values over labels" rule).
- Sliders for length (one-time-per-generation setting → slider is correct here per the base skill's input-method guidance), toggles for character sets.
- "Regenerate" as a prominent secondary action; "Use this password" as the primary CTA when reached from an Add/Edit Item flow.

### 4.6 Authenticator (TOTP) Tab
- Grid/list of all TOTP codes across the vault, each with the same monospace-code + countdown-ring treatment as item detail — this screen exists because users context-switch here rapidly during login flows and shouldn't have to search.

### 4.7 Security Dashboard
- Opens with a single confident status line ("3 issues need attention" or "Your vault looks good") — never a wall of red, per the calm-not-alarming principle in §1.
- Cards for: weak passwords, reused passwords, breached credentials (HIBP), items without 2FA — each expandable to a filtered list, each item actionable inline (jump to edit) rather than a dead-end report.

### 4.8 Sharing & Emergency Access
- Share flow: recipient lookup by email (rate-limited server-side per the backend plan), permission choice (read/write) as a simple two-option segmented control, explicit confirmation step before the item is shared (irreversible-feeling actions get a confirm screen, not just a toast).
- Emergency Access setup: clear plain-language explanation of the wait-period mechanic before the contact is added — this is a novel-enough concept that it needs a short explainer, not just a form.

### 4.9 Settings
- Grouped list (Account, Security, Autofill, Appearance, About) — standard platform settings pattern, no need to reinvent this screen; consistency with OS Settings conventions reduces cognitive load here specifically.

### 4.10 System States
- **Empty vault (new user):** illustration + "Add your first password" CTA + an offer to import from another manager — turns a blank state into an onboarding continuation, not a dead end.
- **Loading:** skeleton rows matching the vault-list row shape, not a spinner — preserves layout stability.
- **Offline:** a persistent but unobtrusive banner ("Offline — changes will sync") rather than blocking the UI; local cache (per the backend plan) means the app should stay fully usable.
- **Error (sync conflict, network failure):** specific, actionable copy — never a generic "Something went wrong."

---

## 5. Peak & End Moments

- **Peak:** the TOTP code glance and the autofill-completed moment (system autofill sheet closes, user is instantly logged in) are the app's real "magic" moments — invest polish (subtle scale/fade transitions, haptic) here over any onboarding animation.
- **Successful vault unlock:** a quick, understated transition (150–200ms fade/scale) from the lock screen to Vault Home — should feel instantaneous and trustworthy, not showy.
- **End-of-session impression:** since there's no explicit "session end," the equivalent is the **auto-lock transition** — make it feel protective, not punitive (a calm fade to the lock screen, not an abrupt jump-cut).
- **Security Dashboard "all clear" state:** the one place a small celebratory micro-animation (subtle checkmark draw-in) is appropriate — reinforces that staying secure is a positive, maintained state, not just an absence of problems.

---

## 6. Component/Token Library (for engineering handoff)

Deliver as a shared token set consumable by `apps/mobile` (and ideally aligned with `packages/ui`'s tokens for cross-surface consistency, even though components themselves aren't shared):
- Color tokens: `bg/base`, `bg/surface`, `bg/surface-raised`, `text/primary|secondary|tertiary`, `accent/default|subtle`, `semantic/success|warning|danger`.
- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 48, 64`.
- Radius scale: `12` (inputs/small controls), `20` (cards), `28` (sheets/modals).
- Type scale + line-height pairs for the 4 sizes.
- Core components: `VaultListRow`, `ItemDetailField` (with reveal/copy affordance), `TOTPCode` (with countdown ring), `StrengthMeter`, `BiometricPrompt` wrapper, `EmptyState`, `Toast`, `ConfirmSheet`.

## 7. Accessibility
- All tap targets ≥44×44pt.
- Color is never the sole signal (strength meter, breach severity, sync status all pair color with an icon/label).
- Full VoiceOver/TalkBack labeling on masked fields — announce "Password, hidden, double-tap to reveal" rather than reading the mask characters.
- Dynamic Type / Android font-scale support without truncated-into-uselessness layouts (test at largest accessibility sizes, not just "Large").
- Sufficient contrast in both themes, verified against WCAG AA at minimum for all text/background pairs.

## 8. Engineering Handoff Notes
- Styling: **NativeWind** (Tailwind for RN) to keep spacing/color discipline enforced at the utility-class level, matching the design tokens above.
- Animation: **Reanimated 3** + `moti` for the lightweight peak-moment transitions (unlock fade, TOTP ring, success checkmark) — avoid heavier animation libraries given how few animated moments this app actually needs.
- Icons: platform icon set as primary (§3), custom SVGs only for item-type glyphs.
- Favicon fetching/caching: a small edge-function-backed favicon proxy (avoids leaking which sites a user has accounts on to arbitrary third-party favicon APIs directly from the client) — flag as a small addition to the Edge Functions list in the backend plan.
- Build every screen in both light and dark theme from the start — dark is primary, but light must never be a rushed afterthought pass.
