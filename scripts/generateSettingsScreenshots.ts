#!/usr/bin/env bun

import { chromium } from "@playwright/test";
import { preview } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsScreenshotPath = path.join(rootDir, "doc", "img", "settings-panel.png");
const previewPort = Number(process.env.UI_SCREENSHOT_PORT ?? 4310);
const previewHost = "127.0.0.1";

async function ensureDistExists() {
    const distDir = path.join(rootDir, "dist");
    try {
        const stat = await fs.stat(distDir);
        if (!stat.isDirectory()) {
            throw new Error(`Missing build output at ${distDir}. Run "bun run build:web" first.`);
        }
    } catch (err) {
        throw new Error(`Missing build output at ${distDir}. Run "bun run build:web" first.`);
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

async function captureSettingsScreenshot(baseUrl: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1500, height: 900 },
    });
    await context.addInitScript(() => {
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch {
            // ignore
        }
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("main.container");

    // Set dark theme
    await page.evaluate(() => {
        const main = document.querySelector("main.container");
        main?.setAttribute("data-theme", "dark");
        document.documentElement.setAttribute("data-theme", "dark");
    });

    await page.waitForTimeout(500);

    // Click the settings button (gear icon)
    const settingsButton = page.locator('button[title="Settings"]');
    await settingsButton.click();
    await page.waitForTimeout(500);

    // Take screenshot of the settings panel
    const settingsDialog = page.locator('div:has(h2:has-text("Settings"))').first();
    await settingsDialog.screenshot({ path: settingsScreenshotPath });

    console.info("Settings panel screenshot saved at", settingsScreenshotPath);

    await browser.close();
}

async function main() {
    await ensureDistExists();
    const server = await startPreview();
    try {
        await captureSettingsScreenshot(server.url);
    } finally {
        await server.close();
    }
}

main().catch((err) => {
    console.error("Failed to generate settings screenshots:", err);
    process.exitCode = 1;
});
