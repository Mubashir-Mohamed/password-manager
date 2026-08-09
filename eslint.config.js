// Single root config for the whole monorepo — ESLint's flat-config resolver
// walks up from each package's cwd to find this when no local
// eslint.config.js exists, so every package's `eslint .` script (see
// packages/config/eslint-preset.js) resolves here without needing its own
// copy.
import base from "./packages/config/eslint-preset.js";
import globals from "globals";

export default [
  ...base,
  {
    // Expo config plugins (apps/mobile/plugins/**) run under plain Node at
    // `expo prebuild` time, same as the *.config.js files the shared preset
    // already covers — see packages/config/eslint-preset.js's comment.
    files: ["apps/mobile/plugins/**/*.js"],
    languageOptions: { globals: globals.node, sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    ignores: [
      "**/dist/**",
      "**/dist-electron/**",
      "**/.output/**",
      "**/.wxt/**",
      "**/release/**",
      "**/node_modules/**",
      "**/.expo/**",
      "**/coverage/**",
    ],
  },
];
