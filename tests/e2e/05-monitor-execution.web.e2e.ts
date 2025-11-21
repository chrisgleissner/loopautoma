/**
 * E2E Tests: Monitor Execution (Web-Only Mode)
 * Validates running chip toggling and event log rendering via synthetic events
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady, startMonitor, stopMonitor, emitRuntimeEvent, waitForEvent, getEventLogEntries } from './helpers';

test.describe('Monitor Execution - Web-Only Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('6.1 - Start monitor shows Running chip', async ({ page }) => {
    await startMonitor(page);
    await expect(page.locator('.running-chip', { hasText: 'Running' })).toBeVisible();
  });

  test('6.2 - Stop monitor hides Running chip', async ({ page }) => {
    await startMonitor(page);
    await stopMonitor(page);
    await expect(page.locator('.running-chip', { hasText: 'Running' })).not.toBeVisible();
  });

  test('6.3 - Synthetic events appear in EventLog', async ({ page }) => {
    await startMonitor(page);

    // Initially empty
    await expect(page.locator('.event-log')).toContainText(/no events yet/i);

    // Emit a few synthetic events
    await emitRuntimeEvent(page, { type: 'TriggerFired' });
    await emitRuntimeEvent(page, { type: 'ActionStarted', action: 'Click' });
    await emitRuntimeEvent(page, { type: 'ActionCompleted', action: 'Click', success: true });

    await waitForEvent(page, 'TriggerFired');
    await waitForEvent(page, 'ActionStarted');
    await waitForEvent(page, 'ActionCompleted');

    const entries = await getEventLogEntries(page);
    expect(entries.some((t) => /Trigger Fired/i.test(t))).toBe(true);
    expect(entries.some((t) => /Action Started/i.test(t))).toBe(true);
    expect(entries.some((t) => /Action Completed/i.test(t))).toBe(true);
  });

  test('6.4/6.5 - Guardrail/Watchdog events are shown', async ({ page }) => {
    await startMonitor(page);
    await emitRuntimeEvent(page, { type: 'WatchdogTripped', reason: 'Cooldown' });
    await waitForEvent(page, 'WatchdogTripped');
    await expect(page.locator('.event-log')).toContainText(/cooldown/i);
  });

  test('6.6 - Stop monitor does not clear events', async ({ page }) => {
    await startMonitor(page);
    await emitRuntimeEvent(page, { type: 'TriggerFired' });
    await waitForEvent(page, 'TriggerFired');

    await stopMonitor(page);
    // Events should remain visible
    await expect(page.locator('.event-log')).toContainText(/trigger fired/i);
  });

  test('6.7 - Start button is enabled when a profile is selected', async ({ page }) => {
    const startButton = page.getByRole('button', { name: /start/i });
    await expect(startButton).toBeEnabled();
  });
});
