import { Profile } from "../types";

export function ProfileSelector({ profiles, value, onChange }: {
  profiles: Profile[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} title="Choose the automation profile to edit or run">
      <option value="" disabled>
        Select profile
      </option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
