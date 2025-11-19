import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardReferenceOverlay } from "../src/components/KeyboardReferenceOverlay";

describe("KeyboardReferenceOverlay", () => {
    it("renders the overlay with title", () => {
        const onClose = vi.fn();
        render(<KeyboardReferenceOverlay onClose={onClose} />);

        expect(screen.getByText("Keyboard Token Reference")).toBeTruthy();
    });

    it("displays standard keys section", () => {
        render(<KeyboardReferenceOverlay onClose={vi.fn()} />);

        expect(screen.getByText("Standard Keys")).toBeTruthy();
        expect(screen.getByText("Enter")).toBeTruthy();
        expect(screen.getByText("Escape")).toBeTruthy();
        expect(screen.getByText("Tab")).toBeTruthy();
    });

    it("displays arrow keys section", () => {
        render(<KeyboardReferenceOverlay onClose={vi.fn()} />);

        expect(screen.getByText("Arrow Keys")).toBeTruthy();
        expect(screen.getByText("ArrowUp")).toBeTruthy();
        expect(screen.getByText("ArrowDown")).toBeTruthy();
    });

    it("displays modifiers section", () => {
        render(<KeyboardReferenceOverlay onClose={vi.fn()} />);

        expect(screen.getByText("Modifiers")).toBeTruthy();
        expect(screen.getByText("Shift")).toBeTruthy();
        expect(screen.getByText("Control")).toBeTruthy();
    });

    it("displays inline token syntax examples", () => {
        render(<KeyboardReferenceOverlay onClose={vi.fn()} />);

        expect(screen.getByText("Inline Token Syntax (for Type action)")).toBeTruthy();
        expect(screen.getByText("{Key:Enter}")).toBeTruthy();
        expect(screen.getByText("{Key:Ctrl+K}")).toBeTruthy();
    });

    it("calls onClose when close button is clicked", () => {
        const onClose = vi.fn();
        render(<KeyboardReferenceOverlay onClose={onClose} />);

        const closeButton = screen.getByLabelText("Close overlay");
        fireEvent.click(closeButton);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when backdrop is clicked", () => {
        const onClose = vi.fn();
        const { container } = render(<KeyboardReferenceOverlay onClose={onClose} />);

        const backdrop = container.querySelector(".overlay-backdrop");
        fireEvent.click(backdrop!);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when content is clicked", () => {
        const onClose = vi.fn();
        const { container } = render(<KeyboardReferenceOverlay onClose={onClose} />);

        const content = container.querySelector(".keyboard-reference-overlay");
        fireEvent.click(content!);

        expect(onClose).not.toHaveBeenCalled();
    });

    it("calls onClose when Escape key is pressed", () => {
        const onClose = vi.fn();
        render(<KeyboardReferenceOverlay onClose={onClose} />);

        fireEvent.keyDown(window, { key: "Escape" });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close on other key presses", () => {
        const onClose = vi.fn();
        render(<KeyboardReferenceOverlay onClose={onClose} />);

        fireEvent.keyDown(window, { key: "Enter" });

        expect(onClose).not.toHaveBeenCalled();
    });
});
