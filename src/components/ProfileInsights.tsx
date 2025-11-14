import { useMemo } from "react";
import { Profile, defaultPresetProfile } from "../types";
import { auditProfile, guardrailSummary } from "../utils/profileHealth";

export function ProfileInsights({
  profile,
  onRestorePreset,
}: {
  profile: Profile | null;
  onRestorePreset: () => void | Promise<void>;
}) {
  if (!profile) return null;
  const health = useMemo(() => auditProfile(profile), [profile]);
  const ok = health.errors.length === 0 && health.warnings.length === 0;
  const primaryIssues = health.errors.length ? health.errors : health.warnings;
  const preset = useMemo(() => defaultPresetProfile(), []);
  const usesPreset = profile.id === preset.id;

  return (
    <div className="profile-insights">
      <div className={`health-card ${ok ? "ok" : health.errors.length ? "error" : "warn"}`}>
        <strong>{ok ? "Ready for unattended runs" : health.errors.length ? "Fix before running" : "Review these warnings"}</strong>
        <ul>
          {ok ? (
            <li>
              Regions: {profile.regions.length} · Actions: {profile.actions.length} · {guardrailSummary(profile)}
            </li>
          ) : (
            primaryIssues.map((msg) => <li key={msg}>{msg}</li>)
          )}
        </ul>
      </div>
      <div className="preset-card">
        <div className="preset-card__header">
          <strong>Copilot Keep-Alive preset</strong>
          {usesPreset && <span className="preset-chip">Active</span>}
        </div>
        <p>
          Pre-configured to type "continue" and press Enter whenever your agent stalls. Includes safe guardrails (5s cooldown,
          3h max runtime, 120 activations/hour) so you can walk away confidently.
        </p>
        <div className="preset-card__meta">
          <span>{guardrailSummary(preset)}</span>
          <button type="button" onClick={() => onRestorePreset()} disabled={usesPreset}>
            {usesPreset ? "Preset loaded" : "Restore preset"}
          </button>
        </div>
      </div>
    </div>
  );
}
