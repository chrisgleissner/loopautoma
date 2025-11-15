/**
 * E2E Test Utilities for Loop Automa
 * Shared helpers for Playwright tests
 */

import { Page, expect } from '@playwright/test';
import { Profile, Rect, defaultPresetProfile } from '../../src/types';
import { BLANK_PNG_BASE64, STATE_SETTLE_TIMEOUT_MS } from '../../src/testConstants';

/**
 * Wait for app to be fully loaded and ready
 */
export async function waitForAppReady(page: Page) {
  // Wait for main container to be visible
  await expect(page.locator('main.container')).toBeVisible({ timeout: 10000 });
  
  // Wait for profile selector to be visible (by title or generic select)
  const selectorByTitle = page.locator('select[title*="Choose the automation profile"]');
  const genericSelect = page.locator('select');
  if (await selectorByTitle.count() > 0) {
    await expect(selectorByTitle).toBeVisible({ timeout: 5000 });
  } else {
    await expect(genericSelect).toBeVisible({ timeout: 5000 });
  }
  
  // Wait for React to be fully hydrated (check for brand logo)
  await expect(page.locator('.brand-logo')).toBeVisible();
}

/**
 * Select a profile from the dropdown
 */
export async function selectProfile(page: Page, profileName: string) {
  const selector = page.locator('select[data-testid="profile-selector"]');
  await selector.selectOption({ label: profileName });
  await page.waitForTimeout(STATE_SETTLE_TIMEOUT_MS); // Allow state to settle
}

/**
 * Get the currently selected profile ID
 */
export async function getSelectedProfileId(page: Page): Promise<string> {
  const withTestId = page.locator('select[data-testid="profile-selector"]');
  if (await withTestId.count()) {
    await expect(withTestId).toBeVisible();
    return await withTestId.inputValue();
  }
  const byTitle = page.locator('select[title*="Choose the automation profile"]');
  if (await byTitle.count()) {
    await expect(byTitle).toBeVisible();
    return await byTitle.inputValue();
  }
  const anySelect = page.locator('select');
  await expect(anySelect).toBeVisible();
  return await anySelect.inputValue();
}

/**
 * Click the Start button to begin monitoring
 */
export async function startMonitor(page: Page) {
  const startButton = page.getByRole('button', { name: /start/i });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  
  // Wait for Running chip to appear
  await expect(page.locator('.running-chip')).toBeVisible({ timeout: 3000 });
}

/**
 * Click the Stop button to stop monitoring
 */
export async function stopMonitor(page: Page) {
  const stopButton = page.getByRole('button', { name: /stop/i });
  await expect(stopButton).toBeEnabled();
  await stopButton.click();
  
  // Wait for Running chip to disappear
  await expect(page.locator('.running-chip')).not.toBeVisible({ timeout: 3000 });
}

/**
 * Check if monitor is currently running
 */
export async function isMonitorRunning(page: Page): Promise<boolean> {
  const chip = page.locator('.running-chip');
  return await chip.isVisible().catch(() => false);
}

/**
 * Click the Quit button
 */
export async function clickQuitButton(page: Page) {
  const quitButton = page.getByRole('button', { name: /quit/i });
  await expect(quitButton).toBeVisible();
  await quitButton.click();
}

/**
 * Get event log entries
 */
export async function getEventLogEntries(page: Page): Promise<string[]> {
  const entries = await page.locator('.event-log-list li').allTextContents();
  return entries;
}

/**
 * Wait for a specific event to appear in the log
 */
export async function waitForEvent(page: Page, eventText: string, timeout = 5000) {
  await expect(page.locator('.event-log-list')).toContainText(eventText, { timeout });
}

/**
 * Emit a synthetic runtime event into the app (web-only mode)
 */
export async function emitRuntimeEvent(page: Page, payload: any) {
  await page.evaluate((evt) => {
    window.dispatchEvent(new CustomEvent('loopautoma://event', { detail: { payload: evt } }));
  }, payload);
}

/**
 * Click "Define watch region" button
 */
export async function openRegionPicker(page: Page) {
  const button = page.getByRole('button', { name: /define watch region/i });
  await expect(button).toBeEnabled();
  await button.click();
}

/**
 * Get the number of regions in the current profile
 */
export async function getRegionCount(page: Page): Promise<number> {
  const cards = await page.locator('.region-card').count();
  return cards;
}

