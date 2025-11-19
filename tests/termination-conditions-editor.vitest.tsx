import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TerminationConditionsEditor } from "../src/components/TerminationConditionsEditor";
import { GuardrailsConfig, Region } from "../src/types";
import userEvent from "@testing-library/user-event";

describe("TerminationConditionsEditor", () => {
  const mockRegions: Region[] = [
    { id: "region-1", rect: { x: 0, y: 0, width: 100, height: 100 }, name: "Region 1" },
    { id: "region-2", rect: { x: 100, y: 0, width: 100, height: 100 }, name: "Region 2" },
  ];

  const defaultGuardrails: GuardrailsConfig = {
    cooldown_ms: 5000,
  };

  let mockOnGuardrailsChange: (guardrails: GuardrailsConfig) => void;

  beforeEach(() => {
    mockOnGuardrailsChange = () => {};
  });

  it("renders termination conditions section", () => {
    render(
      <TerminationConditionsEditor
        guardrails={defaultGuardrails}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    expect(screen.getByText("Termination Conditions")).toBeInTheDocument();
    expect(screen.getByText("Keyword Detection")).toBeInTheDocument();
    expect(screen.getByText("OCR Pattern Matching")).toBeInTheDocument();
    expect(screen.getByText("Timeout Settings")).toBeInTheDocument();
  });

  it("renders success and failure keyword textareas", () => {
    render(
      <TerminationConditionsEditor
        guardrails={{
          ...defaultGuardrails,
          success_keywords: ["DONE", "SUCCESS"],
          failure_keywords: ["ERROR", "FAILED"],
        }}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    const successTextarea = screen.getByLabelText(/Success Keywords/i);
    const failureTextarea = screen.getByLabelText(/Failure Keywords/i);

    expect(successTextarea).toHaveValue("DONE\nSUCCESS");
    expect(failureTextarea).toHaveValue("ERROR\nFAILED");
  });

  it("updates success keywords on textarea change", async () => {
    const user = userEvent.setup();
    let capturedGuardrails: GuardrailsConfig | null = null;
    mockOnGuardrailsChange = (guardrails) => {
      capturedGuardrails = guardrails;
    };

    render(
      <TerminationConditionsEditor
        guardrails={defaultGuardrails}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    const successTextarea = screen.getByLabelText(/Success Keywords/i) as HTMLTextAreaElement;
    
    // Directly paste text to avoid userEvent character-by-character issues
    await user.click(successTextarea);
    await user.paste("BUILD SUCCESS\nAll tests passed");

    expect(capturedGuardrails).not.toBeNull();
    // The onChange splits by newlines, so we should have 2 keywords
    expect(capturedGuardrails?.success_keywords).toEqual(["BUILD SUCCESS", "All tests passed"]);
  });

  it("renders OCR mode selector", () => {
    render(
      <TerminationConditionsEditor
        guardrails={{ ...defaultGuardrails, ocr_mode: "local" }}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    const ocrModeSelect = screen.getByLabelText(/OCR Mode/i);
    expect(ocrModeSelect).toHaveValue("local");
  });

  it("updates OCR mode on select change", async () => {
    const user = userEvent.setup();
    let capturedGuardrails: GuardrailsConfig | null = null;
    mockOnGuardrailsChange = (guardrails) => {
      capturedGuardrails = guardrails;
    };

    render(
      <TerminationConditionsEditor
        guardrails={defaultGuardrails}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    const ocrModeSelect = screen.getByLabelText(/OCR Mode/i);
    await user.selectOptions(ocrModeSelect, "local");

    expect(capturedGuardrails).not.toBeNull();
    expect(capturedGuardrails?.ocr_mode).toBe("local");
  });

  it("renders OCR termination pattern input", () => {
    render(
      <TerminationConditionsEditor
        guardrails={{ ...defaultGuardrails, ocr_termination_pattern: "DONE|COMPLETE" }}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    const patternInput = screen.getByLabelText(/OCR Termination Pattern/i);
    expect(patternInput).toHaveValue("DONE|COMPLETE");
  });

  it("renders OCR region checkboxes", () => {
    render(
      <TerminationConditionsEditor
        guardrails={defaultGuardrails}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    expect(screen.getByText("Region 1")).toBeInTheDocument();
    expect(screen.getByText("Region 2")).toBeInTheDocument();
  });

  it("updates OCR region selection on checkbox change", async () => {
    const user = userEvent.setup();
    let capturedGuardrails: GuardrailsConfig | null = null;
    mockOnGuardrailsChange = (guardrails) => {
      capturedGuardrails = guardrails;
    };

    render(
      <TerminationConditionsEditor
        guardrails={defaultGuardrails}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    const region1Checkbox = screen.getByLabelText("Region 1");
    await user.click(region1Checkbox);

    expect(capturedGuardrails).not.toBeNull();
    expect(capturedGuardrails?.ocr_region_ids).toEqual(["region-1"]);
  });

  it("shows 'No regions defined yet' when no regions provided", () => {
    render(
      <TerminationConditionsEditor
        guardrails={defaultGuardrails}
        regions={[]}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    expect(screen.getByText("No regions defined yet")).toBeInTheDocument();
  });

  it("renders timeout input fields", () => {
    render(
      <TerminationConditionsEditor
        guardrails={{
          ...defaultGuardrails,
          action_timeout_ms: 30000,
          heartbeat_timeout_ms: 60000,
          max_consecutive_failures: 3,
        }}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    // AcceleratingNumberInput wraps the actual input, so we check for presence via text
    expect(screen.getByText("Action Timeout (ms)")).toBeInTheDocument();
    expect(screen.getByText("Heartbeat Timeout (ms)")).toBeInTheDocument();
    expect(screen.getByText("Max Consecutive Failures")).toBeInTheDocument();
    
    // Verify inputs have correct values
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveValue(30000);
    expect(inputs[1]).toHaveValue(60000);
    expect(inputs[2]).toHaveValue(3);
  });

  it("handles empty guardrails fields", () => {
    render(
      <TerminationConditionsEditor
        guardrails={defaultGuardrails}
        regions={mockRegions}
        onGuardrailsChange={mockOnGuardrailsChange}
      />
    );

    const successTextarea = screen.getByLabelText(/Success Keywords/i);
    const failureTextarea = screen.getByLabelText(/Failure Keywords/i);
    const patternInput = screen.getByLabelText(/OCR Termination Pattern/i);

    expect(successTextarea).toHaveValue("");
    expect(failureTextarea).toHaveValue("");
    expect(patternInput).toHaveValue("");
  });
});
