// Flat ESLint config fragment shared by every app/package. Each consumer does:
//   import base from "@password-manager/config/eslint-preset.js";
//   export default [...base, { /* project-specific overrides */ }];
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
  {
    // CJS/config files (babel.config.js, tailwind.config.js, postcss.config.js,
    // the tailwind preset itself) run under plain Node, not bundled — they
    // need Node globals (`module`, `require`, `__dirname`) rather than
    // browser/RN globals.
    files: ["**/*.config.js", "**/*.config.cjs", "**/tailwind-preset.cjs"],
    languageOptions: { globals: globals.node, sourceType: "commonjs" },
  },
  {
    ignores: ["dist/**", ".output/**", "build/**", "node_modules/**", "coverage/**"],
  },
];
