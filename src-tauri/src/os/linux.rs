use crate::domain::{BackendError, DisplayInfo, Region, ScreenCapture, ScreenFrame};
#[cfg(feature = "os-linux-input")]
use crate::domain::{Automation, MouseButton};
#[cfg(feature = "os-linux-input")]
use crate::domain::{InputCapture, InputEvent, InputEventCallback, KeyboardEvent, KeyState, Modifiers, MouseEvent, MouseEventType};

#[cfg(feature = "os-linux-capture-xcap")]
use ahash::AHasher;
#[cfg(feature = "os-linux-capture-xcap")]
use std::hash::{Hash, Hasher};
#[cfg(feature = "os-linux-capture-xcap")]
use xcap::Monitor;
#[cfg(feature = "os-linux-input")]
use enigo::{Enigo, MouseButton as EnigoMouseButton, Key as EnigoKey, MouseControllable, KeyboardControllable};
#[cfg(feature = "os-linux-input")]
use device_query::{DeviceQuery, DeviceState, Keycode, MouseButton as DeviceMouseButton};
#[cfg(feature = "os-linux-input")]
use std::collections::HashSet;
#[cfg(feature = "os-linux-input")]
use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
#[cfg(feature = "os-linux-input")]
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub struct LinuxCapture;
impl ScreenCapture for LinuxCapture {
    fn hash_region(&self, region: &Region, downscale: u32) -> u64 {
        #[cfg(feature = "os-linux-capture-xcap")]
        {
            if let Ok(monitors) = Monitor::all() {
                if let Some(mon) = find_monitor(&monitors, region) {
                    let x = region.rect.x;
                    let y = region.rect.y;
                    let w = region.rect.width;
                    let h = region.rect.height;
                    if w == 0 || h == 0 {
                        return 0;
                    }
                    if let Ok(img) = mon.capture_region(x, y, w, h) {
                        let buf = img.as_raw();
                        let mut hasher = AHasher::default();
                        (w, h, downscale).hash(&mut hasher);
                        let step = (downscale.max(1) as usize) * 4;
                        let mut i = 0usize;
                        while i + 4 <= buf.len() {
                            hasher.write(&buf[i..i + 4]);
                            i += step;
                        }
                        return hasher.finish();
                    }
                }
            }
            0
        }
        #[cfg(not(feature = "os-linux-capture-xcap"))]
        {
            let _ = region;
            let _ = downscale;
            0
        }
    }

    fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError> {
        let ts = now_ms();
        #[cfg(feature = "os-linux-capture-xcap")]
        {
            if let Ok(monitors) = Monitor::all() {
                if let Some(mon) = find_monitor(&monitors, region) {
                    let w = region.rect.width;
                    let h = region.rect.height;
                    if w == 0 || h == 0 {
                        return Err(BackendError::new("invalid_region", "region has zero area"));
                    }
                    let img = mon
                        .capture_region(region.rect.x, region.rect.y, w, h)
                        .map_err(|e| BackendError::new("capture_failed", e.to_string()))?;
                    let bytes = img.into_raw();
                    return Ok(ScreenFrame {
                        display: to_display_info_monitor(mon),
                        width: w,
                        height: h,
                        stride: w * 4,
                        bytes,
                        timestamp_ms: ts,
                    });
                }
            }
            Err(BackendError::new("capture_failed", "no monitor available"))
        }
        #[cfg(not(feature = "os-linux-capture-xcap"))]
        {
            let _ = region;
            Err(BackendError::new("capture_disabled", "linux capture feature disabled"))
        }
    }

    fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
        #[cfg(feature = "os-linux-capture-xcap")]
        {
            let monitors = Monitor::all().map_err(|e| BackendError::new("displays_failed", e.to_string()))?;
            Ok(monitors.iter().map(to_display_info_monitor).collect())
        }
        #[cfg(not(feature = "os-linux-capture-xcap"))]
        {
            Err(BackendError::new("capture_disabled", "linux capture feature disabled"))
        }
    }
}

