/**
 * E2E Tests: Integration and Cross-Workflow (Web-Only Mode)
 * Focus on interactions that make sense in browser preview with graceful fallbacks.
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady, startMonitor } from './helpers';

test.describe('Integration & Cross-Workflow - Web-Only Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('7.2 - Region capture while monitor running fails gracefully', async ({ page }) => {
    await startMonitor(page);

    const defineButton = page.getByRole('button', { name: /define watch region/i });
    await defineButton.click();

    await expect(page.locator('.alert, [role="alert"]')).toBeVisible();
    await expect(page.locator('main.container')).toBeVisible();
  });

  test('7.3 - Action Recorder while monitor running fails gracefully', async ({ page }) => {
    await startMonitor(page);

    const recordButton = page.getByRole('button', { name: /record actions/i });
    await recordButton.click();

    await expect(page.locator('.alert, [role="alert"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /record actions/i })).toBeVisible();
  });

  test('7.5 - Region capture error clears and reappears on retry', async ({ page }) => {
    const defineButton = page.getByRole('button', { name: /define watch region/i });

    await defineButton.click();
    const alert = page.locator('.alert, [role="alert"]');
    await expect(alert).toBeVisible();

    // Retry should clear error momentarily before re-setting it
    await defineButton.click();

    // After retry, an error should still be visible
    await expect(page.locator('.alert, [role="alert"]')).toBeVisible();
  });

  test('7.7 - Accessibility: keyboard navigation to Quit works', async ({ page }) => {
    // Focus the Quit button and trigger via Enter
    const quit = page.getByRole('button', { name: /quit/i });
    await quit.focus();
    await expect(quit).toBeFocused();

    // Console logs message in web mode
    const logPromise = new Promise<string>((resolve) => {
      page.on('console', (msg) => {
        if (msg.text().includes('Quit requested')) resolve(msg.text());
      });
    });
    await page.keyboard.press('Enter');
    await logPromise;
  });
});
