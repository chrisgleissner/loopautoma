import { defineConfig, devices } from '@playwright/test';
import { availableParallelism } from 'os';

/**
 * Playwright configuration for Loop Automa E2E tests
 * Tests run against both web-only dev mode and Tauri desktop mode
 *
 * Parallelism:
 * - Web-only tests can run in parallel (isolated contexts)
 * - Tauri desktop tests run sequentially (shared app state)
 * - Configure via PLAYWRIGHT_WORKERS env var (default: 75% of CPU cores for local, 2 for CI)
 */
const cpuCount = availableParallelism();
const defaultWorkers = process.env.CI ? 1 : Math.max(1, Math.min(cpuCount - 1, Math.floor(cpuCount * 0.75)));
const maxWorkers = process.env.PLAYWRIGHT_WORKERS
  ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10)
  : defaultWorkers;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: !process.env.CI, // Parallel only locally; sequential in CI to avoid resource contention
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: maxWorkers, // Configurable workers (default: 75% of CPU cores locally, 1 in CI)
  // Never auto-open the HTML report to avoid blocking terminals/agents
  reporter: process.env.CI
    ? [["html", { open: 'never' }], ["github"]]
    : [["html", { open: 'never' }], ["list"]],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'web-only-mode',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:1420',
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /.*web\.e2e\.ts/,
      // Web tests can run fully parallel (isolated browser contexts)
      fullyParallel: true,
    },
    {
      name: 'tauri-desktop-mode',
      use: {
        ...devices['Desktop Chrome'],
        // Tauri tests use custom launch logic (see test files)
        viewport: { width: 1280, height: 720 },
        baseURL: 'http://127.0.0.1:1420',
      },
      testMatch: /.*tauri\.e2e\.ts/,
      // Tauri tests must run sequentially (shared app state, file system)
      fullyParallel: false,
    },
  ],

  webServer: [
    {
      command: 'bun run dev:web',
      url: 'http://127.0.0.1:1420',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      ...(process.env.VITE_E2E_COVERAGE && {
        env: {
          VITE_E2E_COVERAGE: process.env.VITE_E2E_COVERAGE,
        },
      }),
    },
  ],
});
