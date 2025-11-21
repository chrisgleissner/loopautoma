import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsPanel } from "../src/components/SettingsPanel";
import * as secureStorage from "../src/tauriSecureStorage";
import * as tauriBridge from "../src/tauriBridge";

// Mock secure storage to prevent Tauri invocation errors
const secureStorageMocks = vi.hoisted(() => ({
    getOpenAIKeyStatus: vi.fn().mockResolvedValue(false),
    setOpenAIKey: vi.fn().mockResolvedValue(undefined),
    deleteOpenAIKey: vi.fn().mockResolvedValue(undefined),
    getOpenAIModel: vi.fn().mockResolvedValue("gpt-4o"),
    setOpenAIModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/tauriSecureStorage", () => secureStorageMocks);

const tauriBridgeMocks = vi.hoisted(() => ({
    audioTestIntervention: vi.fn().mockResolvedValue(undefined),
    audioTestCompleted: vi.fn().mockResolvedValue(undefined),
    audioSetEnabled: vi.fn().mockResolvedValue(undefined),
    audioGetEnabled: vi.fn().mockResolvedValue(false),
    audioSetVolume: vi.fn().mockResolvedValue(undefined),
    audioGetVolume: vi.fn().mockResolvedValue(0.5),
}));

vi.mock("../src/tauriBridge", () => tauriBridgeMocks);

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauriBridge.audioGetEnabled).mockResolvedValue(false);
    vi.mocked(tauriBridge.audioGetVolume).mockResolvedValue(0.5);
});

