import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Loop Automa E2E tests
 * Tests run against both web-only dev mode and Tauri desktop mode
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Run sequentially to avoid interference from shared localStorage and Vite dev server state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Single worker to avoid race conditions
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
      },
    ],

    webServer: [
      {
        command: 'bun run dev:web',
        url: 'http://127.0.0.1:1420',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
          VITE_E2E_COVERAGE: process.env.VITE_E2E_COVERAGE,
        },
      },
    ],
});
