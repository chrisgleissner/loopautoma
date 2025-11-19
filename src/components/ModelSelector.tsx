import { useState, useEffect } from "react";

export interface ModelOption {
    id: string;
    label: string;
    description: string;
    price: "$" | "$$" | "$$$";
}

export const OPENAI_MODELS: ModelOption[] = [
    {
        id: "gpt-4o-mini",
        label: "GPT-4o Mini — Fast & Low Cost",
        description: "Very cheap and fast multimodal model. Full OCR support for screenshots.",
        price: "$",
    },
    {
        id: "gpt-4o",
        label: "GPT-4o — Balanced Quality",
        description: "High-quality multimodal model with strong OCR. Recommended default.",
        price: "$$",
    },
    {
        id: "gpt-5.1",
        label: "GPT-5.1 — Advanced Reasoning",
        description: "Flagship reasoning model with full vision/OCR support. For complex tasks.",
        price: "$$$",
    },
    {
        id: "gpt-5.1-codex",
        label: "GPT-5.1 Codex — Coding + OCR",
        description: "Advanced coding model with accurate OCR for screenshot-based code.",
        price: "$$$",
    },
    {
        id: "gpt-5.1-codex-mini",
        label: "GPT-5.1 Codex Mini — Fast Coding + OCR",
        description: "Cheaper code-focused model that still supports OCR tasks.",
        price: "$$",
    },
];

interface ModelSelectorProps {
    selectedModel: string;
    onChange: (modelId: string) => void;
    theme: "light" | "dark";
}

export function ModelSelector({ selectedModel, onChange, theme }: ModelSelectorProps) {
    const [localSelection, setLocalSelection] = useState(selectedModel);

    useEffect(() => {
        setLocalSelection(selectedModel);
    }, [selectedModel]);

    const handleChange = (modelId: string) => {
        setLocalSelection(modelId);
        onChange(modelId);
    };

    const getPriceBadgeColor = (price: string) => {
        switch (price) {
            case "$":
                return "#4caf50";
            case "$$":
                return "#ff9800";
            case "$$$":
                return "#f44336";
            default:
                return "#999";
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {OPENAI_MODELS.map((model) => (
                <label
                    key={model.id}
                    style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: 12,
                        border: `2px solid ${localSelection === model.id ? "#2196f3" : theme === "dark" ? "#444" : "#ddd"}`,
                        borderRadius: 8,
                        cursor: "pointer",
                        backgroundColor: localSelection === model.id ? (theme === "dark" ? "#1a3a52" : "#e3f2fd") : "transparent",
                        transition: "all 0.2s ease",
                    }}
                >
                    <input
                        type="radio"
                        name="openai-model"
                        value={model.id}
                        checked={localSelection === model.id}
                        onChange={() => handleChange(model.id)}
                        style={{ marginTop: 4, cursor: "pointer" }}
                    />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{model.label}</span>
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#fff",
                                    backgroundColor: getPriceBadgeColor(model.price),
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                }}
                            >
                                {model.price}
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>{model.description}</p>
                    </div>
                </label>
            ))}
        </div>
    );
}
