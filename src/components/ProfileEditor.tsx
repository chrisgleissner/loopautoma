import { useEffect, useState } from "react";
import { ProfilesConfig, normalizeProfilesConfig } from "../types";
import { auditProfile } from "../utils/profileHealth";

type Props = {
  config: ProfilesConfig | null;
  onChange: (cfg: ProfilesConfig) => void;
};

export function ProfileEditor({ config, onChange }: Props) {
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<string[]>([]);

  useEffect(() => {
    if (config) {
      setText(JSON.stringify(config, null, 2));
    }
  }, [config]);

  const save = () => {
    try {
      const parsed = JSON.parse(text);
      const isArray = Array.isArray(parsed);
      const isConfigObject = !!parsed && typeof parsed === "object" && Array.isArray((parsed as any).profiles);
      if (!isArray && !isConfigObject) {
        throw new Error("Config must be either an array of profiles or { profiles: Profile[] }");
      }
      const normalized = normalizeProfilesConfig(parsed as any);
      const issues = normalized.profiles.flatMap((profile) => {
        const result = auditProfile(profile);
        return result.errors.map((msg) => `${profile.name ?? profile.id}: ${msg}`);
      });
      if (issues.length) {
        setValidationIssues(issues);
        setError(null);
        return;
      }
      setValidationIssues([]);
      setError(null);
      setText(JSON.stringify(normalized, null, 2));
      onChange(normalized);
    } catch (e: any) {
      setValidationIssues([]);
      setError(e?.message ?? String(e));
    }
  };

  if (!config) return <div style={{ opacity: 0.7 }}>Configuration is still loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
        Entire workspace config (all profiles) lives in this JSON. Changes here stay in sync with the editors above.
      </div>
      <textarea
        style={{ width: "100%", height: 260, fontFamily: "monospace" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={save}>Save Config</button>
        {error && <span style={{ color: "#e33" }}>{error}</span>}
      </div>
      {validationIssues.length > 0 && (
        <ul className="validation-errors" role="alert">
          {validationIssues.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
