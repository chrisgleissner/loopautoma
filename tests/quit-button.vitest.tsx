import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../src/App";
import * as bridge from "../src/tauriBridge";

describe("Quit button behavior", () => {
  it("calls appQuit when Tauri IPC is present", async () => {
    const quitSpy = vi.spyOn(bridge, "appQuit").mockResolvedValue();
    (window as any).__TAURI_IPC__ = {};

    render(<App />);
    const btn = await screen.findByRole("button", { name: /quit/i });
    fireEvent.click(btn);

    expect(quitSpy).toHaveBeenCalledTimes(1);

    // clean up
    delete (window as any).__TAURI_IPC__;
    quitSpy.mockRestore();
  });

  it("logs an info message in pure web mode", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    // ensure dev (no Tauri IPC)
    delete (window as any).__TAURI_IPC__;

    render(<App />);
    const btn = await screen.findByRole("button", { name: /quit/i });
    fireEvent.click(btn);

    expect(infoSpy).toHaveBeenCalledWith(
      "Quit requested in web dev mode; close the tab/window manually."
    );

    infoSpy.mockRestore();
  });
});