/**
 * Click Record button to start input recording
 */
export async function startRecording(page: Page) {
  const recordButton = page.getByRole('button', { name: /^record$/i });
  await expect(recordButton).toBeEnabled();
  await recordButton.click();
  
  // Wait for Recording chip to appear
  await expect(page.locator('.running-chip', { hasText: 'Recording' })).toBeVisible({ timeout: 3000 });
}

/**
 * Click Stop button to stop input recording
 */
export async function stopRecording(page: Page) {
  const stopButton = page.getByRole('button', { name: /^stop$/i });
  await expect(stopButton).toBeEnabled();
  await stopButton.click();
  
  // Wait for Recording chip to disappear
  await expect(page.locator('.running-chip', { hasText: 'Recording' })).not.toBeVisible({ timeout: 3000 });
}

/**
 * Get the recorded event count
 */
export async function getRecordedEventCount(page: Page): Promise<number> {
  const text = await page.locator('text=/\\d+ recorded step\\(s\\)/').textContent();
  if (!text) return 0;
  const match = text.match(/(\d+) recorded step/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Click "Save as ActionSequence" button
 */
export async function saveRecordedActions(page: Page) {
  const saveButton = page.getByRole('button', { name: /save as actionsequence/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
}

/**
 * Get timeline entries from RecordingBar
 */
export async function getTimelineEntries(page: Page): Promise<string[]> {
  const entries = await page.locator('.timeline-list li').allTextContents();
  return entries;
}

/**
 * Mock Tauri IPC for web-only tests
 */
export async function mockTauriIPC(page: Page, commands: Record<string, any>) {
  await page.addInitScript((cmds) => {
    (window as any).__TAURI_IPC__ = {
      invoke: async (cmd: string, args?: any) => {
        if (cmd in cmds) {
          const result = cmds[cmd];
          if (typeof result === 'function') {
            return result(args);
          }
          return result;
        }
        throw new Error(`Command not mocked: ${cmd}`);
      },
    };
  }, commands);
}

/**
 * Wait for page to close (for quit tests)
 */
export async function waitForPageClose(page: Page, timeout = 5000) {
  await page.waitForEvent('close', { timeout });
}

/**
 * Check console for specific message
 */
export async function waitForConsoleMessage(page: Page, messagePattern: string | RegExp, timeout = 5000) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Console message not found: ${messagePattern}`));
    }, timeout);

    page.on('console', (msg) => {
      const text = msg.text();
      const matches = typeof messagePattern === 'string' 
        ? text.includes(messagePattern)
        : messagePattern.test(text);
      
      if (matches) {
        clearTimeout(timer);
        resolve(text);
      }
    });
  });
}

export type FakeDesktopOptions = {
  profiles?: Profile[];
};

/**
 * Sets up a fake desktop harness in the browser context for E2E testing.
 *
 * This utility injects a script that simulates the Tauri backend, allowing tests to run
 * without a real desktop environment. It provides a fake implementation of Tauri commands,
 * event emission, and state tracking.
 *
 * Supported commands (via `window.__TAURI_IPC__.invoke` or `window.__LOOPAUTOMA_TEST__.invoke`):
 *   - `profiles_load`: Returns the current list of profiles.
 *   - `profiles_save`: Saves or updates profiles.
 *   - `monitor_start`: Sets state.running = true and emits "loopautoma://event" (MonitorStateChanged: Running).
 *   - `monitor_stop`: Sets state.running = false and emits "loopautoma://event" (MonitorStateChanged: Stopped).
 *   - `region_picker_show`: Sets state.overlayActive = true and emits RegionOverlay event.
 *   - `region_picker_complete`: Sets state.overlayActive = false and emits "loopautoma://region_pick_complete".
 *   - `region_picker_cancel`: Sets state.overlayActive = false and emits RegionOverlay closed event.
 *   - `app_quit`: Resets all state (running, overlayActive, recording) and emits state-change events.
 *   - `region_capture_thumbnail`: Returns a blank PNG thumbnail.
 *   - `start_input_recording`: Sets state.recording = true and emits RecordingStateChanged event.
 *   - `stop_input_recording`: Sets state.recording = false and emits RecordingStateChanged event.
 *
 * State tracking:
 *   - The `state` object (exposed as `window.__LOOPAUTOMA_TEST__.state`) tracks:
 *       - profiles: Array of Profile objects.
 *       - running: Whether the monitor is running.
 *       - overlayActive: Whether the overlay is shown.
 *       - quitCount: Number of times "quit" was invoked.
 *       - recording: Whether recording is active.
 *
 * Event emission:
 *   - The `emit` function (exposed as `window.__LOOPAUTOMA_TEST__.emit`) dispatches custom events
 *     to the app using `window.dispatchEvent`. Events use the same channel names as the real backend.
 *   - Helper functions (e.g., `emitRegionPick`, `emitInputEvent`) are provided
 *     to emit events from tests.
 *
 * @param page Playwright Page object
 * @param options Optional: initial profiles to inject
 */
export async function setupFakeDesktopMode(page: Page, options?: FakeDesktopOptions) {
  const profiles = options?.profiles ?? [defaultPresetProfile()];
  await page.addInitScript(({ initialProfiles, blank }) => {
    const state: any = {
      profiles: initialProfiles,
      running: false,
      overlayActive: false,
      quitCount: 0,
      recording: false,
    };
    const emit = (channel: string, payload: any) => {
      window.dispatchEvent(new CustomEvent(channel, { detail: { payload } }));
    };
    const fakeInvoke = async (cmd: string, args?: any) => {
      switch (cmd) {
        case "profiles_load":
          return state.profiles;
        case "profiles_save":
          state.profiles = args?.profiles ?? state.profiles;
          return;
        case "monitor_start":
          state.running = true;
          state.runningProfileId = args?.profileId ?? null;
          emit("loopautoma://event", { type: "MonitorStateChanged", state: "Running" });
          return;
        case "monitor_stop":
          state.running = false;
          emit("loopautoma://event", { type: "MonitorStateChanged", state: "Stopped" });
          return;
        case "region_picker_show":
          state.overlayActive = true;
          emit("loopautoma://event", { type: "RegionOverlay", status: "open" });
          return;
        case "region_picker_complete":
          state.overlayActive = false;
          state.lastRegionSubmission = args?.submission ?? null;
          emit("loopautoma://region_pick_complete", args?.submission ?? {});
          return;
        case "region_picker_cancel":
          state.overlayActive = false;
          emit("loopautoma://event", { type: "RegionOverlay", status: "closed" });
          return;
        case "app_quit":
          state.running = false;
          state.overlayActive = false;
          state.recording = false;
          emit("loopautoma://event", { type: "MonitorStateChanged", state: "Stopped" });
          emit("loopautoma://event", { type: "RegionOverlay", status: "closed" });
          emit("loopautoma://event", { type: "RecordingStateChanged", state: "Stopped" });
          state.quitCount += 1;
          return;
        case "region_capture_thumbnail":
          return blank;
        case "start_input_recording":
          state.recording = true;
          emit("loopautoma://event", { type: "RecordingStateChanged", state: "Recording" });
          return;
        case "stop_input_recording":
          state.recording = false;
          emit("loopautoma://event", { type: "RecordingStateChanged", state: "Stopped" });
          return;
        default:
          console.warn("[FakeHarness] Unhandled fake invoke", cmd, args); // eslint-disable-line no-console
          return;
      }
    };
    (window as any).__LOOPAUTOMA_TEST__ = {
      state,
      emit,
      invoke: fakeInvoke,
    };
    (window as any).__TAURI_IPC__ = {
      invoke: fakeInvoke,
    };
  }, { initialProfiles: profiles, blank: BLANK_PNG_BASE64 });
}

export async function dispatchTauriEvent<T = unknown>(page: Page, channel: string, payload: T) {
  await page.evaluate(({ channel, payload }) => {
    window.dispatchEvent(new CustomEvent(channel, { detail: { payload } }));
  }, { channel, payload });
}

export async function emitRegionPick(page: Page, rect: Rect, thumbnail?: string | null) {
  await dispatchTauriEvent(page, 'loopautoma://region_pick_complete', {
    rect,
    thumbnail_png_base64: thumbnail ?? BLANK_PNG_BASE64,
  });
}

export async function emitInputEvent(page: Page, event: any) {
  await dispatchTauriEvent(page, 'loopautoma://input_event', event);
}

export async function getFakeDesktopState(page: Page) {
  return page.evaluate(() => (window as any).__LOOPAUTOMA_TEST__?.state);
}
