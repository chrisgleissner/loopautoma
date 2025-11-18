// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod action;
mod condition;
pub mod domain;
mod llm;
mod monitor;
#[cfg(any(
    feature = "os-linux-capture-xcap",
    feature = "os-linux-automation",
    feature = "os-macos",
    feature = "os-windows"
))]
pub mod os;
mod soak;
#[cfg(test)]
mod tests;
mod trigger;

use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as Base64Standard;
use base64::Engine as _;
use domain::*;
use image::imageops::FilterType;
use image::{DynamicImage, ImageOutputFormat, RgbaImage};
use tauri::Emitter; // for Window.emit
use tauri::Manager;
mod fakes;
use fakes::{FakeAutomation, FakeCapture};
use serde::{Deserialize, Serialize};
pub use soak::{run_soak, SoakConfig, SoakReport};
use std::env;

fn env_truthy(name: &str) -> bool {
    matches!(
        env::var(name).ok().as_deref(),
        Some("1" | "true" | "TRUE" | "True" | "yes" | "YES" | "on" | "ON" | "y" | "Y")
    )
}

fn is_release_runtime() -> bool {
    if env_truthy("LOOPAUTOMA_TREAT_AS_RELEASE") {
        return true;
    }
    !cfg!(debug_assertions)
}

fn default_profile() -> Profile {
    Profile {
        id: "keep-agent-001".into(),
        name: "Keep AI Agent Active".into(),
        regions: vec![
            Region {
                id: "chat-out".into(),
                rect: Rect {
                    x: 80,
                    y: 120,
                    width: 1200,
                    height: 600,
                },
                name: Some("Agent Output".into()),
            },
            Region {
                id: "progress".into(),
                rect: Rect {
                    x: 80,
                    y: 740,
                    width: 1200,
                    height: 200,
                },
                name: Some("Progress Area".into()),
            },
        ],
        trigger: TriggerConfig {
            r#type: "IntervalTrigger".into(),
            check_interval_sec: 60.0,
        },
        condition: ConditionConfig {
            r#type: "RegionCondition".into(),
            stable_ms: 8_000,
            downscale: 4,
        },
        actions: vec![
            ActionConfig::Click {
                x: 960,
                y: 980,
                button: MouseButton::Left,
            },
            ActionConfig::Type {
                text: "continue".into(),
            },
            ActionConfig::Type {
                text: "{Key:Enter}".into(),
            },
        ],
        guardrails: Some(GuardrailsConfig {
            max_runtime_ms: Some(3 * 60 * 60 * 1000),
            max_activations_per_hour: Some(120),
            cooldown_ms: 5_000,
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct ProfilesConfig {
    version: Option<u32>,
    profiles: Vec<Profile>,
}

impl Default for ProfilesConfig {
    fn default() -> Self {
        Self {
            version: Some(1),
            profiles: vec![default_profile()],
        }
    }
}

impl ProfilesConfig {
    fn normalize(mut self) -> Self {
        if self.profiles.is_empty() {
            self.profiles.push(default_profile());
        }
        if self.version.is_none() {
            self.version = Some(1);
        }
        self
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Default)]
struct AppState {
    profiles: Mutex<ProfilesConfig>,      // in-memory MVP
    runner: Mutex<Option<MonitorRunner>>, // current monitor runner
}

struct MonitorRunner {
    cancel: Arc<AtomicBool>,
    panic: Arc<AtomicBool>,
    #[allow(dead_code)]
    handle: std::thread::JoinHandle<()>,
}

pub fn finalize_monitor_shutdown(mon: &mut monitor::Monitor, panic_stop: bool) -> Vec<Event> {
    let mut events = vec![];
    if panic_stop {
        events.push(Event::WatchdogTripped {
            reason: "panic_stop".into(),
        });
    }
    if mon.started_at.is_some() {
        mon.stop(&mut events);
    }
    events
}

enum StopReason {
    Graceful,
    Panic,
}

pub fn build_monitor_from_profile<'a>(p: &Profile) -> (monitor::Monitor<'a>, Vec<Region>) {
    // Trigger
    let secs = p.trigger.check_interval_sec.clamp(0.1, 86_400.0);
    let trig = Box::new(trigger::IntervalTrigger::new(Duration::from_secs_f64(secs)));

    // Condition
    let cond = Box::new(condition::RegionCondition::new(
        Duration::from_millis(p.condition.stable_ms),
        p.condition.downscale,
    ));

    // Actions
    let mut acts: Vec<Box<dyn Action + Send + Sync>> = vec![];
    let capture: Arc<dyn ScreenCapture + Send + Sync> = Arc::from(make_capture());
    let llm_client = llm::create_llm_client().unwrap_or_else(|e| {
        eprintln!("Warning: Failed to create LLM client: {}", e);
        Arc::new(llm::MockLLMClient::new())
    });

    for a in &p.actions {
        match a {
            ActionConfig::Click { x, y, button } => {
                acts.push(Box::new(action::MoveCursor { x: *x, y: *y }));
                acts.push(Box::new(action::Click { button: *button }));
            }
            ActionConfig::Type { text } => {
                acts.push(Box::new(action::TypeText { text: text.clone() }))
            }
            ActionConfig::LLMPromptGeneration {
                region_ids,
                risk_threshold,
                system_prompt,
                variable_name,
            } => acts.push(Box::new(action::LLMPromptGenerationAction {
                region_ids: region_ids.clone(),
                risk_threshold: *risk_threshold,
                system_prompt: system_prompt.clone(),
                variable_name: variable_name
                    .clone()
                    .unwrap_or_else(|| "prompt".to_string()),
                all_regions: p.regions.clone(),
                capture: capture.clone(),
                llm_client: llm_client.clone(),
            })),
        }
    }
    let seq = ActionSequence::new(acts);

    // Guardrails
    let gr = p
        .guardrails
        .as_ref()
        .map(|g| Guardrails {
            cooldown: Duration::from_millis(g.cooldown_ms),
            max_runtime: g.max_runtime_ms.map(Duration::from_millis),
            max_activations_per_hour: g.max_activations_per_hour,
        })
        .unwrap_or_default();

    // Regions
    let regions = p.regions.clone();

    (monitor::Monitor::new(trig, cond, seq, gr), regions)
}

fn make_capture() -> Box<dyn ScreenCapture + Send + Sync> {
    if env::var("LOOPAUTOMA_BACKEND").ok().as_deref() == Some("fake") {
        return Box::new(FakeCapture);
    }
    #[cfg(feature = "os-linux-capture-xcap")]
    {
        return Box::new(crate::os::linux::LinuxCapture);
    }
    #[cfg(all(not(feature = "os-linux-capture-xcap"), feature = "os-macos"))]
    {
        return Box::new(crate::os::macos::MacCapture);
    }
    #[cfg(all(
        not(feature = "os-linux-capture-xcap"),
        not(feature = "os-macos"),
        feature = "os-windows"
    ))]
    {
        return Box::new(crate::os::windows::WinCapture);
    }
    #[cfg(all(
        not(feature = "os-linux-capture-xcap"),
        not(feature = "os-macos"),
        not(feature = "os-windows")
    ))]
    {
        Box::new(FakeCapture)
    }
}

