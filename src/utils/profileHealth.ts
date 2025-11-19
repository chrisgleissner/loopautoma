import { Profile } from "../types";

export type ProfileHealth = {
  errors: string[];
  warnings: string[];
};

const MIN_CHECK_INTERVAL_SEC = 0.1;
const MIN_COOLDOWN_MS = 500;
const MIN_COOLDOWN_SEC = MIN_COOLDOWN_MS / 1000;

export function auditProfile(profile: Profile | null): ProfileHealth {
  if (!profile) {
    return { errors: ["Select a profile"], warnings: [] };
  }
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!profile.id?.trim()) {
    errors.push("Profile ID is required.");
  }
  if (!profile.name?.trim()) {
    errors.push("Profile name is required.");
  }

  if (!Array.isArray(profile.regions) || profile.regions.length === 0) {
    errors.push("Define at least one Region before running unattended.");
  } else {
    profile.regions.forEach((region, idx) => {
      const { width, height } = region.rect;
      if (width <= 0 || height <= 0) {
        errors.push(`Region ${region.id || idx + 1} must have width/height > 0.`);
      }
    });
  }

  if (!profile.trigger || profile.trigger.check_interval_sec < MIN_CHECK_INTERVAL_SEC) {
    errors.push(`Trigger interval must be ≥ ${MIN_CHECK_INTERVAL_SEC} seconds.`);
  }

  if (!profile.condition) {
    errors.push("Condition is missing.");
  } else {
    if (profile.condition.consecutive_checks < 1) {
      errors.push("Condition consecutive_checks must be ≥ 1.");
    }
    if (profile.condition.consecutive_checks > 10) {
      warnings.push(`Consecutive checks is high (> 10); actions may take long to trigger.`);
    }
  }

  if (!Array.isArray(profile.actions) || profile.actions.length === 0) {
    warnings.push("Action sequence is empty.");
  }

  if (!profile.guardrails) {
    warnings.push("Guardrails missing: configure cooldown, runtime and activations/hour limits.");
  } else {
    if (profile.guardrails.cooldown_ms !== undefined && profile.guardrails.cooldown_ms < 0) {
      errors.push("Cooldown must be ≥ 0 seconds.");
    } else if ((profile.guardrails.cooldown_ms ?? 0) < MIN_COOLDOWN_MS) {
      warnings.push(`Cooldown below ${MIN_COOLDOWN_SEC}s may trigger actions too frequently.`);
    }
    if (!profile.guardrails.max_runtime_ms) {
      warnings.push("Max runtime is unset; monitor could run indefinitely.");
    }
    if (!profile.guardrails.max_activations_per_hour) {
      warnings.push("Max activations/hour is unset.");
    }
    
    // Termination condition warnings (Phase 7)
    const hasSuccessKeywords = profile.guardrails.success_keywords && profile.guardrails.success_keywords.length > 0;
    const hasFailureKeywords = profile.guardrails.failure_keywords && profile.guardrails.failure_keywords.length > 0;
    const hasOCRPattern = profile.guardrails.ocr_termination_pattern && profile.guardrails.ocr_termination_pattern.trim().length > 0;
    const hasHeartbeat = profile.guardrails.heartbeat_timeout_ms && profile.guardrails.heartbeat_timeout_ms > 0;
    const hasTerminationCondition = hasSuccessKeywords || hasFailureKeywords || hasOCRPattern || hasHeartbeat;
    
    if (!hasTerminationCondition && !profile.guardrails.max_runtime_ms) {
      warnings.push("No termination conditions configured. Consider adding success/failure keywords, OCR pattern, or heartbeat timeout.");
    }
    
    if (hasOCRPattern && (!profile.guardrails.ocr_region_ids || profile.guardrails.ocr_region_ids.length === 0)) {
      warnings.push("OCR termination pattern is set, but no regions are selected for OCR scanning.");
    }
  }
  
  // Check for AI adaptive mode without API key
  const hasLLMAction = profile.actions?.some((a) => a.type === "LLMPromptGeneration");
  if (hasLLMAction) {
    // Note: We can't check API key status here synchronously, so just provide a hint
    warnings.push("AI actions require OpenAI API key. Configure it in Settings if not already set.");
  }

  return { errors, warnings };
}

export function guardrailSummary(profile: Profile | null): string {
  if (!profile?.guardrails) {
    return "No guardrails configured";
  }
  const { cooldown_ms, max_runtime_ms, max_activations_per_hour } = profile.guardrails;
  const cooldown = `${Math.round((cooldown_ms ?? 0) / 1000)}s cooldown`;
  const runtime = max_runtime_ms ? `${Math.round(max_runtime_ms / 60000)}m max runtime` : "∞ runtime";
  const activations = max_activations_per_hour ? `${max_activations_per_hour}/h activations` : "∞ activations";
  return `${cooldown} · ${runtime} · ${activations}`;
}
