// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod action;
mod condition;
mod domain;
mod monitor;
#[cfg(any(
    feature = "os-linux-capture-xcap",
    feature = "os-linux-input",
    feature = "os-macos",
    feature = "os-windows"
))]
mod os;
mod soak;
#[cfg(test)]
mod tests;
mod trigger;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use domain::*;
use tauri::Emitter; // for Window.emit
mod fakes;
#[cfg(feature = "os-linux-input")]
use crate::os::linux::LinuxInputCapture;
use fakes::{FakeAutomation, FakeCapture};
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

struct StreamHandle {
    cancel: Arc<AtomicBool>,
    handle: std::thread::JoinHandle<()>,
}

struct FrameThrottle {
    base_delay: Duration,
    max_delay: Duration,
    next_due: Instant,
    consecutive_failures: u32,
}

impl FrameThrottle {
    fn new(fps: u32) -> Self {
        let base_delay = Duration::from_millis(1000 / fps.max(1) as u64);
        Self {
            base_delay,
            max_delay: Duration::from_millis(1_500),
            next_due: Instant::now(),
            consecutive_failures: 0,
        }
    }

    fn wait(&mut self) {
        let now = Instant::now();
        if now < self.next_due {
            std::thread::sleep(self.next_due - now);
        }
    }

    fn record_success(&mut self) {
        self.consecutive_failures = 0;
        self.next_due = Instant::now() + self.base_delay;
    }

    fn record_failure(&mut self) {
        self.consecutive_failures = (self.consecutive_failures + 1).min(10);
        let backoff =
            self.base_delay + Duration::from_millis((self.consecutive_failures as u64) * 200);
        self.next_due = Instant::now() + backoff.min(self.max_delay);
    }

    #[cfg(test)]
    fn failure_count(&self) -> u32 {
        self.consecutive_failures
    }

    #[cfg(test)]
    fn due_in(&self) -> Duration {
        self.next_due.saturating_duration_since(Instant::now())
    }
}

const DUPLICATE_WINDOW: Duration = Duration::from_millis(400);

fn sample_checksum(bytes: &[u8]) -> u64 {
    if bytes.is_empty() {
        return 0;
    }
    let mut acc = 0u64;
    let step = (bytes.len() / 1024).max(1);
    let mut count = 0usize;
    let limit = bytes.len().min(8_192);
    let mut idx = 0usize;
    while idx < limit {
        acc = acc.wrapping_add(bytes[idx] as u64);
        count += 1;
        if count >= 1024 {
            break;
        }
        idx += step;
    }
    acc
}

#[derive(Default)]
struct AuthoringState {
    screen_stream: Mutex<Option<StreamHandle>>,
    input_capture: Mutex<Option<Box<dyn InputCapture + Send>>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Default)]
struct AppState {
    profiles: Mutex<Vec<Profile>>,        // in-memory MVP
    runner: Mutex<Option<MonitorRunner>>, // current monitor runner
    authoring: AuthoringState,
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
    let interval = Duration::from_millis(p.trigger.interval_ms);
    let trig = Box::new(trigger::IntervalTrigger::new(interval));

    // Condition
    let cond = Box::new(condition::RegionCondition::new(
        Duration::from_millis(p.condition.stable_ms),
        p.condition.downscale,
    ));

