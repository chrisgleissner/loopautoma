import { beforeEach, describe, expect, it, vi } from "vitest";
import { isDesktopEnvironment } from "../src/utils/runtime";

const clearGlobals = () => {
  delete (window as any).__TAURI__;
  delete (window as any).__TAURI_IPC__;
  delete (window as any).__TAURI_INTERNALS__;
  delete (window as any).__TAURI_METADATA__;
  delete (window as any).__LOOPAUTOMA_TEST__;
  delete (window as any).__LOOPAUTOMA_FORCE_DESKTOP__;
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0",
    configurable: true,
  });
};

describe("runtime detection", () => {
  beforeEach(() => {
    clearGlobals();
  });

  it("returns false in pure web mode", () => {
    expect(isDesktopEnvironment()).toBe(false);
  });

  it("detects the test harness invoke hook", () => {
    (window as any).__LOOPAUTOMA_TEST__ = { invoke: vi.fn() };
    expect(isDesktopEnvironment()).toBe(true);
  });

  it("detects tauri globals", () => {
    (window as any).__TAURI__ = {};
    expect(isDesktopEnvironment()).toBe(true);
  });

  it("detects forced desktop flag", () => {
    (window as any).__LOOPAUTOMA_FORCE_DESKTOP__ = true;
    expect(isDesktopEnvironment()).toBe(true);
  });

  it("detects tauri user agent", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (X11; Linux x86_64) Tauri/2.0",
      configurable: true,
    });
    expect(isDesktopEnvironment()).toBe(true);
  });
});