fn make_automation() -> Box<dyn Automation + Send + Sync> {
    if env::var("LOOPAUTOMA_BACKEND").ok().as_deref() == Some("fake") {
        return Box::new(FakeAutomation);
    }
    #[cfg(feature = "os-linux-automation")]
    {
        return match crate::os::linux::LinuxAutomation::new() {
            Ok(auto) => Box::new(auto),
            Err(err) => {
                eprintln!("linux automation unavailable: {}", err);
                Box::new(FakeAutomation)
            }
        };
    }
    #[cfg(all(not(feature = "os-linux-automation"), feature = "os-macos"))]
    {
        return Box::new(crate::os::macos::MacAutomation);
    }
    #[cfg(all(
        not(feature = "os-linux-automation"),
        not(feature = "os-macos"),
        feature = "os-windows"
    ))]
    {
        return Box::new(crate::os::windows::WinAutomation);
    }
    #[cfg(all(
        not(feature = "os-linux-automation"),
        not(feature = "os-macos"),
        not(feature = "os-windows")
    ))]
    {
        Box::new(FakeAutomation)
    }
}

pub(crate) fn ensure_dev_injection_allowed(command: &str) -> Result<(), String> {
    if is_release_runtime() {
        return Err(format!(
            "{command} is disabled in production builds. Input synthesis helpers only run in debug/dev builds; see doc/security.md for details."
        ));
    }
    if env_truthy("LOOPAUTOMA_ALLOW_INJECT") {
        Ok(())
    } else {
        Err(
            "Input injection commands are disabled. Set LOOPAUTOMA_ALLOW_INJECT=1 while developing to enable dev-only input synthesis.".into(),
        )
    }
}

