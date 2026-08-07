import preset from "@password-manager/config/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
};
