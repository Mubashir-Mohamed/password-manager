/** Shared Tailwind preset — consumed by apps/web, apps/desktop, apps/browser-extension,
 * and packages/ui, so the design tokens in tokens.js only have one place to change. */
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: { DEFAULT: "#0E0F13", light: "#F7F7F9" },
        surface: { DEFAULT: "#1A1B21", light: "#FFFFFF" },
        chrome: { DEFAULT: "#16171C", light: "#ECECF0" },
        accent: {
          DEFAULT: "#6C5CE7",
          subtle: "rgba(108,92,231,0.10)",
        },
        success: "#3DDC97",
        warning: "#F5A524",
        danger: "#F45B69",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        xs: "13px",
        sm: "16px",
        md: "22px",
        lg: "28px",
        xl: "32px",
      },
      borderRadius: {
        sm: "12px",
        md: "20px",
        lg: "28px",
      },
      spacing: {
        18: "72px",
      },
    },
  },
};