#[tauri::command]
fn profiles_load(state: tauri::State<AppState>) -> Result<ProfilesConfig, String> {
    Ok(state.profiles.lock().unwrap().clone())
}

#[tauri::command]
fn profiles_save(config: ProfilesConfig, state: tauri::State<AppState>) -> Result<(), String> {
    *state.profiles.lock().unwrap() = config.normalize();
    Ok(())
}

#[tauri::command]
fn monitor_start(
    profile_id: String,
    window: tauri::Window,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    // Stop any existing runner
    monitor_stop_impl(&state, StopReason::Graceful);

    let profiles_cfg = state.profiles.lock().unwrap().clone();
    let profile = profiles_cfg
        .profiles
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| "profile not found".to_string())?;
    let (mut mon, regions) = build_monitor_from_profile(&profile);
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_clone = cancel.clone();
    let panic_flag = Arc::new(AtomicBool::new(false));
    let panic_clone = panic_flag.clone();

    // backends: OS adapters by default; set LOOPAUTOMA_BACKEND=fake to force fakes
    let cap = make_capture();
    let auto = make_automation();
    let mut events = vec![];
    mon.start(&mut events);
    for e in events.drain(..) {
        let _ = window.emit("loopautoma://event", &e);
    }

    let handle = std::thread::spawn(move || {
        let win = window;
        // Small scheduler tick; Trigger decides whether to fire
        loop {
            if cancel_clone.load(Ordering::Relaxed) {
                let evs = finalize_monitor_shutdown(&mut mon, panic_clone.load(Ordering::Relaxed));
                for e in evs {
                    let _ = win.emit("loopautoma://event", &e);
                }
                break;
            }

            if mon.started_at.is_none() {
                break;
            }

            let now = Instant::now();
            let mut evs = vec![];
            mon.tick(now, &regions, &*cap, &*auto, &mut evs);
            for e in evs {
                let _ = win.emit("loopautoma://event", &e);
            }
            if mon.started_at.is_none() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });

    *state.runner.lock().unwrap() = Some(MonitorRunner {
        cancel,
        panic: panic_flag,
        handle,
    });
    Ok(())
}

fn monitor_stop_impl(state: &tauri::State<AppState>, reason: StopReason) {
    if let Some(r) = state.runner.lock().unwrap().take() {
        if matches!(reason, StopReason::Panic) {
            r.panic.store(true, Ordering::Relaxed);
        }
        r.cancel.store(true, Ordering::Relaxed);
        // Detach: the loop will exit shortly; no need to await in command
    }
}

#[tauri::command]
fn monitor_stop(state: tauri::State<AppState>) -> Result<(), String> {
    monitor_stop_impl(&state, StopReason::Graceful);
    Ok(())
}

#[tauri::command]
fn monitor_panic_stop(state: tauri::State<AppState>) -> Result<(), String> {
    monitor_stop_impl(&state, StopReason::Panic);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            profiles_load,
            profiles_save,
            monitor_start,
            monitor_stop,
            monitor_panic_stop,
            window_info,
            window_position,
            region_picker_show,
            region_picker_complete,
            region_picker_cancel,
            region_capture_thumbnail,
            action_recorder_show,
            action_recorder_close,
            app_quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn window_position(window: tauri::Window) -> Result<(i32, i32), String> {
    window
        .outer_position()
        .map(|p| (p.x as i32, p.y as i32))
        .map_err(|e| e.to_string())
}

// Window geometry helper providing outer position and scale factor (for HiDPI / multi-monitor)
#[tauri::command]
fn window_info(window: tauri::Window) -> Result<(i32, i32, f64), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    Ok((pos.x as i32, pos.y as i32, scale))
}

