// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod domain;
mod trigger;
mod condition;
mod action;
mod monitor;
#[cfg(test)]
mod tests;
#[cfg(any(feature = "os-linux-capture", feature = "os-linux-input", feature = "os-macos", feature = "os-windows"))]
mod os;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use domain::*;
use tauri::Emitter; // for Window.emit
mod fakes;
use fakes::{FakeAutomation, FakeCapture};
use std::env;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Default)]
struct AppState {
    profiles: Mutex<Vec<Profile>>, // in-memory MVP
    runner: Mutex<Option<MonitorRunner>>, // current monitor runner
}

struct MonitorRunner {
    cancel: Arc<std::sync::atomic::AtomicBool>,
    #[allow(dead_code)]
    handle: std::thread::JoinHandle<()>,
}

pub(crate) fn build_monitor_from_profile<'a>(p: &Profile) -> (monitor::Monitor<'a>, Vec<Region>) {
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
            ActionConfig::MoveCursor { x, y } => acts.push(Box::new(action::MoveCursor { x: *x, y: *y })),
            ActionConfig::Click { button } => acts.push(Box::new(action::Click { button: *button })),
            ActionConfig::Type { text } => acts.push(Box::new(action::TypeText { text: text.clone() })),
            ActionConfig::Key { key } => acts.push(Box::new(action::Key { key: key.clone() })),
        }
    }
    let seq = ActionSequence::new(acts);

    // Guardrails
    let gr = p.guardrails.as_ref().map(|g| Guardrails {
        cooldown: Duration::from_millis(g.cooldown_ms),
        max_runtime: g.max_runtime_ms.map(Duration::from_millis),
        max_activations_per_hour: g.max_activations_per_hour,
    }).unwrap_or_default();

    // Regions
    let regions = p.regions.clone();

    (monitor::Monitor::new(trig, cond, seq, gr), regions)
}

fn select_backends() -> (
    Box<dyn ScreenCapture + Send + Sync>,
    Box<dyn Automation + Send + Sync>,
) {
    if env::var("LOOPAUTOMA_BACKEND").ok().as_deref() == Some("fake") {
        return (Box::new(FakeCapture), Box::new(FakeAutomation));
    }
    #[cfg(feature = "os-linux-capture")]
    {
        #[cfg(feature = "os-linux-input")]
        { (Box::new(crate::os::linux::LinuxCapture), Box::new(crate::os::linux::LinuxAutomation)) }
        #[cfg(not(feature = "os-linux-input"))]
        { (Box::new(crate::os::linux::LinuxCapture), Box::new(FakeAutomation)) }
    }
    #[cfg(all(not(feature = "os-linux-capture"), feature = "os-macos"))]
    {
        (Box::new(crate::os::macos::MacCapture), Box::new(crate::os::macos::MacAutomation))
    }
    #[cfg(all(not(feature = "os-linux-capture"), not(feature = "os-macos"), feature = "os-windows"))]
    {
        (Box::new(crate::os::windows::WinCapture), Box::new(crate::os::windows::WinAutomation))
    }
    #[cfg(all(not(feature = "os-linux-capture"), not(feature = "os-macos"), not(feature = "os-windows")))]
    {
        (Box::new(FakeCapture), Box::new(FakeAutomation))
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
fn monitor_start(profile_id: String, window: tauri::Window, state: tauri::State<AppState>) -> Result<(), String> {
    // Stop any existing runner
    monitor_stop_impl(&state);

    let profiles = state.profiles.lock().unwrap().clone();
    let profile = profiles.into_iter().find(|p| p.id == profile_id).ok_or_else(|| "profile not found".to_string())?;
    let (mut mon, regions) = build_monitor_from_profile(&profile);
    let cancel = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let cancel_clone = cancel.clone();

    // backends: OS adapters by default; set LOOPAUTOMA_BACKEND=fake to force fakes
    let (cap, auto) = select_backends();
    let mut events = vec![];
    mon.start(&mut events);
    for e in events.drain(..) { let _ = window.emit("loopautoma://event", &e); }

    let handle = std::thread::spawn(move || {
        let win = window;
        // Small scheduler tick; Trigger decides whether to fire
        loop {
            if cancel_clone.load(std::sync::atomic::Ordering::Relaxed) { break; }
            let now = Instant::now();
            let mut evs = vec![];
            mon.tick(now, &regions, &*cap, &*auto, &mut evs);
            for e in evs { let _ = win.emit("loopautoma://event", &e); }
            std::thread::sleep(Duration::from_millis(100));
        }
    });

    *state.runner.lock().unwrap() = Some(MonitorRunner { cancel, handle });
    Ok(())
}

fn monitor_stop_impl(state: &tauri::State<AppState>) {
    if let Some(r) = state.runner.lock().unwrap().take() {
        r.cancel.store(true, std::sync::atomic::Ordering::Relaxed);
        // Detach: the loop will exit shortly; no need to await in command
    }
}

#[tauri::command]
fn monitor_stop(state: tauri::State<AppState>) -> Result<(), String> {
    monitor_stop_impl(&state);
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
            window_position,
            region_pick
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn window_position(window: tauri::Window) -> Result<(i32, i32), String> {
    window.outer_position()
        .map(|p| (p.x as i32, p.y as i32))
        .map_err(|e| e.to_string())
}

// Placeholder for a graphical region picker; will be implemented with a transparent overlay window.
#[tauri::command]
fn region_pick() -> Result<(i32, i32, u32, u32), String> {
    Err("region_pick not yet implemented".into())
}
