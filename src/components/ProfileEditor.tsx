import { useEffect, useState } from "react";
import { Profile } from "../types";

export function ProfileEditor({ profile, onChange }: { profile: Profile | null; onChange: (p: Profile) => void }) {
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setText(JSON.stringify(profile, null, 2));
  }, [profile]);

  const save = () => {
    try {
      const parsed = JSON.parse(text);
      // very light validation
      if (!parsed || typeof parsed.id !== "string" || !Array.isArray(parsed.actions)) {
        throw new Error("Invalid profile shape");
      }
      setError(null);
      onChange(parsed);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  if (!profile) return <div style={{ opacity: 0.7 }}>No profile selected</div>;

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
        Tip: Edit JSON directly or use the Graphical Composer above. Both views stay in sync.
      </div>
      <textarea
        style={{ width: "100%", height: 200, fontFamily: "monospace" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={save}>Save Profile</button>
        {error && <span style={{ color: "#e33" }}>{error}</span>}
      </div>
    </div>
  );
}