describe("SettingsPanel", () => {
    it("does not render when closed", () => {
        render(
            <SettingsPanel
                isOpen={false}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        expect(screen.queryByText(/Settings/i)).toBeNull();
    });

    it("renders main sections when open", async () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        // Check for main section headers
        expect(await screen.findByText(/Appearance/i)).toBeTruthy();
        expect(screen.getByText(/OpenAI Integration/i)).toBeTruthy();
    });

    it("shows theme selector with current value", () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="light"
                onThemeChange={vi.fn()}
                fontSize={14}
                onFontSizeChange={vi.fn()}
            />
        );

        const themeSelect = screen.getByLabelText(/Theme/i) as HTMLSelectElement;
        expect(themeSelect.value).toBe("light");
    });

    it("calls onThemeChange when theme is changed", async () => {
        const onThemeChange = vi.fn();
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={onThemeChange}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const themeSelect = screen.getByLabelText(/Theme/i) as HTMLSelectElement;
        fireEvent.change(themeSelect, { target: { value: "light" } });

        expect(onThemeChange).toHaveBeenCalledWith("light");
    });

    it("shows OpenAI Integration section", async () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        expect(await screen.findByText(/OpenAI Integration/i)).toBeTruthy();
        // Input field should be visible (no key configured initially)
        expect(await screen.findByPlaceholderText(/sk-proj/i)).toBeTruthy();
    });

    it("renders model selector section", async () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        expect(await screen.findByText(/Preferred Model/i)).toBeTruthy();
    });

    it("shows API key input when no key is configured", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(false);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/sk-proj/i)).toBeTruthy();
            expect(screen.getByText(/Save Key/i)).toBeTruthy();
        });
    });

    it("shows masked key and delete button when key is configured", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(true);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/API key is configured/)).toBeTruthy();
            expect(screen.getByText(/Delete Key/i)).toBeTruthy();
        });
    });

    it("shows Replace Key button when key exists", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(true);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/Replace Key/i)).toBeTruthy();
        });
    });

    it("saves model selection when changed", async () => {
        vi.mocked(secureStorage.setOpenAIModel).mockResolvedValue(undefined);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        await waitFor(() => expect(screen.getByText(/Preferred Model/i)).toBeTruthy());

        // Find radio button by value attribute
        const radioButtons = screen.getAllByRole("radio");
        const gpt4oMiniRadio = radioButtons.find((radio) => (radio as HTMLInputElement).value === "gpt-4o-mini");

        expect(gpt4oMiniRadio).toBeTruthy();
        fireEvent.click(gpt4oMiniRadio!);

        await waitFor(() => {
            expect(secureStorage.setOpenAIModel).toHaveBeenCalledWith("gpt-4o-mini");
        });
    });

    it("calls onClose when close button is clicked", () => {
        const onClose = vi.fn();
        render(
            <SettingsPanel
                isOpen={true}
                onClose={onClose}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const closeButton = screen.getByTitle(/Close/i);
        fireEvent.click(closeButton);

        expect(onClose).toHaveBeenCalled();
    });

    it("changes font size when font size selector is changed", () => {
        const onFontSizeChange = vi.fn();
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={onFontSizeChange}
            />
        );

        const fontSelect = screen.getByLabelText(/Font Size/i) as HTMLSelectElement;
        fireEvent.change(fontSelect, { target: { value: "14" } });

        expect(onFontSizeChange).toHaveBeenCalledWith(14);
    });

    it("displays current font size in selector", () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={14}
                onFontSizeChange={vi.fn()}
            />
        );

        const fontSelect = screen.getByLabelText(/Font Size/i) as HTMLSelectElement;
        expect(fontSelect.value).toBe("14");
    });

    it("calls onClose when backdrop is clicked", () => {
        const onClose = vi.fn();
        const { container } = render(
            <SettingsPanel
                isOpen={true}
                onClose={onClose}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        // Click backdrop
        const backdrop = container.firstChild as HTMLElement;
        fireEvent.click(backdrop);

        expect(onClose).toHaveBeenCalled();
    });

    it("does not close when panel content is clicked", () => {
        const onClose = vi.fn();
        render(
            <SettingsPanel
                isOpen={true}
                onClose={onClose}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const heading = screen.getByText("Settings");
        fireEvent.click(heading);

        expect(onClose).not.toHaveBeenCalled();
    });

    it("saves API key successfully and shows success state", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(false);
        vi.mocked(secureStorage.setOpenAIKey).mockResolvedValue(undefined);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const input = await screen.findByPlaceholderText(/sk-proj/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "sk-test-key-12345" } });

        const saveButton = screen.getByText(/Save Key/i);
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(secureStorage.setOpenAIKey).toHaveBeenCalledWith("sk-test-key-12345");
        });
    });

    it("deletes API key successfully", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(true);
        vi.mocked(secureStorage.deleteOpenAIKey).mockResolvedValue(undefined);

        // Mock window.confirm
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const deleteButton = await screen.findByText(/Delete Key/i);
        fireEvent.click(deleteButton);

        await waitFor(() => {
            expect(secureStorage.deleteOpenAIKey).toHaveBeenCalled();
        });

        confirmSpy.mockRestore();
    });

    it("replaces existing API key", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(true);
        vi.mocked(secureStorage.setOpenAIKey).mockResolvedValue(undefined);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        // First click "Replace Key" button to enter editing mode
        const replaceButton = await screen.findByText(/Replace Key/i);
        fireEvent.click(replaceButton);

        // Now input should be visible
        const input = await screen.findByPlaceholderText(/sk-proj/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "sk-new-key-67890" } });

        // Click Save Key button
        const saveButton = screen.getByText(/Save Key/i);
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(secureStorage.setOpenAIKey).toHaveBeenCalledWith("sk-new-key-67890");
        });
    });

    it("handles API key save error gracefully", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(false);
        vi.mocked(secureStorage.setOpenAIKey).mockRejectedValue(new Error("Keyring not available"));

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const input = await screen.findByPlaceholderText(/sk-proj/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "sk-test-key" } });

        const saveButton = screen.getByText(/Save Key/i);
        fireEvent.click(saveButton);

        // Error message should appear in UI
        await waitFor(() => {
            expect(screen.getByText(/Error:/)).toBeTruthy();
        });
    });

    it("handles API key delete error gracefully", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(true);
        vi.mocked(secureStorage.deleteOpenAIKey).mockRejectedValue(new Error("Permission denied"));

        // Mock window.confirm to bypass dialog
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const deleteButton = await screen.findByText(/Delete Key/i);
        fireEvent.click(deleteButton);

        // Error message should appear in UI
        await waitFor(() => {
            expect(screen.getByText(/Error:/)).toBeTruthy();
        });

        confirmSpy.mockRestore();
    });

    it("handles model selection error gracefully", async () => {
        vi.mocked(secureStorage.setOpenAIModel).mockRejectedValue(new Error("Storage error"));

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        await waitFor(() => expect(screen.getByText(/Preferred Model/i)).toBeTruthy());

        const radioButtons = screen.getAllByRole("radio");
        const gpt4oMiniRadio = radioButtons.find((radio) => (radio as HTMLInputElement).value === "gpt-4o-mini");

        fireEvent.click(gpt4oMiniRadio!);

        // Error message should appear in UI
        await waitFor(() => {
            expect(screen.getByText(/Error saving model:/)).toBeTruthy();
        });
    });

    it("validates empty input on save attempt", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(false);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        await screen.findByPlaceholderText(/sk-proj/i);

        const saveButton = screen.getByText(/Save Key/i);
        fireEvent.click(saveButton);

        // Should show validation message for empty input
        await waitFor(() => {
            expect(screen.getByText(/API key cannot be empty/)).toBeTruthy();
        });
    });

    it("renders light theme styles", () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="light"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const panel = screen.getByText("Settings").parentElement;
        expect(panel).toBeTruthy();
    });

    it("handles empty model value", async () => {
        vi.mocked(secureStorage.getOpenAIKeyStatus).mockResolvedValue(true);
        vi.mocked(secureStorage.getOpenAIModel).mockResolvedValue("");

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        // Component should handle empty model gracefully
        await waitFor(() => {
            expect(screen.getByText("OpenAI Integration")).toBeTruthy();
        });
    });

    it("handles boundary font sizes", () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={10}
                onFontSizeChange={vi.fn()}
            />
        );

        const fontInput = screen.getByDisplayValue("10");
        expect(fontInput).toBeTruthy();
    });

    it("handles max font size", () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={20}
                onFontSizeChange={vi.fn()}
            />
        );

        const fontInput = screen.getByDisplayValue("20");
        expect(fontInput).toBeTruthy();
    });

    it("loads audio preferences on open", async () => {
        vi.mocked(tauriBridge.audioGetEnabled).mockResolvedValue(true);
        vi.mocked(tauriBridge.audioGetVolume).mockResolvedValue(0.7);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const checkbox = await screen.findByRole("checkbox", { name: /enable audio notifications/i });
        expect(checkbox).toBeChecked();

        const slider = screen.getByRole("slider") as HTMLInputElement;
        expect(slider.value).toBe("0.7");
    });

    it("persists audio toggle changes", async () => {
        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const checkbox = await screen.findByRole("checkbox", { name: /enable audio notifications/i });
        fireEvent.click(checkbox);

        await waitFor(() => {
            expect(tauriBridge.audioSetEnabled).toHaveBeenCalledWith(true);
        });
        expect(screen.getByText(/Audio notifications enabled/i)).toBeInTheDocument();
    });

    it("persists volume adjustments", async () => {
        vi.mocked(tauriBridge.audioGetEnabled).mockResolvedValue(true);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const slider = await screen.findByRole("slider") as HTMLInputElement;
        fireEvent.change(slider, { target: { value: "0.8" } });
        fireEvent.mouseUp(slider, { target: { value: "0.8" } });

        await waitFor(() => {
            expect(tauriBridge.audioSetVolume).toHaveBeenCalledWith(0.8);
        });
        expect(screen.getByText(/Volume set to 80%/i)).toBeInTheDocument();
    });

    it("plays test sounds when buttons clicked", async () => {
        vi.mocked(tauriBridge.audioGetEnabled).mockResolvedValue(true);

        render(
            <SettingsPanel
                isOpen={true}
                onClose={vi.fn()}
                theme="dark"
                onThemeChange={vi.fn()}
                fontSize={13}
                onFontSizeChange={vi.fn()}
            />
        );

        const interventionButton = await screen.findByText(/Test Intervention Sound/i);
        fireEvent.click(interventionButton);
        await waitFor(() => {
            expect(tauriBridge.audioTestIntervention).toHaveBeenCalled();
        });

        const completionButton = await screen.findByText(/Test Completion Sound/i);
        fireEvent.click(completionButton);
        await waitFor(() => {
            expect(tauriBridge.audioTestCompleted).toHaveBeenCalled();
        });
    });
});
