# Desktop App UI/UX Design Plan — macOS & Windows

Companion to the [Phase 1 build plan](../../../../.claude/plans/generate-a-plan-to-distributed-barto.md) and the [mobile design plan](./mobile-ui-design-plan.md). Scope: `apps/desktop` (Electron shell around `apps/web`). This document defines what carries over from mobile unchanged, what's deliberately different, and the one desktop-only signature moment this surface earns that mobile structurally can't.

---

## 0. Design Brainstorm & Token System

**Subject, in one sentence:** a security tool that a power user keeps running in the background all day and reaches for the instant they need a credential — the desktop app's whole reason to exist over the browser extension is *speed via keyboard, from anywhere on the OS.*

**Color** (inherited from mobile, +2 desktop-only chrome tones):
- `bg/base` dark `#0E0F13` / light `#F7F7F9` — unchanged from mobile.
- `bg/surface` dark `#1A1B21` / light `#FFFFFF` — unchanged from mobile.
- `bg/chrome` dark `#16171C` / light `#ECECF0` — **new**: sits one step darker (dark theme) / one step deeper (light theme) than `bg/surface`, used only for the sidebar and title-bar region, so the app reads as a native windowed tool with real depth, not a browser tab stretched to fill a window.
- `accent` `#6C5CE7` — unchanged from mobile.
- `semantic` success `#3DDC97` / warning `#F5A524` / danger `#F45B69` — unchanged from mobile.

**Type** — Inter for display/body (unchanged from mobile) + one addition: **system monospace** (SF Mono / Cascadia Mono) as a third role, used for keyboard-shortcut chips, the TOTP code, and the Secret Key — desktop surfaces far more keyboard chrome than mobile ever does, so the mono role graduates from "numbers only" to a proper third typographic voice.

**Layout concept:**
> A native three-pane window (sidebar → item list → detail) is the resting state. A global, OS-wide hotkey summons a floating **Quick Access** overlay on top of *any* application — this is the thing the desktop app can do that the browser extension and mobile app structurally cannot (no other app has focus, no browser is required), so it's the feature the whole design should be built around rather than treating the main window as the sole product.

```
Main window (resting state)              Quick Access overlay (summoned anywhere, any app)
┌──────────┬──────────────┬────────────┐  ┌──────────────────────────────┐
│ Sidebar  │ Item list    │ Detail     │  │  🔍  search vault…            │
│ (chrome) │              │            │  │ ──────────────────────────── │
│ Vaults   │ ○ Chase      │ Chase Bank │  │  ● Chase Bank        ⏎ fill  │
│ Folders  │ ○ Netflix    │ ──────────  │  │  ○ Netflix           ⏎ fill  │
│ Favorites│ ○ Figma      │ user@...   │  │  ○ Figma             ⏎ fill  │
│ Trash    │ ○ AWS        │ ●●●●●●●●   │  └──────────────────────────────┘
└──────────┴──────────────┴────────────┘   floats above everything, blurred backdrop,
                                             pulsing accent ring = "vault is unlocked"
```

**Signature element:** the Quick Access overlay's accent ring **pulses gently only while the vault is unlocked**, and sits flat/static/dim the moment it's locked. It's a single ambient animation, but it turns the overlay into a persistent, glanceable trust indicator across the entire OS session — not just a search box, but the one place in the whole product where "am I currently protected" is answered without opening anything.

**Critique & revision:** a first pass here would default to the generic AI cluster of near-black background + one neon accent (acid-green or vermilion) doing all the signaling work through color alone. Two revisions were made against that: (1) the indigo/violet accent is inherited from the mobile plan specifically for cross-surface brand continuity, not picked as a novel "AI-safe" hue — that continuity is the actual design decision, and it's stated here rather than left implicit; (2) the temptation to make Quick Access "just a command palette" (the Raycast/Linear/Spotlight default) was rejected in favor of tying its one animation to the vault's lock state — a plain command palette would be a generic reach for this specific brief, but a command palette whose idle animation *is* the security-status indicator is specific to what this product needs to communicate constantly and ambiently.

---

## 1. Design Philosophy — Deltas from Mobile

Everything in mobile plan §1 (speed over decoration, security never feels alarming, consistency over flourish) applies unchanged. Desktop adds:

