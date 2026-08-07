// Single source of truth for the design tokens defined in:
//   docs/design/mobile-ui-design-plan.md  (§2 Foundations)
//   docs/design/desktop-ui-design-plan.md (§0 Token System, §2 Foundations)
//
// Every app/package pulls color, type, spacing, and radius values from here so the
// three surfaces (web, desktop, extension) stay visually consistent by construction
// rather than by convention.

export const color = {
  bg: {
    base: { dark: "#0E0F13", light: "#F7F7F9" },
    surface: { dark: "#1A1B21", light: "#FFFFFF" },
    // Desktop-only: sidebar / title-bar region, one step deeper than `surface`.
    chrome: { dark: "#16171C", light: "#ECECF0" },
  },
  border: {
    hairlineDark: "rgba(255,255,255,0.08)",
    hairlineLight: "#EAEAEE",
  },
  text: {
    // Applied as opacity over the neutral foreground, not as separate hues.
    primary: 1.0,
    body: 0.85,
    secondary: 0.6,
    disabled: 0.35,
  },
  accent: {
    DEFAULT: "#6C5CE7",
    subtle: "rgba(108,92,231,0.10)",
    subtleLight: "rgba(108,92,231,0.08)",
  },
  semantic: {
    success: "#3DDC97",
    warning: "#F5A524",
    danger: "#F45B69",
  },
};

export const font = {
  family: {
    display: ["Inter", "system-ui", "sans-serif"],
    body: ["Inter", "system-ui", "sans-serif"],
    // TOTP codes, Secret Key, keyboard-shortcut chips, tabular data.
    mono: [
      "IBM Plex Mono",
      "ui-monospace",
      "SFMono-Regular",
      "Menlo",
      "Consolas",
      "monospace",
    ],
  },
  // Mobile: 28/22/16/13. Desktop adds one extra tier (32/…/12) for sidebar/meta density.
  size: {
    xs: "13px",
    sm: "16px",
    md: "22px",
    lg: "28px",
    xl: "32px", // desktop-only tier
  },
  weight: {
    regular: 400,
    medium: 500, // desktop-only: Quick Access selected-row state
    semibold: 600,
  },
};

// 8-point grid.
export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  12: "48px",
  16: "64px",
};

export const radius = {
  sm: "12px", // inputs / small controls
  md: "20px", // cards
  lg: "28px", // sheets / modals / overlays
};
