import React from "react";
import { GuardrailsConfig, Region } from "../types";
import { AcceleratingNumberInput } from "./AcceleratingNumberInput";

interface TerminationConditionsEditorProps {
  guardrails: GuardrailsConfig;
  regions: Region[];
  onGuardrailsChange: (guardrails: GuardrailsConfig) => void;
}

export function TerminationConditionsEditor({
  guardrails,
  regions,
  onGuardrailsChange,
}: TerminationConditionsEditorProps) {
  const updateGuardrails = (updates: Partial<GuardrailsConfig>) => {
    onGuardrailsChange({ ...guardrails, ...updates });
  };

  // Issue 2: Clean up stale OCR region IDs that no longer exist
  React.useEffect(() => {
    const currentIds = guardrails.ocr_region_ids || [];
    const validIds = new Set(regions.map(r => r.id));
    const filtered = currentIds.filter(id => validIds.has(id));
    if (filtered.length !== currentIds.length) {
      updateGuardrails({ ocr_region_ids: filtered });
    }
  }, [regions]);

  return (
    <div className="termination-conditions">
      <div className="termination-section">
        <h3 className="termination-section-title">Termination Conditions</h3>
        <p className="termination-help-text">
          Configure when the automation should automatically stop. Leave fields empty to disable
          specific termination checks.
        </p>
      </div>

      {/* Success/Failure Keywords */}
      <div className="termination-section">
        <h4 className="termination-subsection-title">Keyword Detection</h4>
        <div className="form-group">
          <label htmlFor="success-keywords" title="Keywords or regex patterns that indicate successful completion. Automation stops when detected.">
            Success Keywords
            <span className="help-text">
              (one per line, supports regex patterns)
            </span>
          </label>
          <textarea
            id="success-keywords"
            className="termination-textarea"
            rows={3}
            value={(guardrails.success_keywords || []).join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n").filter(Boolean);
              updateGuardrails({ success_keywords: lines });
            }}
            placeholder="BUILD SUCCESS&#10;All tests passed&#10;Deployment complete"
          />
        </div>

        <div className="form-group">
          <label htmlFor="failure-keywords" title="Keywords or regex patterns that indicate failure. Automation stops when detected.">
            Failure Keywords
            <span className="help-text">
              (one per line, supports regex patterns)
            </span>
          </label>
          <textarea
            id="failure-keywords"
            className="termination-textarea"
            rows={3}
            value={(guardrails.failure_keywords || []).join("\n")}
            onChange={(e) => {
              const lines = e.target.value.split("\n").filter(Boolean);
              updateGuardrails({ failure_keywords: lines });
            }}
            placeholder="ERROR&#10;FAILED&#10;Exception"
          />
        </div>
      </div>

      {/* OCR Termination Pattern */}
      <div className="termination-section">
        <h4 className="termination-subsection-title">OCR Pattern Matching</h4>
        <div className="form-group">
          <label htmlFor="ocr-mode" title="Choose between local Tesseract OCR or cloud-based GPT-4 Vision API for text extraction">
            OCR Mode
            <span className="help-text">
              (local = Tesseract, vision = GPT-4 Vision)
            </span>
          </label>
          <select
            id="ocr-mode"
            value={guardrails.ocr_mode || "vision"}
            onChange={(e) =>
              updateGuardrails({ ocr_mode: e.target.value as "local" | "vision" })
            }
          >
            <option value="vision">Vision API (default)</option>
            <option value="local">Local OCR (Tesseract)</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="ocr-pattern" title="Regular expression pattern to match against extracted text. When matched, the automation will stop.">
            OCR Termination Pattern
            <span className="help-text">(regex pattern)</span>
          </label>
          <input
            id="ocr-pattern"
            type="text"
            value={guardrails.ocr_termination_pattern || ""}
            onChange={(e) => updateGuardrails({ ocr_termination_pattern: e.target.value })}
            placeholder="DONE|COMPLETE|SUCCESS"
          />
        </div>

        <div className="form-group">
          <label htmlFor="ocr-regions">
            OCR Region IDs
            <span className="help-text">(regions to scan for patterns)</span>
          </label>
          <div className="ocr-region-selector">
            {regions.length === 0 ? (
              <p className="help-text">No regions defined yet</p>
            ) : (
              regions.map((region) => {
                const isSelected = (guardrails.ocr_region_ids || []).includes(region.id);
                return (
                  <label key={region.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const current = guardrails.ocr_region_ids || [];
                        const next = e.target.checked
                          ? [...current, region.id]
                          : current.filter((id) => id !== region.id);
                        updateGuardrails({ ocr_region_ids: next });
                      }}
                    />
                    <span>{region.name || region.id}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Timeout Settings */}
      <div className="termination-section">
        <h4 className="termination-subsection-title">Timeout Settings</h4>
        <div className="form-group">
          <label htmlFor="action-timeout" title="Maximum time (in milliseconds) allowed for each action to complete. Automation stops if exceeded.">
            Action Timeout (ms)
            <span className="help-text">(max time per action)</span>
          </label>
          <AcceleratingNumberInput
            value={guardrails.action_timeout_ms || ""}
            onValueChange={(val) => updateGuardrails({ action_timeout_ms: typeof val === "number" ? val : undefined })}
            min={0}
            placeholder="e.g. 30000 (30s)"
          />
        </div>

        <div className="form-group">
          <label htmlFor="heartbeat-timeout" title="Maximum time between automation cycles. If exceeded, the automation is considered stalled and will stop.">
            Heartbeat Timeout (ms)
            <span className="help-text">(detect stalled loops)</span>
          </label>
          <AcceleratingNumberInput
            value={guardrails.heartbeat_timeout_ms || ""}
            onValueChange={(val) => updateGuardrails({ heartbeat_timeout_ms: typeof val === "number" ? val : undefined })}
            min={0}
            placeholder="e.g. 60000 (60s)"
          />
        </div>

        <div className="form-group">
          <label htmlFor="max-consecutive-failures" title="Stop the automation after this many consecutive action failures.">
            Max Consecutive Failures
            <span className="help-text">(stop after N failures)</span>
          </label>
          <AcceleratingNumberInput
            value={guardrails.max_consecutive_failures || ""}
            onValueChange={(val) =>
              updateGuardrails({ max_consecutive_failures: typeof val === "number" ? val : undefined })
            }
            min={0}
            placeholder="e.g. 3"
          />
        </div>
      </div>
    </div>
  );
}
