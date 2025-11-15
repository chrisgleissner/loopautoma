use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

// Basic geometry and region types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Region {
    pub id: String,
    pub rect: Rect,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScreenFrame {
    pub display: DisplayInfo,
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub bytes: Vec<u8>,
    pub timestamp_ms: u64,
}

// Events flowing through the system (minimal for MVP)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Event {
    TriggerFired,
    ConditionEvaluated { result: bool },
    ActionStarted { action: String },
    ActionCompleted { action: String, success: bool },
    MonitorStateChanged { state: MonitorState },
    WatchdogTripped { reason: String },
    Error { message: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MonitorState {
    Stopped,
    Running,
    Stopping,
}

// Traits
pub trait Trigger {
    fn should_fire(&mut self, now: Instant) -> bool;
}

pub trait ScreenCapture {
    // A fast hash of a region (already downscaled by the impl as appropriate)
    fn hash_region(&self, region: &Region, downscale: u32) -> u64;
    fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError>;
    fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError>;
}

pub trait Condition {
    fn evaluate(&mut self, now: Instant, regions: &[Region], capture: &dyn ScreenCapture) -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

pub trait Automation {
    fn move_cursor(&self, x: u32, y: u32) -> Result<(), String>;
    fn click(&self, button: MouseButton) -> Result<(), String>;
    fn type_text(&self, text: &str) -> Result<(), String>;
    fn key(&self, key: &str) -> Result<(), String>;
    fn mouse_down(&self, button: MouseButton) -> Result<(), String> {
        self.click(button)
    }
    fn mouse_up(&self, _button: MouseButton) -> Result<(), String> {
        Ok(())
    }
    fn key_down(&self, key: &str) -> Result<(), String> {
        self.key(key)
    }
    fn key_up(&self, _key: &str) -> Result<(), String> {
        Ok(())
    }
}

pub type InputEventCallback = Arc<dyn Fn(InputEvent) + Send + Sync>;

pub trait InputCapture: Send {
    fn start(&mut self, callback: InputEventCallback) -> Result<(), BackendError>;
    fn stop(&mut self) -> Result<(), BackendError>;
}

/// ActionContext holds global variables that can be referenced by actions
#[derive(Debug, Clone, Default)]
pub struct ActionContext {
    pub variables: HashMap<String, String>,
}

impl ActionContext {
    pub fn new() -> Self {
        Self {
            variables: HashMap::new(),
        }
    }

    pub fn set(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.variables.insert(key.into(), value.into());
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.variables.get(key).map(|s| s.as_str())
    }

    /// Replace variables in text, e.g., "$prompt" -> actual value
    pub fn expand(&self, text: &str) -> String {
        let mut result = text.to_string();
        for (key, value) in &self.variables {
            let pattern = format!("${}", key);
            result = result.replace(&pattern, value);
        }
        result
    }
}

pub trait Action {
    fn name(&self) -> &'static str;
    fn execute(&self, automation: &dyn Automation, context: &mut ActionContext) -> Result<(), String>;
}

pub struct ActionSequence {
    pub actions: Vec<Box<dyn Action + Send + Sync>>, // keep it simple for now
}

impl ActionSequence {
    pub fn new(actions: Vec<Box<dyn Action + Send + Sync>>) -> Self {
        Self { actions }
    }

    pub fn run(&self, automation: &dyn Automation, context: &mut ActionContext, events: &mut Vec<Event>) -> bool {
        for a in &self.actions {
            events.push(Event::ActionStarted {
                action: a.name().to_string(),
            });
            match a.execute(automation, context) {
                Ok(()) => events.push(Event::ActionCompleted {
                    action: a.name().to_string(),
                    success: true,
                }),
                Err(e) => {
                    events.push(Event::Error {
                        message: format!("action '{}': {}", a.name(), e),
                    });
                    events.push(Event::ActionCompleted {
                        action: a.name().to_string(),
                        success: false,
                    });
                    return false;
                }
            }
        }
        true
    }
}

// Guardrails
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Guardrails {
    pub cooldown: Duration,
    pub max_runtime: Option<Duration>,
    pub max_activations_per_hour: Option<u32>,
}

impl Default for Guardrails {
    fn default() -> Self {
        Self {
            cooldown: Duration::from_millis(0),
            max_runtime: None,
            max_activations_per_hour: None,
        }
    }
}

// Minimal Profile model for JSON persistence
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub regions: Vec<Region>,
    // Simplified descriptors for MVP; full registry mapping later
    pub trigger: TriggerConfig,
    pub condition: ConditionConfig,
    pub actions: Vec<ActionConfig>,
    pub guardrails: Option<GuardrailsConfig>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TriggerConfig {
    pub r#type: String,
    pub check_interval_sec: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConditionConfig {
    pub r#type: String,
    pub stable_ms: u64,
    pub downscale: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ActionConfig {
    MoveCursor { x: u32, y: u32 },
    Click { button: MouseButton },
    Type { text: String },
    Key { key: String },
    LLMPromptGeneration {
        /// Region IDs to capture and send to LLM
        region_ids: Vec<String>,
        /// User's acceptable risk threshold (0.0-1.0)
        risk_threshold: f64,
        /// Optional system prompt for the LLM
        system_prompt: Option<String>,
        /// Variable name to store the generated prompt (default: "prompt")
        variable_name: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GuardrailsConfig {
    pub max_runtime_ms: Option<u64>,
    pub max_activations_per_hour: Option<u32>,
    pub cooldown_ms: u64,
}

/// Response from LLM for prompt generation
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LLMPromptResponse {
    /// The generated prompt text (max ~200 characters)
    pub prompt: String,
    /// Risk level assessment (0.0 = low, 1.0 = high)
    pub risk: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InputEvent {
    Mouse(MouseEvent),
    Keyboard(KeyboardEvent),
    Scroll(ScrollEvent),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MouseEvent {
    pub event_type: MouseEventType,
    pub x: f64,
    pub y: f64,
    pub modifiers: Modifiers,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MouseEventType {
    Move,
    ButtonDown(MouseButton),
    ButtonUp(MouseButton),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Modifiers {
    pub shift: bool,
    pub control: bool,
    pub alt: bool,
    pub meta: bool,
}

impl Default for Modifiers {
    fn default() -> Self {
        Self {
            shift: false,
            control: false,
            alt: false,
            meta: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyboardEvent {
    pub state: KeyState,
    pub key: String,
    pub code: u32,
    pub text: Option<String>,
    pub modifiers: Modifiers,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeyState {
    Down,
    Up,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScrollEvent {
    pub delta_x: f64,
    pub delta_y: f64,
    pub modifiers: Modifiers,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackendError {
    pub code: &'static str,
    pub message: String,
}

impl BackendError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for BackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for BackendError {}
