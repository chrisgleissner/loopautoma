/**
 * E2E Tests: Action Recorder Workflow (Web-Only Mode)
 * Tests Action Recorder behavior in web-only dev mode (expected to fail gracefully)
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers';

test.describe('Action Recorder - Web-Only Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('4.14 - Action Recorder fails gracefully in web-only mode', async ({ page }) => {
    // Click "Record Actions" button
    const recordButton = page.getByRole('button', { name: /record actions/i });
    await expect(recordButton).toBeVisible();
    await recordButton.click();

    // Should show error message (Tauri command not available)
    await page.waitForTimeout(500);
    
    // Error should be displayed in RecordingBar or as alert
    const errorElement = page.locator('.alert, [role="alert"], .error-message');
    await expect(errorElement.first()).toBeVisible({ timeout: 3000 });
    
    // Action Recorder overlay should NOT appear
    const actionRecorder = page.locator('.action-recorder');
    await expect(actionRecorder).not.toBeVisible();
    
    // Button should remain in "Record Actions" state
    await expect(recordButton).toBeVisible();
    await expect(recordButton).toHaveText(/record actions/i);
  });

  test('4.14 - RecordingBar accessible with keyboard', async ({ page }) => {
    const recordButton = page.getByRole('button', { name: /record actions/i });
    
    // Button is keyboard accessible
    await recordButton.focus();
    await expect(recordButton).toBeFocused();
    
    // Has tooltip
    const title = await recordButton.getAttribute('title');
    expect(title).toBeTruthy();
  });

  test('4.14 - RecordingBar visible in UI', async ({ page }) => {
    const recordButton = page.getByRole('button', { name: /record actions/i });
    await expect(recordButton).toBeVisible();
    
    // Should have icon or clear label
    const buttonText = await recordButton.textContent();
    expect(buttonText?.trim()).toBeTruthy();
  });
});