    // Actions
    let mut acts: Vec<Box<dyn Action + Send + Sync>> = vec![];
    for a in &p.actions {
        match a {
            ActionConfig::MoveCursor { x, y } => {
                acts.push(Box::new(action::MoveCursor { x: *x, y: *y }))
            }
            ActionConfig::Click { button } => {
                acts.push(Box::new(action::Click { button: *button }))
            }
            ActionConfig::Type { text } => {
                acts.push(Box::new(action::TypeText { text: text.clone() }))
            }
            ActionConfig::Key { key } => acts.push(Box::new(action::Key { key: key.clone() })),
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
    #[cfg(feature = "os-linux-input")]
    {
        return match crate::os::linux::LinuxAutomation::new() {
            Ok(auto) => Box::new(auto),
            Err(err) => {
                eprintln!("linux automation unavailable: {}", err);
                Box::new(FakeAutomation)
            }
        };
    }
    #[cfg(all(not(feature = "os-linux-input"), feature = "os-macos"))]
    {
        return Box::new(crate::os::macos::MacAutomation);
    }
    #[cfg(all(
        not(feature = "os-linux-input"),
        not(feature = "os-macos"),
        feature = "os-windows"
    ))]
    {
        return Box::new(crate::os::windows::WinAutomation);
    }
    #[cfg(all(
        not(feature = "os-linux-input"),
        not(feature = "os-macos"),
        not(feature = "os-windows")
    ))]
    {
        Box::new(FakeAutomation)
    }
}

