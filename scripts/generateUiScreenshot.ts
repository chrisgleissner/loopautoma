#!/usr/bin/env bun

import { chromium } from "@playwright/test";
import { preview } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

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
    
    // If no existing screenshot, save the new one
    if (!existingBuffer) {
        await fs.rename(tempPath, screenshotPath);
        console.info("UI screenshot created (first time) at", screenshotPath);
        return;
    }

    // Byte-level comparison first (fastest)
    if (existingBuffer.equals(nextBuffer)) {
        await fs.unlink(tempPath);
        console.info("UI screenshot unchanged (identical bytes); keeping existing file.");
        return;
    }

    // Use pixelmatch for visual diff detection
    try {
        const img1 = PNG.sync.read(existingBuffer);
        const img2 = PNG.sync.read(nextBuffer);

        // If dimensions differ, definitely replace
        if (img1.width !== img2.width || img1.height !== img2.height) {
            await fs.rename(tempPath, screenshotPath);
            console.info("UI screenshot updated (dimensions changed) at", screenshotPath);
            return;
        }

        // Calculate pixel differences
        const diff = new PNG({ width: img1.width, height: img1.height });
        const numDiffPixels = pixelmatch(
            img1.data,
            img2.data,
            diff.data,
            img1.width,
            img1.height,
            { threshold: 0.1 } // 0.1 color difference threshold (pixelmatch sensitivity, 0.0–1.0 scale)
        );

        const totalPixels = img1.width * img1.height;
        const diffPercent = (numDiffPixels / totalPixels) * 100;

        // Only save if there's a visible difference (>0.1% of pixels changed)
        if (diffPercent > 0.1) {
            await fs.rename(tempPath, screenshotPath);
            console.info(
                `UI screenshot updated at ${screenshotPath} (${numDiffPixels} pixels changed, ${diffPercent.toFixed(2)}% diff)`
            );
        } else {
            await fs.unlink(tempPath);
            console.info(
                `UI screenshot unchanged (${diffPercent.toFixed(4)}% diff, below 0.1% threshold); keeping existing file.`
            );
        }
    } catch (err) {
        // Fallback: if pixel comparison fails, save the new screenshot (already verified bytes differ)
        console.warn("Pixel comparison failed, saving new screenshot as fallback:", err);
        await fs.rename(tempPath, screenshotPath);
        console.info("UI screenshot updated at", screenshotPath);
    }
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
            const main = document.querySelector("main.container");
            main?.setAttribute("data-theme", "dark");
            document.documentElement.setAttribute("data-theme", "dark");
        });
    }

    await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "dark");
    });

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