#[cfg(feature = "os-linux-input")]
pub struct LinuxAutomation;
#[cfg(feature = "os-linux-input")]
impl Automation for LinuxAutomation {
    fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> {
        let mut enigo = Enigo::new();
        enigo.mouse_move_to(_x as i32, _y as i32);
        Ok(())
    }
    fn click(&self, _button: MouseButton) -> Result<(), String> {
        let mut enigo = Enigo::new();
        let btn = match _button { MouseButton::Left => EnigoMouseButton::Left, MouseButton::Right => EnigoMouseButton::Right, MouseButton::Middle => EnigoMouseButton::Middle };
        enigo.mouse_click(btn);
        Ok(())
    }
    fn type_text(&self, _text: &str) -> Result<(), String> {
        let mut enigo = Enigo::new();
        enigo.key_sequence(_text);
        Ok(())
    }
    fn key(&self, _key: &str) -> Result<(), String> {
        let mut enigo = Enigo::new();
        match _key {
            "Enter" | "enter" => { enigo.key_click(EnigoKey::Return); Ok(()) }
            k if k.len() == 1 => { enigo.key_sequence(k); Ok(()) }
            _ => Ok(())
        }
    }

    fn mouse_down(&self, button: MouseButton) -> Result<(), String> {
        let mut enigo = Enigo::new();
        let btn = match button {
            MouseButton::Left => EnigoMouseButton::Left,
            MouseButton::Right => EnigoMouseButton::Right,
            MouseButton::Middle => EnigoMouseButton::Middle,
        };
        enigo.mouse_down(btn);
        Ok(())
    }

    fn mouse_up(&self, button: MouseButton) -> Result<(), String> {
        let mut enigo = Enigo::new();
        let btn = match button {
            MouseButton::Left => EnigoMouseButton::Left,
            MouseButton::Right => EnigoMouseButton::Right,
            MouseButton::Middle => EnigoMouseButton::Middle,
        };
        enigo.mouse_up(btn);
        Ok(())
    }

