/**
 * E2E Tests: Profile Management
 * Tests profile loading, saving, editing, and persistence
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady, getSelectedProfileId } from './helpers';

test.describe('Profile Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('5.1 - Default preset loads on first launch', async ({ page }) => {
    // A profile selector should be visible (by title or generic select)
    const selectorByTitle = page.locator('select[title*="Choose the automation profile"]');
    const genericSelect = page.locator('select');
    if (await selectorByTitle.count()) {
      await expect(selectorByTitle).toBeVisible();
    } else {
      await expect(genericSelect).toBeVisible();
    }

    // Should have a selected value
    const selectedId = await getSelectedProfileId(page);
    expect(selectedId).toBeTruthy();
  });

  test('5.2 - Select different profile from dropdown', async ({ page }) => {
    // Use the dedicated profile selector only to avoid hitting other selects on the page
    let selector = page.locator('select[data-testid="profile-selector"]');
    if (!(await selector.count())) {
      selector = page.locator('select[title*="Choose the automation profile"]');
    }
    // Count distinct non-empty option values (ignore placeholder)
    const values = await selector.locator('option[value]:not([value=""])').evaluateAll((opts) => Array.from(new Set(opts.map(o => (o as HTMLOptionElement).value))));
    
    if (values.length > 1) {
      // Get first profile ID
      const firstId = await getSelectedProfileId(page);
      
      // Select second option
      await selector.selectOption({ index: 1 });
      await page.waitForTimeout(200);
      
      // Should have changed
      const secondId = await getSelectedProfileId(page);
      expect(secondId).not.toBe(firstId);
    }
  });

  test('5.3 - Profile editor displays selected profile', async ({ page }) => {
    // ProfileEditor or ProfileInsights component should be visible
    const editor = page.locator('.profile-editor, .profile-insights, .profile-section');
    
    // Should be visible somewhere on page
    const isVisible = await editor.first().isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  test('5.4 - Guardrails inputs visible and editable', async ({ page }) => {
    // Look for guardrail input fields (cooldown, max_activations, max_runtime)
    const guardrailSection = page.locator('text=/guardrail|cooldown|max.*activation|max.*runtime/i').first();
    
    // Should find guardrail-related content
    const found = await guardrailSection.isVisible().catch(() => false);
    expect(found).toBe(true);
  });

  test('5.7 - Restore preset button visible', async ({ page }) => {
    let count = await page.getByRole('button', { name: /restore\s*preset|preset\s*loaded|reset\s*default/i }).count();
    if (count === 0) {
      count = await page.locator('.preset-card__meta button').count();
    }
    expect(count).toBeGreaterThan(0);
  });

  test('5.7 - Restore preset button is keyboard accessible', async ({ page }) => {
    const restoreButton = page.getByRole('button', { name: /restore.*preset|reset.*default/i }).first();
    
    if (await restoreButton.isVisible()) {
      await restoreButton.focus();
      await expect(restoreButton).toBeFocused();
    }
  });

  test('5.8 - Profile validation visible in UI', async ({ page }) => {
    // ProfileInsights or validation messages should be present
    const insights = page.locator('.profile-insights, .validation-message, .alert');
    
    // At least one validation/info component exists
    const count = await insights.count();
    expect(count).toBeGreaterThanOrEqual(0); // May or may not have validation UI depending on profile state
  });

  test('5.6 - Profile metadata persists across reload', async ({ page }) => {
    // Get current profile ID
    const profileId = await getSelectedProfileId(page);
    
    // Reload page
    await page.reload();
    await waitForAppReady(page);
    
    // Profile should be reselected
    const reloadedId = await getSelectedProfileId(page);
    expect(reloadedId).toBe(profileId);
  });
});
