import { defineConfig } from "vitest/config";
import { availableParallelism } from "os";

// Configurable parallelism: use env var or default to 75% of CPU cores (min 1, max cores-1)
const cpuCount = availableParallelism();
const maxWorkers = process.env.VITEST_MAX_WORKERS
  ? parseInt(process.env.VITEST_MAX_WORKERS, 10)
  : Math.max(1, Math.min(cpuCount - 1, Math.floor(cpuCount * 0.75)));

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Pick up Vitest tests named *.vitest.* (no .test/.spec suffix) so Bun won't discover them
    include: ["tests/**/*.vitest.{ts,tsx,js,jsx}"],
    // Parallel execution with configurable workers (default: 50% of CPU cores)
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: maxWorkers,
        minThreads: 1,
      },
    },
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov", "json"],
      reportsDirectory: "coverage",
      include: ["src/components/**"],
      exclude: [
        "src-tauri/**",
        "node_modules/**",
        "tests/**/*.bun.*",
        "vite.config.ts",
        "src/main.tsx",
        "src/App.tsx",
        "src/store.ts",
        "src/tauriBridge.ts",
        "src/types.ts",
      ],
    },
  },
});
