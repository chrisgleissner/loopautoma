import { useMemo } from "react";
import { Profile, defaultPresetProfile } from "../types";

type ProfileSelectorProps = {
  profiles: Profile[];
  value: string | null;
  onChange: (id: string) => void;
  inputId?: string;
};

export function ProfileSelector({ profiles, value, onChange, inputId }: ProfileSelectorProps) {
  const presetId = useMemo(() => defaultPresetProfile().id, []);
  const presetProfiles = profiles.filter((p) => p.id === presetId);
  const customProfiles = profiles.filter((p) => p.id !== presetId);

  const renderOption = (p: Profile) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  );

  return (
    <select
      id={inputId}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      title="Choose the automation profile to edit or run"
      data-testid="profile-selector"
    >
      <option value="" disabled>
        Select profile
      </option>
      {presetProfiles.length > 0 && (
        <optgroup label="Preset">
          {presetProfiles.map(renderOption)}
        </optgroup>
      )}
      {customProfiles.length > 0 && (
        <optgroup label="Custom profiles">
          {customProfiles.map(renderOption)}
        </optgroup>
      )}
    </select>
  );
}
