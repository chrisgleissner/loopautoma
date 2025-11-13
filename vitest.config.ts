import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.vitest.{test,spec}.{ts,tsx,js,jsx}"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov", "json"],
      reportsDirectory: "coverage",
      exclude: ["src-tauri/**", "node_modules/**", "tests/**/*.bun.*"],
    },
  },
});
