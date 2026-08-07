// Single root config for the whole monorepo — ESLint's flat-config resolver
// walks up from each package's cwd to find this when no local
// eslint.config.js exists, so every package's `eslint .` script (see
// packages/config/eslint-preset.js) resolves here without needing its own
// copy.
import base from "./packages/config/eslint-preset.js";

export default [
  ...base,
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
