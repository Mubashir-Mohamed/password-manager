import { defineConfig } from "wxt";

// MV3 cross-browser build (Chrome/Firefox/Edge) from one codebase — the most
// architecturally constrained surface (browser design constraints in mobile
// design plan §3/§8): no persistent background page, narrow host_permissions
// requested incrementally rather than <all_urls> at install, autofill only
// on explicit user gesture.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Password Manager",
    description: "Zero-knowledge password manager — autofill, generator, TOTP codes.",
    permissions: ["storage", "activeTab", "scripting"],
    // Deliberately NOT requesting <all_urls> at install. Site access is
    // requested incrementally via chrome.permissions.request() the first
    // time the user asks to fill/save on a given site — see
    // entrypoints/content.ts and entrypoints/popup for the request flow.
    action: {},
  },
  vite: () => ({
    optimizeDeps: { exclude: ["libsodium-wrappers-sumo"] },
  }),
});
