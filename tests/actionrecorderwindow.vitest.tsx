import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActionRecorderWindow } from "../src/components/ActionRecorderWindow";
import * as tauriBridge from "../src/tauriBridge";

// Mock Tauri window
const mockWindow = {
    close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@tauri-apps/api/window", () => ({
    getCurrentWindow: vi.fn(() => mockWindow),
}));

vi.mock("../src/tauriBridge", () => ({
    actionRecorderClose: vi.fn().mockResolvedValue(undefined),
    actionRecorderComplete: vi.fn().mockResolvedValue(undefined),
}));

describe("ActionRecorderWindow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear global screenshot
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = undefined;
    });

    it("renders with header and buttons", () => {
        render(<ActionRecorderWindow />);

        expect(screen.getByText("Action Recorder")).toBeTruthy();
        expect(screen.getByText("Start")).toBeTruthy();
        expect(screen.getByText("Done")).toBeTruthy();
        expect(screen.getByText("Cancel")).toBeTruthy();
    });

    it("displays empty state when no actions recorded", () => {
        render(<ActionRecorderWindow />);

        expect(screen.getByText(/No actions recorded yet/)).toBeTruthy();
    });

    it("Done button is disabled when no actions", () => {
        render(<ActionRecorderWindow />);

        const doneButton = screen.getByText("Done");
        expect(doneButton).toHaveProperty("disabled", true);
    });

    it("auto-starts recording when screenshot is available", () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        render(<ActionRecorderWindow />);

        expect(screen.getByText("Recording")).toBeTruthy();
        expect(screen.getByText("Stop")).toBeTruthy();
    });

    it("toggles recording state when Start/Stop clicked", () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        render(<ActionRecorderWindow />);

        expect(screen.getByText("Stop")).toBeTruthy();

        const toggleButton = screen.getByText("Stop");
        fireEvent.click(toggleButton);

        expect(screen.getByText("Start")).toBeTruthy();
        expect(screen.queryByText("Recording")).toBeNull();
    });

    it("calls actionRecorderClose and closes window on cancel", async () => {
        render(<ActionRecorderWindow />);

        const cancelButton = screen.getByText("Cancel");
        fireEvent.click(cancelButton);

        await waitFor(() => {
            expect(tauriBridge.actionRecorderClose).toHaveBeenCalled();
            expect(mockWindow.close).toHaveBeenCalled();
        });
    });

    it("handles Escape key to cancel", async () => {
        render(<ActionRecorderWindow />);

        fireEvent.keyDown(window, { key: "Escape" });

        await waitFor(() => {
            expect(tauriBridge.actionRecorderClose).toHaveBeenCalled();
        });
    });

    it("records click action when screenshot is clicked", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        // Wait for screenshot to load
        await waitFor(() => expect(screen.getByAltText("Screen capture")).toBeTruthy());

        const img = container.querySelector("img");
        expect(img).toBeTruthy();

        // Mock getBoundingClientRect for coordinate calculation
        img!.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => { },
        }));

        // Simulate click at (100, 100) which scales to (125, 125) real coords
        fireEvent.mouseDown(img!, { clientX: 100, clientY: 100, button: 0 });

        await waitFor(() => {
            expect(screen.getByText(/Actions \(1\)/)).toBeTruthy();
        });
    });

    it("calls actionRecorderComplete with actions on Done", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByAltText("Screen capture")).toBeTruthy());

        const img = container.querySelector("img");
        img!.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => { },
        }));

        // Record a click
        fireEvent.mouseDown(img!, { clientX: 100, clientY: 100, button: 0 });

        await waitFor(() => expect(screen.getByText(/Actions \(1\)/)).toBeTruthy());

        // Click Done
        const doneButton = screen.getByText("Done");
        fireEvent.click(doneButton);

        await waitFor(() => {
            expect(tauriBridge.actionRecorderComplete).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ type: "click", button: "Left" }),
                ])
            );
        });
    });

    it("accumulates text buffer during recording", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByText("Recording")).toBeTruthy());

        // Type some characters
        fireEvent.keyDown(window, { key: "h" });
        fireEvent.keyDown(window, { key: "i" });

        // Should show buffered action
        await waitFor(() => expect(screen.getByText(/Actions \(1\)/)).toBeTruthy());
    });

    it("ignores modifier keys alone", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByText("Recording")).toBeTruthy());

        // Press modifier keys alone
        fireEvent.keyDown(window, { key: "Shift" });
        fireEvent.keyDown(window, { key: "Control" });
        fireEvent.keyDown(window, { key: "Alt" });

        // Should still show 0 actions
        expect(screen.getByText(/Actions \(0\)/)).toBeTruthy();
    });

    it("flushes text buffer when recording stops", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByText("Recording")).toBeTruthy());

        // Type characters
        fireEvent.keyDown(window, { key: "t" });
        fireEvent.keyDown(window, { key: "e" });
        fireEvent.keyDown(window, { key: "s" });
        fireEvent.keyDown(window, { key: "t" });

        // Stop recording
        const stopButton = screen.getByText("Stop");
        fireEvent.click(stopButton);

        // Should convert buffer to action and display in list
        await waitFor(() => {
            const codeElements = screen.getAllByText("test");
            expect(codeElements.length).toBeGreaterThan(0);
        });
    });

    it("records right-click action", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByAltText("Screen capture")).toBeTruthy());

        const img = container.querySelector("img");
        img!.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => { },
        }));

        fireEvent.mouseDown(img!, { clientX: 100, clientY: 100, button: 2 });

        await waitFor(() => {
            expect(screen.getByText(/Click Right/)).toBeTruthy();
        });
    });

    it("deletes action when delete button clicked", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByAltText("Screen capture")).toBeTruthy());

        const img = container.querySelector("img");
        img!.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => { },
        }));

        // Record a click
        fireEvent.mouseDown(img!, { clientX: 100, clientY: 100, button: 0 });
        await waitFor(() => expect(screen.getByText(/Actions \(1\)/)).toBeTruthy());

        // Delete it
        const deleteButton = screen.getByTitle("Delete action");
        fireEvent.click(deleteButton);

        await waitFor(() => expect(screen.getByText(/Actions \(0\)/)).toBeTruthy());
    });

    it("moves action up when up button clicked", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByAltText("Screen capture")).toBeTruthy());

        const img = container.querySelector("img");
        img!.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => { },
        }));

        // Record two clicks
        fireEvent.mouseDown(img!, { clientX: 100, clientY: 100, button: 0 });
        await waitFor(() => expect(screen.getByText(/Actions \(1\)/)).toBeTruthy());

        fireEvent.mouseDown(img!, { clientX: 200, clientY: 200, button: 0 });
        await waitFor(() => expect(screen.getByText(/Actions \(2\)/)).toBeTruthy());

        // Move second action up
        const upButtons = screen.getAllByTitle("Move up");
        fireEvent.click(upButtons[1]);

        // Actions should now be swapped
        const actionItems = container.querySelectorAll(".action-item");
        expect(actionItems.length).toBe(2);
    });

    it("moves action down when down button clicked", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByAltText("Screen capture")).toBeTruthy());

        const img = container.querySelector("img");
        img!.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => { },
        }));

        // Record two clicks
        fireEvent.mouseDown(img!, { clientX: 100, clientY: 100, button: 0 });
        await waitFor(() => expect(screen.getByText(/Actions \(1\)/)).toBeTruthy());

        fireEvent.mouseDown(img!, { clientX: 200, clientY: 200, button: 0 });
        await waitFor(() => expect(screen.getByText(/Actions \(2\)/)).toBeTruthy());

        // Move first action down
        const downButtons = screen.getAllByTitle("Move down");
        fireEvent.click(downButtons[0]);

        // Actions should now be swapped
        const actionItems = container.querySelectorAll(".action-item");
        expect(actionItems.length).toBe(2);
    });

    it("prevents context menu on screenshot", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByAltText("Screen capture")).toBeTruthy());

        const img = container.querySelector("img");
        const contextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        const preventDefault = vi.spyOn(contextMenuEvent, "preventDefault");

        img!.dispatchEvent(contextMenuEvent);

        expect(preventDefault).toHaveBeenCalled();
    });

    it("flushes text buffer on screenshot click", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        const { container } = render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByText("Recording")).toBeTruthy());

        // Type some text
        fireEvent.keyDown(window, { key: "h" });
        fireEvent.keyDown(window, { key: "i" });

        await waitFor(() => expect(screen.getByText(/Actions \(1\)/)).toBeTruthy());

        const img = container.querySelector("img");
        img!.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            toJSON: () => { },
        }));

        // Click on screenshot - should flush text buffer
        fireEvent.mouseDown(img!, { clientX: 100, clientY: 100, button: 0 });

        // Should now have 2 actions: type "hi" and click
        await waitFor(() => expect(screen.getByText(/Actions \(2\)/)).toBeTruthy());
    });

    it("includes special keys in text buffer", async () => {
        (window as any).__ACTION_RECORDER_SCREENSHOT__ = "data:image/png;base64,test";

        render(<ActionRecorderWindow />);

        await waitFor(() => expect(screen.getByText("Recording")).toBeTruthy());

        // Type text with special key
        fireEvent.keyDown(window, { key: "h" });
        fireEvent.keyDown(window, { key: "i" });
        fireEvent.keyDown(window, { key: "Enter" });

        await waitFor(() => {
            expect(screen.getByText(/hi\[Enter\]/)).toBeTruthy();
        });
    });
});