    fn key_down(&self, key: &str) -> Result<(), String> {
        let mut enigo = Enigo::new();
        match key {
            "Enter" | "enter" => enigo.key_down(EnigoKey::Return),
            k if k.len() == 1 => {
                if let Some(ch) = k.chars().next() {
                    enigo.key_down(EnigoKey::Layout(ch));
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn key_up(&self, key: &str) -> Result<(), String> {
        let mut enigo = Enigo::new();
        match key {
            "Enter" | "enter" => enigo.key_up(EnigoKey::Return),
            k if k.len() == 1 => {
                if let Some(ch) = k.chars().next() {
                    enigo.key_up(EnigoKey::Layout(ch));
                }
            }
            _ => {}
        }
        Ok(())
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::from_secs(0)).as_millis() as u64
}

#[cfg(feature = "os-linux-capture-xcap")]
fn to_display_info_monitor(mon: &Monitor) -> DisplayInfo {
    DisplayInfo {
        id: mon.id().unwrap_or(0),
        name: mon.name().ok(),
        x: mon.x().unwrap_or(0),
        y: mon.y().unwrap_or(0),
        width: mon.width().unwrap_or(0),
        height: mon.height().unwrap_or(0),
        scale_factor: mon.scale_factor().unwrap_or(1.0),
        is_primary: mon.is_primary().unwrap_or(false),
    }
}

#[cfg(feature = "os-linux-capture-xcap")]
fn find_monitor<'a>(monitors: &'a [Monitor], region: &Region) -> Option<&'a Monitor> {
    let rx = region.rect.x as i32;
    let ry = region.rect.y as i32;
    let rw = region.rect.width as i32;
    let rh = region.rect.height as i32;
    monitors
        .iter()
        .find(|mon| {
            let mx = mon.x().unwrap_or(0);
            let my = mon.y().unwrap_or(0);
            let mw = mon.width().unwrap_or(0) as i32;
            let mh = mon.height().unwrap_or(0) as i32;
            rx >= mx
                && ry >= my
                && rx + rw <= mx + mw
                && ry + rh <= my + mh
        })
        .or_else(|| monitors.first())
}

#[cfg(feature = "os-linux-input")]
pub struct LinuxInputCapture {
    running: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

#[cfg(feature = "os-linux-input")]
impl Default for LinuxInputCapture {
    fn default() -> Self { Self { running: Arc::new(AtomicBool::new(false)), handle: None } }
}

#[cfg(feature = "os-linux-input")]
impl InputCapture for LinuxInputCapture {
    fn start(&mut self, callback: InputEventCallback) -> Result<(), BackendError> {
        if self.running.load(Ordering::SeqCst) { return Ok(()); }
        let running = self.running.clone();
        running.store(true, Ordering::SeqCst);
        let cb = callback.clone();
        let handle = thread::spawn(move || {
            let device = DeviceState::new();
            let mut last_coords = device.get_mouse().coords;
            let mut last_buttons: HashSet<DeviceMouseButton> = device.get_mouse().button_pressed.iter().copied().collect();
            let mut last_keys: HashSet<Keycode> = device.get_keys().into_iter().collect();
            while running.load(Ordering::SeqCst) {
                let mouse = device.get_mouse();
                if mouse.coords != last_coords {
                    cb(InputEvent::Mouse(MouseEvent {
                        event_type: MouseEventType::Move,
                        x: mouse.coords.0 as f64,
                        y: mouse.coords.1 as f64,
                        modifiers: modifiers_from_keys(&last_keys),
                        timestamp_ms: now_ms(),
                    }));
                    last_coords = mouse.coords;
                }

                let buttons: HashSet<DeviceMouseButton> = mouse.button_pressed.iter().copied().collect();
                for btn in buttons.difference(&last_buttons) {
                    if let Some(mapped) = map_mouse_button(*btn) {
                        cb(InputEvent::Mouse(MouseEvent {
                            event_type: MouseEventType::ButtonDown(mapped),
                            x: mouse.coords.0 as f64,
                            y: mouse.coords.1 as f64,
                            modifiers: modifiers_from_keys(&last_keys),
                            timestamp_ms: now_ms(),
                        }));
                    }
                }
                for btn in last_buttons.difference(&buttons) {
                    if let Some(mapped) = map_mouse_button(*btn) {
                        cb(InputEvent::Mouse(MouseEvent {
                            event_type: MouseEventType::ButtonUp(mapped),
                            x: mouse.coords.0 as f64,
                            y: mouse.coords.1 as f64,
                            modifiers: modifiers_from_keys(&last_keys),
                            timestamp_ms: now_ms(),
                        }));
                    }
                }
                last_buttons = buttons;

                let keys: HashSet<Keycode> = device.get_keys().into_iter().collect();
                for key in keys.difference(&last_keys) {
                    let kc = *key;
                    cb(InputEvent::Keyboard(KeyboardEvent {
                        state: KeyState::Down,
                        key: format!("{:?}", kc),
                        code: kc as u32,
                        text: None,
                        modifiers: modifiers_from_keys(&keys),
                        timestamp_ms: now_ms(),
                    }));
                }
                for key in last_keys.difference(&keys) {
                    let kc = *key;
                    cb(InputEvent::Keyboard(KeyboardEvent {
                        state: KeyState::Up,
                        key: format!("{:?}", kc),
                        code: kc as u32,
                        text: None,
                        modifiers: modifiers_from_keys(&keys),
                        timestamp_ms: now_ms(),
                    }));
                }
                last_keys = keys;

                thread::sleep(Duration::from_millis(8));
            }
        });
        self.handle = Some(handle);
        Ok(())
    }

    fn stop(&mut self) -> Result<(), BackendError> {
        if !self.running.load(Ordering::SeqCst) { return Ok(()); }
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        Ok(())
    }

    fn is_running(&self) -> bool { self.running.load(Ordering::SeqCst) }
}

#[cfg(feature = "os-linux-input")]
fn map_mouse_button(btn: DeviceMouseButton) -> Option<MouseButton> {
    match btn {
        DeviceMouseButton::Left => Some(MouseButton::Left),
        DeviceMouseButton::Right => Some(MouseButton::Right),
        DeviceMouseButton::Middle => Some(MouseButton::Middle),
        _ => None,
    }
}

#[cfg(feature = "os-linux-input")]
fn modifiers_from_keys(keys: &HashSet<Keycode>) -> Modifiers {
    Modifiers {
        shift: keys.contains(&Keycode::LShift) || keys.contains(&Keycode::RShift),
        control: keys.contains(&Keycode::LControl) || keys.contains(&Keycode::RControl),
        alt: keys.contains(&Keycode::LAlt) || keys.contains(&Keycode::RAlt),
        meta: keys.contains(&Keycode::Meta),
    }
}

#[cfg(feature = "os-linux-input")]
impl Drop for LinuxInputCapture {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

// no crop/resize helpers needed for the sampling hash path
