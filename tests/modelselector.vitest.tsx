import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelSelector, OPENAI_MODELS } from "../src/components/ModelSelector";

describe("ModelSelector", () => {
    it("renders all 5 curated OCR-capable models", () => {
        render(<ModelSelector selectedModel="gpt-4o" onChange={vi.fn()} theme="dark" />);

        expect(screen.getByLabelText(/GPT-4o Mini/i)).toBeTruthy();
        expect(screen.getByLabelText(/GPT-4o — Balanced Quality/i)).toBeTruthy();
        expect(screen.getByLabelText(/GPT-5\.1 — Advanced Reasoning/i)).toBeTruthy();
        expect(screen.getByLabelText(/GPT-5\.1 Codex — Coding/i)).toBeTruthy();
        expect(screen.getByLabelText(/GPT-5\.1 Codex Mini/i)).toBeTruthy();
    });

    it("displays price badges for each model", () => {
        render(<ModelSelector selectedModel="gpt-4o" onChange={vi.fn()} theme="dark" />);

        const badges = screen.getAllByText(/\$+/);
        expect(badges.length).toBe(5); // All 5 models have price badges
    });

    it("displays descriptions for each model", () => {
        render(<ModelSelector selectedModel="gpt-4o" onChange={vi.fn()} theme="dark" />);

        expect(screen.getByText(/Fast & Low Cost/i)).toBeTruthy();
        expect(screen.getByText(/Balanced Quality/i)).toBeTruthy();
        expect(screen.getByText(/Advanced Reasoning/i)).toBeTruthy();
        // "Coding + OCR" appears in multiple descriptions, so use getAllByText
        expect(screen.getAllByText(/Coding/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Fast Coding \+ OCR/i)).toBeTruthy();
    });

    it("selects the model matching the selectedModel prop", () => {
        render(<ModelSelector selectedModel="gpt-4o-mini" onChange={vi.fn()} theme="dark" />);

        const miniRadio = screen.getByLabelText(/GPT-4o Mini/i) as HTMLInputElement;
        expect(miniRadio.checked).toBe(true);

        const gpt4oRadio = screen.getByLabelText(/GPT-4o — Balanced/i) as HTMLInputElement;
        expect(gpt4oRadio.checked).toBe(false);
    });

    it("calls onChange when a different model is selected", () => {
        const onChange = vi.fn();
        render(<ModelSelector selectedModel="gpt-4o" onChange={onChange} theme="dark" />);

        const codexRadio = screen.getByLabelText(/GPT-5\.1 Codex — Coding/i);
        fireEvent.click(codexRadio);

        expect(onChange).toHaveBeenCalledWith("gpt-5.1-codex");
    });

    it("uses green badge for $ models", () => {
        const { container } = render(<ModelSelector selectedModel="gpt-4o" onChange={vi.fn()} theme="dark" />);

        const miniOption = container.querySelector('[value="gpt-4o-mini"]')?.parentElement;
        expect(miniOption?.textContent).toContain("$");

        // Find the price badge span - check for RGB or hex green
        const badge = miniOption?.querySelector("span[style*='background']");
        const style = badge?.getAttribute("style") || "";
        expect(style.includes("#4caf50") || style.includes("rgb(76, 175, 80)")).toBe(true);
    });

    it("uses orange badge for $$ models", () => {
        const { container } = render(<ModelSelector selectedModel="gpt-4o" onChange={vi.fn()} theme="dark" />);

        const gpt4oOption = container.querySelector('[value="gpt-4o"]')?.parentElement;
        const badge = gpt4oOption?.querySelector("span[style*='background']");
        const style = badge?.getAttribute("style") || "";
        expect(style.includes("#ff9800") || style.includes("rgb(255, 152, 0)")).toBe(true);
    });

    it("uses red badge for $$$ models", () => {
        const { container } = render(<ModelSelector selectedModel="gpt-4o" onChange={vi.fn()} theme="dark" />);

        const gpt51Option = container.querySelector('[value="gpt-5.1"]')?.parentElement;
        const badge = gpt51Option?.querySelector("span[style*='background']");
        const style = badge?.getAttribute("style") || "";
        expect(style.includes("#f44336") || style.includes("rgb(244, 67, 54)")).toBe(true);
    });

    it("exports correct OPENAI_MODELS array", () => {
        expect(OPENAI_MODELS).toHaveLength(5);
        expect(OPENAI_MODELS[0].id).toBe("gpt-4o-mini");
        expect(OPENAI_MODELS[1].id).toBe("gpt-4o");
        expect(OPENAI_MODELS[2].id).toBe("gpt-5.1");
        expect(OPENAI_MODELS[3].id).toBe("gpt-5.1-codex");
        expect(OPENAI_MODELS[4].id).toBe("gpt-5.1-codex-mini");
    });

    it("includes all required fields for each model", () => {
        OPENAI_MODELS.forEach(model => {
            expect(model.id).toBeTruthy();
            expect(model.label).toBeTruthy();
            expect(model.description).toBeTruthy();
            expect(model.price).toMatch(/^\$+$/); // Should be $, $$, or $$$
        });
    });

    it("handles rapid model selection changes", () => {
        const onChange = vi.fn();
        render(<ModelSelector selectedModel="gpt-4o" onChange={onChange} theme="dark" />);

        fireEvent.click(screen.getByLabelText(/GPT-4o Mini/i));
        fireEvent.click(screen.getByLabelText(/GPT-5\.1 — Advanced/i));
        fireEvent.click(screen.getByLabelText(/GPT-5\.1 Codex Mini/i));

        expect(onChange).toHaveBeenCalledTimes(3);
        expect(onChange).toHaveBeenNthCalledWith(1, "gpt-4o-mini");
        expect(onChange).toHaveBeenNthCalledWith(2, "gpt-5.1");
        expect(onChange).toHaveBeenNthCalledWith(3, "gpt-5.1-codex-mini");
    });
});