#[derive(Debug, Deserialize)]
pub(crate) struct PickPoint {
    pub(crate) x: i32,
    pub(crate) y: i32,
}

#[derive(Debug, Deserialize)]
struct RegionPickSubmission {
    start: PickPoint,
    end: PickPoint,
}

#[derive(Debug, Serialize)]
struct RegionPickPayload {
    rect: Rect,
    thumbnail_png_base64: Option<String>,
}

#[tauri::command]
fn region_picker_show(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("region-overlay") {
        let _ = win.set_focus();
        return Ok(());
    }
    
    // Hide main window first
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    
    // Give time for window to minimize and desktop to redraw
    std::thread::sleep(std::time::Duration::from_millis(200));
    
    // Capture full screen screenshot
    let screenshot_base64 = capture_full_screen().map_err(|e| e.to_string())?;
    
    // Build overlay window with screenshot URL
    let screenshot_url = format!("data:image/png;base64,{}", screenshot_base64);
    tauri::WebviewWindowBuilder::new(
        &app,
        "region-overlay",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Select region")
    .fullscreen(true)
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .initialization_script(&format!(
        r#"window.__REGION_OVERLAY_SCREENSHOT__ = "{}";"#,
        screenshot_url
    ))
    .build()
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn region_picker_complete(
    app: tauri::AppHandle,
    submission: RegionPickSubmission,
) -> Result<(), String> {
    let rect = normalize_rect(&submission.start, &submission.end)
        .ok_or_else(|| "Region must have a non-zero area".to_string())?;
    let preview = capture_thumbnail(&rect).map_err(|e| e.to_string())?;
    let payload = RegionPickPayload {
        rect,
        thumbnail_png_base64: preview,
    };
    app.emit("loopautoma://region_pick_complete", &payload)
        .map_err(|e| e.to_string())?;
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(overlay) = app.get_webview_window("region-overlay") {
        let _ = overlay.close();
    }
    Ok(())
}

#[tauri::command]
fn region_picker_cancel(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(overlay) = app.get_webview_window("region-overlay") {
        let _ = overlay.close();
    }
    Ok(())
}

#[tauri::command]
fn app_quit(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("region-overlay") {
        let _ = overlay.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.close();
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn region_capture_thumbnail(rect: Rect) -> Result<Option<String>, String> {
    capture_thumbnail(&rect).map_err(|e| e.to_string())
}

pub(crate) fn normalize_rect(start: &PickPoint, end: &PickPoint) -> Option<Rect> {
    let raw_min_x = start.x.min(end.x);
    let raw_min_y = start.y.min(end.y);
    let raw_max_x = start.x.max(end.x);
    let raw_max_y = start.y.max(end.y);

    let clamped_min_x = raw_min_x.max(0);
    let clamped_min_y = raw_min_y.max(0);
    let clamped_max_x = raw_max_x.max(clamped_min_x);
    let clamped_max_y = raw_max_y.max(clamped_min_y);

    let width = (clamped_max_x - clamped_min_x) as u32;
    let height = (clamped_max_y - clamped_min_y) as u32;
    if width == 0 || height == 0 {
        return None;
    }
    Some(Rect {
        x: clamped_min_x as u32,
        y: clamped_min_y as u32,
        width,
        height,
    })
}

fn capture_full_screen() -> Result<String, BackendError> {
    let capture = make_capture();
    
    // Get primary display info
    let displays = capture.displays()?;
    let primary = displays.iter()
        .find(|d| d.is_primary)
        .or_else(|| displays.first())
        .ok_or_else(|| BackendError::new("capture", "No displays found"))?;
    
    // Create a region covering the entire primary display
    let rect = Rect {
        x: primary.x.max(0) as u32,
        y: primary.y.max(0) as u32,
        width: primary.width,
        height: primary.height,
    };
    
    let region = Region {
        id: "fullscreen".into(),
        rect,
        name: None,
    };
    
    let frame = capture.capture_region(&region)?;
    
    // Encode as full-size PNG (no thumbnail downscaling)
    if frame.width == 0 || frame.height == 0 || frame.bytes.is_empty() {
        return Err(BackendError::new("capture", "Empty screenshot"));
    }
    
    let image = RgbaImage::from_vec(frame.width, frame.height, frame.bytes.clone())
        .ok_or_else(|| BackendError::new("capture", "Failed to create image"))?;
    
    let dynamic = DynamicImage::ImageRgba8(image);
    let mut buffer = Vec::new();
    dynamic
        .write_to(&mut Cursor::new(&mut buffer), ImageOutputFormat::Png)
        .map_err(|e| BackendError::new("capture", format!("PNG encoding failed: {}", e)))?;
    
    Ok(Base64Standard.encode(buffer))
}

fn capture_thumbnail(rect: &Rect) -> Result<Option<String>, BackendError> {
    if rect.width == 0 || rect.height == 0 {
        return Ok(None);
    }
    let capture = make_capture();
    let region = Region {
        id: "region-thumbnail".into(),
        rect: *rect,
        name: None,
    };
    match capture.capture_region(&region) {
        Ok(frame) => Ok(encode_png_thumbnail(&frame)),
        Err(err) => {
            eprintln!("thumbnail capture failed: {err}");
            Ok(None)
        }
    }
}

fn encode_png_thumbnail(frame: &ScreenFrame) -> Option<String> {
    if frame.width == 0 || frame.height == 0 || frame.bytes.is_empty() {
        return None;
    }
    let image = match RgbaImage::from_vec(frame.width, frame.height, frame.bytes.clone()) {
        Some(img) => img,
        None => return None,
    };
    let mut dynamic = DynamicImage::ImageRgba8(image);
    const MAX_EDGE: u32 = 240;
    if frame.width > MAX_EDGE || frame.height > MAX_EDGE {
        let width_f = frame.width as f32;
        let height_f = frame.height as f32;
        let scale = (MAX_EDGE as f32 / width_f)
            .min(MAX_EDGE as f32 / height_f)
            .min(1.0);
        let new_w = (width_f * scale).round().max(1.0) as u32;
        let new_h = (height_f * scale).round().max(1.0) as u32;
        dynamic = dynamic.resize_exact(new_w.max(1), new_h.max(1), FilterType::Triangle);
    }
    let mut buffer = Vec::new();
    if dynamic
        .write_to(&mut Cursor::new(&mut buffer), ImageOutputFormat::Png)
        .is_err()
    {
        return None;
    }
    Some(Base64Standard.encode(buffer))
}

#[tauri::command]
fn action_recorder_show(app: tauri::AppHandle) -> Result<String, String> {
    // Check if Action Recorder window already exists
    if let Some(win) = app.get_webview_window("action-recorder") {
        let _ = win.set_focus();
        // Return existing screenshot or capture new one
        return capture_full_screen().map_err(|e| e.to_string());
    }
    
    // Hide main window first
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    
    // Give time for window to minimize and desktop to redraw
    std::thread::sleep(std::time::Duration::from_millis(200));
    
    // Capture full screen screenshot
    let screenshot_base64 = capture_full_screen().map_err(|e| e.to_string())?;
    
    Ok(screenshot_base64)
}

#[tauri::command]
fn action_recorder_close(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(recorder) = app.get_webview_window("action-recorder") {
        let _ = recorder.close();
    }
    Ok(())
}

#[cfg(test)]
mod dev_guard_tests {
    use super::*;
    use std::env;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    fn clear_env() {
        env::remove_var("LOOPAUTOMA_ALLOW_INJECT");
        env::remove_var("LOOPAUTOMA_TREAT_AS_RELEASE");
    }

    #[test]
    fn rejects_without_flag() {
        let _guard = env_lock();
        clear_env();
        assert!(ensure_dev_injection_allowed("test").is_err());
    }

    #[test]
    fn rejects_release_mode_even_with_flag() {
        let _guard = env_lock();
        clear_env();
        env::set_var("LOOPAUTOMA_ALLOW_INJECT", "1");
        env::set_var("LOOPAUTOMA_TREAT_AS_RELEASE", "1");
        let err = ensure_dev_injection_allowed("test").unwrap_err();
        assert!(err.contains("production"));
        clear_env();
    }

    #[test]
    fn allows_with_flag_in_debug() {
        let _guard = env_lock();
        clear_env();
        env::set_var("LOOPAUTOMA_ALLOW_INJECT", "1");
        ensure_dev_injection_allowed("test").expect("flag should allow dev helper");
        clear_env();
    }
}
