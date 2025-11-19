#!/usr/bin/env bun
/**
 * Pre-release sanity check script
 * 
 * Verifies that the codebase is ready for a clean release build:
 * - No test dependencies required for production
 * - Correct npm scripts configured
 * - Feature flags properly set
 * - Version numbers in sync
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

type CheckResult = {
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
};

const results: CheckResult[] = [];

function check(name: string, condition: boolean, failMessage: string, passMessage?: string): void {
    if (condition) {
        results.push({ name, status: "pass", message: passMessage || "✓" });
    } else {
        results.push({ name, status: "fail", message: failMessage });
    }
}

function warn(name: string, message: string): void {
    results.push({ name, status: "warn", message });
}

// Check 1: package.json scripts
const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

check(
    "build:web script",
    !packageJson.scripts["build:web"]?.includes("generate:ui-screenshot"),
    "❌ build:web includes generate:ui-screenshot - this will fail in CI!",
    "build:web does not generate screenshots"
);

check(
    "build:web:dev script exists",
    packageJson.scripts["build:web:dev"]?.includes("generate:ui-screenshot"),
    "⚠️ build:web:dev should include screenshot generation for development",
    "build:web:dev includes screenshot generation"
);

// Check 2: Cargo.toml features
const cargoToml = readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf-8");

check(
    "No [dev-dependencies]",
    !cargoToml.includes("[dev-dependencies]"),
    "❌ Cargo.toml has [dev-dependencies] section - may leak into release",
    "No dev-dependencies in Cargo.toml"
);

check(
    "os-linux feature exists",
    cargoToml.includes('os-linux-automation =') && cargoToml.includes('os-linux-capture-xcap ='),
    "❌ os-linux features missing from Cargo.toml"
);

check(
    "os-macos feature exists",
    cargoToml.includes('os-macos ='),
    "❌ os-macos feature missing from Cargo.toml"
);

check(
    "os-windows feature exists",
    cargoToml.includes('os-windows ='),
    "❌ os-windows feature missing from Cargo.toml"
);

// Check 3: tauri.conf.json
const tauriConf = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf-8"));

check(
    "beforeBuildCommand uses build:web",
    tauriConf.build.beforeBuildCommand === "bun run build:web",
    `❌ beforeBuildCommand is "${tauriConf.build.beforeBuildCommand}" - should be "bun run build:web"`,
    "beforeBuildCommand correctly set to build:web"
);

// Check 4: Version sync
const tauriVersion = tauriConf.version;
const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1];
const pkgVersion = packageJson.version;

check(
    "Version sync",
    tauriVersion === cargoVersion && cargoVersion === pkgVersion,
    `❌ Version mismatch: package.json=${pkgVersion}, Cargo.toml=${cargoVersion}, tauri.conf.json=${tauriVersion}`,
    `All versions synced at ${pkgVersion}`
);

// Check 5: Playwright should only be devDependency
if (packageJson.dependencies?.["@playwright/test"] || packageJson.dependencies?.playwright) {
    results.push({
        name: "Playwright in dependencies",
        status: "fail",
        message: "❌ Playwright is in dependencies - should be devDependencies only!"
    });
} else {
    results.push({
        name: "Playwright in devDependencies",
        status: "pass",
        message: "Playwright correctly in devDependencies"
    });
}

// Check 6: Documentation exists
check(
    "Release build docs exist",
    existsSync(join(ROOT, "doc", "releaseBuild.md")),
    "⚠️ doc/releaseBuild.md missing - create release documentation",
    "doc/releaseBuild.md exists"
);

// Print results
console.log("\n🔍 Pre-Release Sanity Checks\n");
console.log("═".repeat(60));

let passCount = 0;
let failCount = 0;
let warnCount = 0;

for (const result of results) {
    const icon = result.status === "pass" ? "✅" : result.status === "warn" ? "⚠️" : "❌";
    console.log(`${icon} ${result.name}`);
    if (result.message !== "✓") {
        console.log(`   ${result.message}`);
    }

    if (result.status === "pass") passCount++;
    else if (result.status === "fail") failCount++;
    else warnCount++;
}

console.log("═".repeat(60));
console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed, ${warnCount} warnings\n`);

if (failCount > 0) {
    console.error("❌ RELEASE BUILD BLOCKED - Fix failures above before tagging release\n");
    process.exit(1);
}

if (warnCount > 0) {
    console.warn("⚠️ Warnings present - review before release\n");
    process.exit(0);
}

console.log("✅ All checks passed - ready for release build\n");
process.exit(0);
