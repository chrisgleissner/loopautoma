import { useState, useEffect } from "react";
import { getOpenAIKeyStatus, setOpenAIKey, deleteOpenAIKey, getOpenAIModel, setOpenAIModel } from "../tauriSecureStorage";
import { audioTestIntervention, audioTestCompleted, audioSetEnabled, audioGetEnabled, audioSetVolume, audioGetVolume } from "../tauriBridge";
import { ModelSelector } from "./ModelSelector";

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    theme: "light" | "dark";
    onThemeChange: (theme: "light" | "dark") => void;
    fontSize: number;
    onFontSizeChange: (size: number) => void;
}

export function SettingsPanel({
    isOpen,
    onClose,
    theme,
    onThemeChange,
    fontSize,
    onFontSizeChange,
}: SettingsPanelProps) {
    const [hasApiKey, setHasApiKey] = useState(false);
    const [keyInput, setKeyInput] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState("gpt-4o");
    
    // Audio notification states
    const [audioEnabled, setAudioEnabledState] = useState(false);
    const [audioVolume, setAudioVolumeState] = useState(0.5);
    const [audioStatusMessage, setAudioStatusMessage] = useState("");

    useEffect(() => {
        if (isOpen) {
            loadSettings();
        }
    }, [isOpen]);

    async function loadSettings() {
        try {
            const keyStatus = await getOpenAIKeyStatus();
            setHasApiKey(keyStatus);

            const model = await getOpenAIModel();
            setSelectedModel(model || "gpt-4o");
            
            // Load audio settings
            const enabled = await audioGetEnabled();
            setAudioEnabledState(enabled);
            
            const volume = await audioGetVolume();
            setAudioVolumeState(volume);
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    }

    async function handleModelChange(modelId: string) {
        try {
            await setOpenAIModel(modelId);
            setSelectedModel(modelId);
            setStatusMessage("✓ Model preference saved");
            setTimeout(() => setStatusMessage(""), 3000);
        } catch (error) {
            setStatusMessage(`Error saving model: ${error}`);
        }
    }

    async function handleSaveKey() {
        if (!keyInput.trim()) {
            setStatusMessage("API key cannot be empty");
            return;
        }

        setIsLoading(true);
        setStatusMessage("");

        try {
            await setOpenAIKey(keyInput);
            setHasApiKey(true);
            setIsEditing(false);
            setKeyInput("");
            setStatusMessage("✓ API key saved securely");
            setTimeout(() => setStatusMessage(""), 3000);
        } catch (error) {
            setStatusMessage(`Error: ${error}`);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleDeleteKey() {
        if (!confirm("Are you sure you want to delete the stored API key?")) {
            return;
        }

        setIsLoading(true);
        setStatusMessage("");

        try {
            await deleteOpenAIKey();
            setHasApiKey(false);
            setStatusMessage("✓ API key deleted");
            setTimeout(() => setStatusMessage(""), 3000);
        } catch (error) {
            setStatusMessage(`Error: ${error}`);
        } finally {
            setIsLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: theme === "dark" ? "#2d2d2d" : "#fff",
                    color: theme === "dark" ? "#e0e0e0" : "#333",
                    borderRadius: 8,
                    padding: 24,
                    maxWidth: 600,
                    width: "90%",
                    maxHeight: "80vh",
                    overflow: "auto",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <h2 style={{ margin: 0, fontSize: 24 }}>Settings</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: 24,
                            cursor: "pointer",
                            color: "inherit",
                            padding: 0,
                            width: 32,
                            height: 32,
                        }}
                        title="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Appearance Section */}
                <section style={{ marginBottom: 32 }}>
                    <h3 style={{ fontSize: 18, marginBottom: 16, borderBottom: `1px solid ${theme === "dark" ? "#444" : "#ddd"}`, paddingBottom: 8 }}>
                        Appearance
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ width: 100 }}>Theme:</span>
                            <select
                                value={theme}
                                onChange={(e) => onThemeChange(e.target.value as "light" | "dark")}
                                style={{
                                    padding: "6px 12px",
                                    borderRadius: 4,
                                    border: `1px solid ${theme === "dark" ? "#555" : "#ccc"}`,
                                    backgroundColor: theme === "dark" ? "#3d3d3d" : "#fff",
                                    color: "inherit",
                                }}
                            >
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ width: 100 }}>Font Size:</span>
                            <input
                                type="number"
                                min={10}
                                max={20}
                                value={fontSize}
                                onChange={(e) => onFontSizeChange(Number(e.target.value))}
                                style={{
                                    width: 80,
                                    padding: "6px 12px",
                                    borderRadius: 4,
                                    border: `1px solid ${theme === "dark" ? "#555" : "#ccc"}`,
                                    backgroundColor: theme === "dark" ? "#3d3d3d" : "#fff",
                                    color: "inherit",
                                }}
                            />
                            <span style={{ fontSize: 12, opacity: 0.7 }}>px</span>
                        </label>
                    </div>
                </section>

                {/* Audio Notifications Section */}
                <section style={{ marginBottom: 32 }}>
                    <h3 style={{ fontSize: 18, marginBottom: 16, borderBottom: `1px solid ${theme === "dark" ? "#444" : "#ddd"}`, paddingBottom: 8 }}>
                        Audio Notifications
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                            Play audio alerts when automation needs intervention or completes successfully.
                        </div>
                        
                        <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <input
                                type="checkbox"
                                checked={audioEnabled}
                                onChange={async (e) => {
                                    const enabled = e.target.checked;
                                    setAudioEnabledState(enabled);
                                    try {
                                        await audioSetEnabled(enabled);
                                        setAudioStatusMessage(`✓ Audio notifications ${enabled ? "enabled" : "disabled"}`);
                                        setTimeout(() => setAudioStatusMessage(""), 3000);
                                    } catch (error) {
                                        setAudioStatusMessage(`Error: ${error}`);
                                    }
                                }}
                                style={{ cursor: "pointer" }}
                            />
                            <span>Enable audio notifications</span>
                        </label>
                        
                        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ width: 100 }}>Volume:</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.1}
                                    value={audioVolume}
                                    onChange={(e) => setAudioVolumeState(Number(e.target.value))}
                                    onMouseUp={async (e) => {
                                        const volume = Number((e.target as HTMLInputElement).value);
                                        try {
                                            await audioSetVolume(volume);
                                            setAudioStatusMessage(`✓ Volume set to ${Math.round(volume * 100)}%`);
                                            setTimeout(() => setAudioStatusMessage(""), 3000);
                                        } catch (error) {
                                            setAudioStatusMessage(`Error: ${error}`);
                                        }
                                    }}
                                    style={{ flex: 1 }}
                                    disabled={!audioEnabled}
                                />
                                <span style={{ width: 50, textAlign: "right", fontSize: 12 }}>
                                    {Math.round(audioVolume * 100)}%
                                </span>
                            </div>
                        </label>
                        
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                                onClick={async () => {
                                    try {
                                        await audioTestIntervention();
                                        setAudioStatusMessage("✓ Playing intervention sound");
                                        setTimeout(() => setAudioStatusMessage(""), 3000);
                                    } catch (error) {
                                        setAudioStatusMessage(`Error: ${error}`);
                                    }
                                }}
                                disabled={!audioEnabled}
                                style={{
                                    padding: "8px 16px",
                                    borderRadius: 4,
                                    border: `1px solid ${theme === "dark" ? "#555" : "#ccc"}`,
                                    backgroundColor: theme === "dark" ? "#3d3d3d" : "#f5f5f5",
                                    color: "inherit",
                                    cursor: audioEnabled ? "pointer" : "not-allowed",
                                    opacity: audioEnabled ? 1 : 0.5,
                                }}
                            >
                                🔔 Test Intervention Sound
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await audioTestCompleted();
                                        setAudioStatusMessage("✓ Playing completion sound");
                                        setTimeout(() => setAudioStatusMessage(""), 3000);
                                    } catch (error) {
                                        setAudioStatusMessage(`Error: ${error}`);
                                    }
                                }}
                                disabled={!audioEnabled}
                                style={{
                                    padding: "8px 16px",
                                    borderRadius: 4,
                                    border: `1px solid ${theme === "dark" ? "#555" : "#ccc"}`,
                                    backgroundColor: theme === "dark" ? "#3d3d3d" : "#f5f5f5",
                                    color: "inherit",
                                    cursor: audioEnabled ? "pointer" : "not-allowed",
                                    opacity: audioEnabled ? 1 : 0.5,
                                }}
                            >
                                ✅ Test Completion Sound
                            </button>
                        </div>
                        
                        {audioStatusMessage && (
                            <div
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: 4,
                                    backgroundColor: audioStatusMessage.startsWith("✓")
                                        ? theme === "dark"
                                            ? "#1b3d1b"
                                            : "#e8f5e9"
                                        : theme === "dark"
                                            ? "#3d1f1f"
                                            : "#ffebee",
                                    color: audioStatusMessage.startsWith("✓") ? "#4caf50" : "#d32f2f",
                                    fontSize: 13,
                                }}
                            >
                                {audioStatusMessage}
                            </div>
                        )}
                    </div>
                </section>

                {/* OpenAI API Key Section */}
                <section>
                    <h3 style={{ fontSize: 18, marginBottom: 16, borderBottom: `1px solid ${theme === "dark" ? "#444" : "#ddd"}`, paddingBottom: 8 }}>
                        OpenAI Integration
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                            API keys are stored securely in your OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service).
                        </div>

                        {hasApiKey && !isEditing ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ color: "#4caf50", fontSize: 16 }}>✓</span>
                                    <span>API key is configured</span>
                                    <span style={{ fontFamily: "monospace", opacity: 0.5 }}>••••••••••••••••</span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: 4,
                                            border: `1px solid ${theme === "dark" ? "#555" : "#ccc"}`,
                                            backgroundColor: theme === "dark" ? "#3d3d3d" : "#f5f5f5",
                                            color: "inherit",
                                            cursor: "pointer",
                                        }}
                                    >
                                        Replace Key
                                    </button>
                                    <button
                                        onClick={handleDeleteKey}
                                        disabled={isLoading}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: 4,
                                            border: "1px solid #d32f2f",
                                            backgroundColor: theme === "dark" ? "#3d1f1f" : "#ffebee",
                                            color: "#d32f2f",
                                            cursor: isLoading ? "not-allowed" : "pointer",
                                            opacity: isLoading ? 0.6 : 1,
                                        }}
                                    >
                                        Delete Key
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <input
                                    type="password"
                                    value={keyInput}
                                    onChange={(e) => setKeyInput(e.target.value)}
                                    placeholder="sk-proj-..."
                                    style={{
                                        padding: "8px 12px",
                                        borderRadius: 4,
                                        border: `1px solid ${theme === "dark" ? "#555" : "#ccc"}`,
                                        backgroundColor: theme === "dark" ? "#3d3d3d" : "#fff",
                                        color: "inherit",
                                        fontFamily: "monospace",
                                        fontSize: 13,
                                    }}
                                />
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        onClick={handleSaveKey}
                                        disabled={isLoading}
                                        style={{
                                            padding: "8px 16px",
                                            borderRadius: 4,
                                            border: "none",
                                            backgroundColor: "#4caf50",
                                            color: "#fff",
                                            cursor: isLoading ? "not-allowed" : "pointer",
                                            opacity: isLoading ? 0.6 : 1,
                                        }}
                                    >
                                        {isLoading ? "Saving..." : "Save Key"}
                                    </button>
                                    {isEditing && (
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setKeyInput("");
                                            }}
                                            style={{
                                                padding: "8px 16px",
                                                borderRadius: 4,
                                                border: `1px solid ${theme === "dark" ? "#555" : "#ccc"}`,
                                                backgroundColor: "transparent",
                                                color: "inherit",
                                                cursor: "pointer",
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {statusMessage && (
                            <div
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: 4,
                                    backgroundColor: statusMessage.startsWith("✓")
                                        ? theme === "dark"
                                            ? "#1b3d1b"
                                            : "#e8f5e9"
                                        : theme === "dark"
                                            ? "#3d1f1f"
                                            : "#ffebee",
                                    color: statusMessage.startsWith("✓") ? "#4caf50" : "#d32f2f",
                                    fontSize: 13,
                                }}
                            >
                                {statusMessage}
                            </div>
                        )}

                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                            Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: "#2196f3" }}>platform.openai.com/api-keys</a>
                        </div>
                    </div>

                    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${theme === "dark" ? "#444" : "#ddd"}` }}>
                        <h4 style={{ fontSize: 16, marginBottom: 12, fontWeight: 600 }}>Preferred Model</h4>
                        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>
                            Select which OpenAI model to use for vision/OCR tasks. All models support screenshot analysis.
                        </div>
                        <ModelSelector
                            selectedModel={selectedModel}
                            onChange={handleModelChange}
                            theme={theme}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