1. **Keyboard-first, mouse-second.** Every action reachable via mouse must also have a keyboard path with a visible shortcut hint (⌘F / Ctrl+F search, ⌘N new item, ⌘⇧Space Quick Access). Desktop users of a password manager are disproportionately technical and will judge the app on keyboard completeness within the first five minutes.
2. **Ambient, not modal.** Mobile is opened, used, closed. Desktop is left running — in the menu bar/tray, often minimized. Design for the app being glanced at sideways (tray icon state, notification toasts) as much as for the focused-window state.
3. **Density scales with screen size, not with anxiety.** More information can live on screen at once (three panes vs. mobile's single stack), but the calm-not-alarming rule from mobile §1 still governs the security dashboard — more room is not license for a louder warning treatment.

---

## 2. Foundations — What Carries Over, What Changes

| | Mobile | Desktop |
|---|---|---|
| Color tokens | §2 of mobile plan | Identical, + `bg/chrome` (see §0) |
| Type sizes | 28/22/16/13 | **32/22/16/13/12** — one extra small tier for sidebar labels and list metadata, justified by desktop's larger, denser three-pane layout; still 2 weights (Semibold/Regular) + Medium reserved solely for the Quick Access selected-row state |
| Spacing grid | 8pt, 20px screen margin | Same 8pt grid; sidebar 240px fixed (resizable 200–320px), list pane 320px min, detail pane flexes; 16px pane-internal padding vs. mobile's 20–24px (denser, mouse-precision UI tolerates tighter spacing than touch) |
| Shadows | hairline borders (dark) / tinted soft shadows (light) | Same rule, plus a **blurred backdrop + soft elevated shadow** exclusively for the Quick Access overlay (the one floating surface in the whole app — everything else is flat, windowed content) |
| Iconography | SF Symbols / Material Symbols, favicon-first item rows | Same favicon-first identification; menu-bar/tray icon gets its own 3-state glyph set (locked / unlocked / syncing) since it's visible even when the app window is closed |

---

## 3. Platform-Specific Conventions

| | macOS | Windows |
|---|---|---|
| Window chrome | `titleBarStyle: 'hiddenInset'` — native traffic lights, custom toolbar fills the rest of the title bar row, sidebar starts flush under it | Frameless custom title bar (minimize/maximize/close rendered in-app, matching modern Windows apps like VS Code/Notion) rather than the default MFC-style chrome |
| Global shortcut | `Cmd+Shift+Space` default for Quick Access (customizable in Settings) | `Ctrl+Shift+Space` default, same customization path |
| Menu bar / tray | Menu bar extra (top-right) with quick unlock, quick generate, and lock-now; full native app menu (File/Edit/View/Window) for standard OS menu-bar expectations | System tray icon with equivalent context menu; no OS-level top menu bar, so all menu-bar actions also need a place in the in-app command surface |
| Biometric quick-unlock | Touch ID via `safeStorage` + a native prompt (no custom UI — defer to the system Touch ID sheet, same rule as mobile) | Windows Hello via `safeStorage` equivalent, same defer-to-OS-prompt rule |
| Notifications | Native macOS notification banners for breach alerts / new-device sign-in | Native Windows toast notifications, same triggers |
| Updates | Silent background download via `electron-updater`, a small non-blocking "Restart to update" toast — never a blocking modal | Same pattern; Windows additionally shows the OS-level installer UI briefly during the swap, which is expected and shouldn't be hidden |

---

## 4. Window & Screen Structure

### 4.1 Main Window (three-pane)
- **Sidebar** (`bg/chrome`): Vaults, Folders (nested, collapsible), Favorites, Trash, plus a persistent lock-status chip at the bottom (mirrors the Quick Access ring's pulse — same signature language, smaller scale).
- **Item list** (`bg/surface`): same favicon + title + username row pattern as mobile, but desktop adds inline hover actions (copy icons appear on hover, not swipe-to-reveal) and supports multi-select with shift/cmd-click for bulk move/delete/tag.
- **Detail pane**: same field-by-field structure as mobile's item detail, widened to show metadata (created/modified/last used) inline rather than behind a secondary tap, since there's room for it.

### 4.2 Quick Access Overlay (signature — see §0)
- Summoned by global hotkey from any application; frameless, centered, blurred backdrop over whatever was on screen.
- Fuzzy search across item titles/usernames/domains, arrow-key navigation, Enter to auto-type or copy (configurable default), Escape to dismiss.
- Requires unlock (biometric/master password) inline if the vault has auto-locked since last use — the overlay itself becomes the unlock surface, so users never have to switch to the main window just to unlock.

### 4.3 Password Generator
- Same hero-the-result treatment as mobile (large monospace generated password up top), presented as a **popover** anchored to the relevant field/button rather than a full window — desktop's precision pointer makes a compact popover faster than a full-screen flow.

### 4.4 Security Dashboard
- Same calm-status-line-first structure as mobile §4.7, laid out as a grid of cards (room for all categories visible at once without scrolling) rather than a stacked list.

### 4.5 Settings Window
- Separate native-feeling window (not a route within the main window) — matches desktop-app convention (System Settings, VS Code Preferences) and lets Quick Access shortcut customization live somewhere with room to breathe.

### 4.6 Menu Bar / Tray Presence
- Icon reflects lock state at a glance (3-state glyph, §2). Click opens a compact popover: quick unlock, last 3 recently used items, "Generate password," "Lock now" — the tray equivalent of Quick Access for when the global hotkey isn't the fastest path.

---

## 5. Peak & End Moments

- **Peak:** invoking Quick Access from inside a random third-party app, finding the credential in under a second, and watching the pulsing ring confirm "still unlocked, still protected" — this is the desktop app's entire value proposition compressed into one interaction, and it should get the most animation polish in the whole product (still subtle — a soft 200ms fade/scale on open, per mobile's restraint principle).
- **Auto-lock transition:** identical intent to mobile — the tray icon and sidebar lock-chip both settle into their dimmed "locked" state together, reinforcing one consistent signal rather than two out-of-sync indicators.
- **End-of-session impression:** for an always-running background app, there is no natural "end" — the closest equivalent is quitting/closing the window, which should never feel like data loss (a lightweight "Vault is safe — [App] is still running in the menu bar" toast on first close, shown once, not every time).

---

## 6. Component/Token Library — Desktop Additions

On top of the shared tokens/components from the mobile plan §6:
- `QuickAccessOverlay` (search input, result list, lock-state ring, keyboard-nav handling).
- `TrayPopover` (compact quick-actions surface).
- `SidebarNav` (chrome-toned, collapsible folder tree).
- `KeyboardShortcutChip` (mono-face rendering of shortcut combinations, used in tooltips, the command palette, and Settings).
- `ResizablePane` wrapper (drag-handle divider between sidebar/list/detail, persists user's chosen widths).

## 7. Accessibility
- Full keyboard operability of the entire app, not just Quick Access — every menu, dialog, and list must be reachable and dismissible via keyboard alone (Tab order, Escape-to-close everywhere).
- Visible focus rings on every interactive element (desktop's keyboard-first principle in §1 makes this non-negotiable, not just a compliance checkbox).
- Respect OS-level "Reduce Motion" for the Quick Access pulse and window transitions — fall back to a static state-color instead of animation.
- Sufficient contrast in both themes, same WCAG AA baseline as mobile.

## 8. Engineering Handoff Notes
- Electron main-process responsibilities exposed via a minimal `contextBridge` API: global shortcut registration (`globalShortcut`), tray icon + menu, `safeStorage` for quick-unlock key wrapping, native notifications, auto-updater status events — matches the security posture already specified in the build plan (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Quick Access overlay is a separate lightweight `BrowserWindow` (frameless, always-on-top, transparent background for the blur effect), not a modal inside the main window — this is what lets it appear over other applications.
- Reuse `packages/ui` for all main-window and Settings-window components (both are DOM/React per the build plan's monorepo architecture); Quick Access can reuse the same package but should ship as its own minimal bundle to keep hotkey-to-visible latency low.
- Tray/menu-bar icon states generated as a small asset set (locked/unlocked/syncing × light/dark menu-bar backgrounds on macOS, single-theme on Windows) — flag as a design asset deliverable, not something to compute at runtime.
