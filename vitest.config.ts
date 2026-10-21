import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    // Test-only values. Never use real keys or SSNs in tests.
    env: {
      DATABASE_URL: "file:./test.db",
      ENCRYPTION_KEY: "0".repeat(63) + "1",
    },
    // Service tests share one SQLite file.
    fileParallelism: false,
  },
});
