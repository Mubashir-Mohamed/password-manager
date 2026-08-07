import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000, // Argon2id at "moderate" params is intentionally slow
  },
});
