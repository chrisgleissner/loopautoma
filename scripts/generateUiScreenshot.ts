#!/usr/bin/env bun

import { chromium } from "@playwright/test";
import { preview } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotPath = path.join(rootDir, "doc", "img", "ui-screenshot.png");
const tempPath = `${screenshotPath}.tmp.png`;
const previewPort = Number(process.env.UI_SCREENSHOT_PORT ?? 4310);
const previewHost = "127.0.0.1";

async function ensureDistExists() {
  const distDir = path.join(rootDir, "dist");
  try {
    const stat = await fs.stat(distDir);
    if (!stat.isDirectory()) {
      throw new Error(`Missing build output at ${distDir}. Run \"bun run build:web\" first.`);
    }
  } catch (err) {
    throw new Error(`Missing build output at ${distDir}. Run \"bun run build:web\" first.`);
  }
}

async function startPreview() {
  const server = await preview({
    root: rootDir,
    preview: {
      host: previewHost,
      port: previewPort,
      strictPort: true,
    },
  });
  const url = server.resolvedUrls?.local?.[0] ?? `http://${previewHost}:${previewPort}/`;
  const close = async () => {
    await server.close();
  };
  return { url, close };
}

async function maybeReplaceScreenshot() {
  const [existing, next] = await Promise.allSettled([
    fs.readFile(screenshotPath),
    fs.readFile(tempPath),
  ]);

  const nextBuffer = next.status === "fulfilled" ? next.value : undefined;
  if (!nextBuffer) {
    throw new Error("Failed to read newly generated screenshot");
  }

  const existingBuffer = existing.status === "fulfilled" ? existing.value : undefined;
  if (existingBuffer && existingBuffer.equals(nextBuffer)) {
    await fs.unlink(tempPath);
    console.info("UI screenshot unchanged; keeping existing file.");
    return;
  }

  await fs.rename(tempPath, screenshotPath);
  console.info("UI screenshot updated at", screenshotPath);
}

async function captureScreenshot(baseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1500, height: 900 },
  });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore — running outside browser (tests) may throw
    }
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("main.container");

  // Prefer dark theme for documentation consistency
  const darkButton = page.getByRole("button", { name: /dark theme/i });
  if ((await darkButton.count()) > 0) {
    await darkButton.click();
  } else {
    await page.evaluate(() => {
      document.querySelector("main.container")?.setAttribute("data-theme", "dark");
    });
  }

  // Ensure monitor controls settle with the preset loaded
  await page.waitForTimeout(500);
  const startButton = page.getByRole("button", { name: /^start$/i });
  if ((await startButton.count()) > 0 && (await startButton.isEnabled().catch(() => false))) {
    await startButton.click();
    await page.waitForTimeout(300);
  }

  // Inject representative runtime events so the log is populated
  await page.evaluate(() => {
    const events = [
      { type: "MonitorStateChanged", state: "Running" },
      { type: "TriggerFired" },
      { type: "ConditionEvaluated", result: true },
      { type: "ActionStarted", action: 'Type("continue")' },
      { type: "ActionCompleted", action: 'Type("continue")', success: true },
      { type: "WatchdogTripped", reason: "cooldown_active" },
      { type: "MonitorStateChanged", state: "Stopped" },
    ];
    for (const evt of events) {
      window.dispatchEvent(new CustomEvent("loopautoma://event", { detail: { payload: evt } }));
    }
  });

  await page.waitForTimeout(500);
  await page.screenshot({ path: tempPath, fullPage: true });
  await browser.close();
}

async function main() {
  await ensureDistExists();
  const server = await startPreview();
  try {
    await captureScreenshot(server.url);
  } finally {
    await server.close();
  }
  await maybeReplaceScreenshot();
}

main().catch((err) => {
  console.error("Failed to generate UI screenshot:", err);
  process.exitCode = 1;
});
