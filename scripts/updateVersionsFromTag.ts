#!/usr/bin/env bun

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function normalizeVersion(input?: string | null): string {
  if (!input) {
    throw new Error("Missing version argument. Pass the tag (e.g. v0.2.0) as the first CLI arg or set GITHUB_REF_NAME.");
  }
  const match = input.match(/(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`Unable to extract semantic version from '${input}'. Expected format like v0.2.0 or 0.2.0.`);
  }
  return match[1];
}

const targetVersion = normalizeVersion(process.argv[2] ?? process.env.GITHUB_REF_NAME ?? null);

async function updateJsonFile(filePath: string, mutate: (data: any) => any) {
  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw);
  const next = mutate(json);
  await fs.writeFile(filePath, JSON.stringify(next, null, 2) + "\n");
}

async function updatePackageJson(version: string) {
  const file = path.join(root, "package.json");
  await updateJsonFile(file, (data) => ({ ...data, version }));
}

async function updateTauriConfig(version: string) {
  const file = path.join(root, "src-tauri", "tauri.conf.json");
  await updateJsonFile(file, (data) => ({ ...data, version }));
}

async function updateCargoToml(version: string) {
  const file = path.join(root, "src-tauri", "Cargo.toml");
  const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
  let inPackage = false;
  let replaced = false;
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inPackage = trimmed === "[package]";
    }
    if (inPackage && trimmed.startsWith("version")) {
      replaced = true;
      return line.replace(/version\s*=\s*"[^"]+"/, `version = "${version}"`);
    }
    return line;
  });
  if (!replaced) {
    throw new Error("Failed to update version in Cargo.toml");
  }
  await fs.writeFile(file, nextLines.join("\n") + "\n");
}

async function updateCargoLock(version: string) {
  const file = path.join(root, "src-tauri", "Cargo.lock");
  try {
  const content = await fs.readFile(file, "utf8");
  const updated = content.replace(/(\[\[package\]\]\s*name\s*=\s*"loopautoma"[\s\S]*?version\s*=\s*")[^"]+"/, `$1${version}"`);
    await fs.writeFile(file, updated);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return; // lock file not checked in; nothing to do
    }
    throw err;
  }
}

(async () => {
  await updatePackageJson(targetVersion);
  await updateTauriConfig(targetVersion);
  await updateCargoToml(targetVersion);
  await updateCargoLock(targetVersion);
  console.info(`Version synchronized to ${targetVersion}`);
})();
