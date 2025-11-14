import { Profile } from "../types";

export type ProfileHealth = {
  errors: string[];
  warnings: string[];
};

const MIN_INTERVAL_MS = 100;
const MIN_STABLE_MS = 500;
const MIN_COOLDOWN_MS = 500;

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

  if (!profile.trigger || profile.trigger.interval_ms < MIN_INTERVAL_MS) {
    errors.push(`Trigger interval must be ≥ ${MIN_INTERVAL_MS} ms.`);
  }

  if (!profile.condition) {
    errors.push("Condition is missing.");
  } else {
    if (profile.condition.downscale < 1) {
      errors.push("Condition downscale must be ≥ 1.");
    }
    if (profile.condition.stable_ms < MIN_STABLE_MS) {
      warnings.push(`Stable duration is low (< ${MIN_STABLE_MS} ms); monitor may flap.`);
    }
  }

  if (!Array.isArray(profile.actions) || profile.actions.length === 0) {
    warnings.push("Action sequence is empty.");
  }

  if (!profile.guardrails) {
    warnings.push("Guardrails missing: configure cooldown, runtime and activations/hour limits.");
  } else {
    if (profile.guardrails.cooldown_ms !== undefined && profile.guardrails.cooldown_ms < 0) {
      errors.push("Cooldown must be ≥ 0 ms.");
    } else if ((profile.guardrails.cooldown_ms ?? 0) < MIN_COOLDOWN_MS) {
      warnings.push("Cooldown below 500 ms may trigger actions too frequently.");
    }
    if (!profile.guardrails.max_runtime_ms) {
      warnings.push("Max runtime is unset; monitor could run indefinitely.");
    }
    if (!profile.guardrails.max_activations_per_hour) {
      warnings.push("Max activations/hour is unset.");
    }
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
