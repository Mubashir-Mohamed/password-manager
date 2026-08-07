import preset from "@password-manager/config/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ["./entrypoints/**/*.{ts,tsx,html}", "../../packages/ui/src/**/*.{ts,tsx}"],
};
