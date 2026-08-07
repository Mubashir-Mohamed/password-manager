import type { FillResponse, MatchResponse } from "../lib/messages.js";

// Content script: detects login forms and offers a gesture-triggered fill
// affordance. Never touches crypto itself — every credential lookup is a
// message round-trip to the background worker (mobile design plan §3).
// Autofill only happens on explicit click, never automatically on page load
// (build plan §4 browser-extension architecture note).
export default defineContentScript({
  // CORRECTION vs. an earlier version of this comment: a static
  // `content_scripts.matches` entry is ITSELF an install-time host-permission
  // grant in MV3 (Chrome shows "Read and change all your data on all
  // websites" at install and auto-injects with no further runtime consent) —
  // verified against the built manifest.json's `content_scripts[0].matches`.
  // It is NOT narrowed just because `host_permissions` (wxt.config.ts) omits
  // <all_urls>; those are two independent permission surfaces. So this
  // scaffold, as written, does NOT yet honor the design docs' "narrow,
  // incrementally-requested per-site access" goal — it currently takes the
  // same broad upfront grant Bitwarden/1Password's extensions do. The
  // correct Phase 1 fast-follow: drop this static `matches`, request
  // `activeTab`-scoped access on click instead, and inject via
  // `chrome.scripting.registerContentScripts()` after a
  // `chrome.permissions.request()` consent flow per-origin. Left as `<all_urls>`
  // here only so the detection/fill logic itself is demonstrable without
  // also building that consent UI in this pass.
  matches: ["<all_urls>"],
  main() {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(scanForLoginForms, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scanForLoginForms();
  },
});

const ANNOTATED_ATTR = "data-pm-annotated";

function scanForLoginForms() {
  const passwordFields = document.querySelectorAll<HTMLInputElement>(
    `input[type="password"]:not([${ANNOTATED_ATTR}])`,
  );
  passwordFields.forEach(attachFillAffordance);
}

function attachFillAffordance(passwordField: HTMLInputElement) {
  passwordField.setAttribute(ANNOTATED_ATTR, "true");

  const usernameField = findLikelyUsernameField(passwordField);

  const button = document.createElement("button");
  button.textContent = "🔐";
  button.title = "Fill from Password Manager";
  button.type = "button";
  Object.assign(button.style, {
    position: "absolute",
    zIndex: "2147483647",
    border: "none",
    background: "#1A1B21",
    color: "white",
    borderRadius: "6px",
    padding: "2px 6px",
    cursor: "pointer",
    fontSize: "14px",
  });

  positionButtonNextTo(button, passwordField);
  document.body.appendChild(button);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await handleFillClick(passwordField, usernameField);
  });

  window.addEventListener("resize", () => positionButtonNextTo(button, passwordField));
  window.addEventListener("scroll", () => positionButtonNextTo(button, passwordField), true);
}

function positionButtonNextTo(button: HTMLElement, field: HTMLInputElement) {
  const rect = field.getBoundingClientRect();
  button.style.top = `${window.scrollY + rect.top}px`;
  button.style.left = `${window.scrollX + rect.right + 6}px`;
}

function findLikelyUsernameField(passwordField: HTMLInputElement): HTMLInputElement | null {
  const form = passwordField.closest("form");
  const scope = form ?? document;
  const candidates = scope.querySelectorAll<HTMLInputElement>(
    'input[type="email"], input[type="text"], input[autocomplete="username"]',
  );
  return candidates[0] ?? null;
}

async function handleFillClick(passwordField: HTMLInputElement, usernameField: HTMLInputElement | null) {
  const matchResponse = (await browser.runtime.sendMessage({
    type: "vault:match-domain",
    domain: location.hostname,
  })) as MatchResponse;

  if (matchResponse.matches.length === 0) {
    // No saved item for this site (or vault is locked) — Phase 1 falls back
    // to a console note; a proper "no matches / unlock vault" popover is a
    // fast-follow UI polish item, not a functional gap.
    console.info("[Password Manager] No saved credentials for this site, or vault is locked.");
    return;
  }

  // First match for now — a picker for multiple accounts on one site is a
  // fast-follow (same note as the design plan's "multi-step, multiple login"
  // form-pattern testing item).
  const chosen = matchResponse.matches[0]!;
  const fillResponse = (await browser.runtime.sendMessage({
    type: "vault:fill-item",
    itemId: chosen.itemId,
  })) as FillResponse | null;

  if (!fillResponse) return;

  if (usernameField && fillResponse.username) {
    setNativeValue(usernameField, fillResponse.username);
  }
  setNativeValue(passwordField, fillResponse.password);
}

/** Setting `.value` directly doesn't trigger React/Vue's change detection on
 * the target page — dispatch a native input event via the prototype setter
 * so frameworks pick up the fill, same trick every password manager
 * extension relies on. */
function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