fn make_input_capture() -> Option<Box<dyn InputCapture + Send>> {
    #[cfg(feature = "os-linux-input")]
    {
        return Some(Box::new(LinuxInputCapture::default()));
    }
    #[cfg(all(not(feature = "os-linux-input"), feature = "os-macos"))]
    {
        // macOS backend placeholder
        return None;
    }
    #[cfg(all(
        not(feature = "os-linux-input"),
        not(feature = "os-macos"),
        feature = "os-windows"
    ))]
    {
        return None;
    }
    #[cfg(all(
        not(feature = "os-linux-input"),
        not(feature = "os-macos"),
        not(feature = "os-windows")
    ))]
    {
        None
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
fn profiles_load(state: tauri::State<AppState>) -> Result<Vec<Profile>, String> {
    Ok(state.profiles.lock().unwrap().clone())
}

#[tauri::command]
fn profiles_save(profiles: Vec<Profile>, state: tauri::State<AppState>) -> Result<(), String> {
    *state.profiles.lock().unwrap() = profiles;
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

    let profiles = state.profiles.lock().unwrap().clone();
    let profile = profiles
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

#[tauri::command]
fn start_screen_stream(
    window: tauri::Window,
    state: tauri::State<AppState>,
    fps: Option<u32>,
) -> Result<(), String> {
    let mut guard = state.authoring.screen_stream.lock().unwrap();
    if guard.is_some() {
        return Ok(());
    }
    let capture = make_capture();
    let running = Arc::new(AtomicBool::new(true));
    let runner = running.clone();
    let win = window.clone();
    let target_fps = fps.unwrap_or(3).clamp(1, 15);
    let handle = std::thread::spawn(move || {
        let mut throttle = FrameThrottle::new(target_fps);
        let mut last_checksum: Option<u64> = None;
        let mut last_emit_at = Instant::now() - Duration::from_secs(1);
        while runner.load(Ordering::Relaxed) {
            throttle.wait();
            if !runner.load(Ordering::Relaxed) {
                break;
            }

            let displays = match capture.displays() {
                Ok(list) => list,
                Err(err) => {
                    eprintln!("screen_stream displays error: {err}");
                    throttle.record_failure();
                    continue;
                }
            };
            let Some(display) = displays.first() else {
                throttle.record_failure();
                continue;
            };
            if display.width == 0 || display.height == 0 {
                throttle.record_failure();
                continue;
            }

            let region = Region {
                id: format!("display-{}", display.id),
                rect: Rect {
                    x: display.x.max(0) as u32,
                    y: display.y.max(0) as u32,
                    width: display.width,
                    height: display.height,
                },
                name: display.name.clone(),
            };

            match capture.capture_region(&region) {
                Ok(frame) => {
                    let checksum = sample_checksum(&frame.bytes);
                    let now = Instant::now();
                    if let Some(prev) = last_checksum {
                        if prev == checksum && now.duration_since(last_emit_at) < DUPLICATE_WINDOW {
                            throttle.record_success();
                            continue;
                        }
                    }
                    match win.emit("loopautoma://screen_frame", &frame) {
                        Ok(_) => {
                            last_checksum = Some(checksum);
                            last_emit_at = now;
                            throttle.record_success();
                        }
                        Err(err) => {
                            eprintln!("screen_stream emit error: {err}");
                            throttle.record_failure();
                        }
                    }
                }
                Err(err) => {
                    eprintln!("screen_stream capture error: {err}");
                    throttle.record_failure();
                }
            }
        }
    });
    *guard = Some(StreamHandle {
        cancel: running,
        handle,
    });
    Ok(())
}

#[tauri::command]
fn stop_screen_stream(state: tauri::State<AppState>) -> Result<(), String> {
    let mut guard = state.authoring.screen_stream.lock().unwrap();
    if let Some(handle) = guard.take() {
        handle.cancel.store(false, Ordering::Relaxed);
        let _ = handle.handle.join();
    }
    Ok(())
}

#[tauri::command]
fn start_input_recording(
    window: tauri::Window,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    if env::var("LOOPAUTOMA_BACKEND").ok().as_deref() == Some("fake") {
        return Err("Input capture is disabled because LOOPAUTOMA_BACKEND=fake. Remove that override to use the OS-level recorder.".into());
    }
    #[cfg(not(feature = "os-linux-input"))]
    {
        return Err("This build was compiled without the os-linux-input backend. Rebuild with --features os-linux-input (see doc/developer.md) or keep LOOPAUTOMA_BACKEND=fake for UI-only authoring.".into());
    }
    let mut guard = state.authoring.input_capture.lock().unwrap();
    if guard.is_some() {
        return Ok(());
    }
    let mut capture = make_input_capture().ok_or_else(|| {
        "Input capture backend is missing. On Ubuntu 24.04 install the X11 dev packages listed in doc/developer.md (libx11-dev, libxext-dev, libxi-dev, libxtst-dev, libxkbcommon-x11-dev, etc.) and rebuild.".to_string()
    })?;
    let win = window.clone();
    let callback = Arc::new(move |event: InputEvent| {
        let _ = win.emit("loopautoma://input_event", &event);
    });
    capture.start(callback).map_err(|e| format!("{e}. Make sure the X11/XKB libraries are installed (see doc/developer.md) and that the app is running in an X11 session."))?;
    *guard = Some(capture);
    Ok(())
}

#[tauri::command]
fn stop_input_recording(state: tauri::State<AppState>) -> Result<(), String> {
    let mut guard = state.authoring.input_capture.lock().unwrap();
    if let Some(mut capture) = guard.take() {
        capture.stop().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn inject_mouse_event(event: MouseEvent) -> Result<(), String> {
    ensure_dev_injection_allowed("inject_mouse_event")?;
    let automation = make_automation();
    match event.event_type {
        MouseEventType::Move => automation.move_cursor(event.x as u32, event.y as u32)?,
        MouseEventType::ButtonDown(button) => automation.mouse_down(button)?,
        MouseEventType::ButtonUp(button) => automation.mouse_up(button)?,
    }
    Ok(())
}

#[tauri::command]
fn inject_keyboard_event(event: KeyboardEvent) -> Result<(), String> {
    ensure_dev_injection_allowed("inject_keyboard_event")?;
    let automation = make_automation();
    match event.state {
        KeyState::Down => automation.key_down(&event.key)?,
        KeyState::Up => automation.key_up(&event.key)?,
    }
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
            start_screen_stream,
            stop_screen_stream,
            start_input_recording,
            stop_input_recording,
            inject_mouse_event,
            inject_keyboard_event,
            window_info,
            window_position,
            region_pick
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

// Placeholder for a graphical region picker; will be implemented with a transparent overlay window.
#[tauri::command]
fn region_pick() -> Result<(i32, i32, u32, u32), String> {
    Err("region_pick not yet implemented".into())
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
