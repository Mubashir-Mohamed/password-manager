import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  optimizeDeps: {
    // libsodium-wrappers-sumo ships a WASM module — exclude it from Vite's
    // dependency pre-bundling so the wasm asset resolves correctly.
    exclude: ["libsodium-wrappers-sumo"],
  },
});
