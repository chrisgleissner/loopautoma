#[cfg(feature = "os-linux-input")]
use crate::domain::{Automation, MouseButton};
use crate::domain::{BackendError, DisplayInfo, Region, ScreenCapture, ScreenFrame};
#[cfg(feature = "os-linux-input")]
use crate::domain::{
    InputCapture, InputEvent, InputEventCallback, KeyState, KeyboardEvent, Modifiers, MouseEvent,
    MouseEventType, ScrollEvent,
};

#[cfg(feature = "os-linux-capture-xcap")]
use ahash::AHasher;
#[cfg(feature = "os-linux-input")]
use std::collections::HashMap;
#[cfg(feature = "os-linux-capture-xcap")]
use std::hash::{Hash, Hasher};
#[cfg(feature = "os-linux-input")]
use std::sync::mpsc::{sync_channel, SyncSender};
#[cfg(feature = "os-linux-input")]
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
#[cfg(feature = "os-linux-input")]
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(feature = "os-linux-input")]
use x11rb::{
    connection::Connection,
    protocol::{
        xinput::ConnectionExt as XInputExt,
        xproto::{self},
        xtest::ConnectionExt as XTestExt,
    },
    xcb_ffi::XCBConnection,
    CURRENT_TIME,
};
#[cfg(feature = "os-linux-capture-xcap")]
use xcap::Monitor;
#[cfg(feature = "os-linux-input")]
use xkbcommon::xkb::{self, Context, Keycode, Keysym, ModMask};

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
            Err(BackendError::new(
                "capture_disabled",
                "linux capture feature disabled",
            ))
        }
    }

    fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
        #[cfg(feature = "os-linux-capture-xcap")]
        {
            let monitors =
                Monitor::all().map_err(|e| BackendError::new("displays_failed", e.to_string()))?;
            Ok(monitors.iter().map(to_display_info_monitor).collect())
        }
        #[cfg(not(feature = "os-linux-capture-xcap"))]
        {
            Err(BackendError::new(
                "capture_disabled",
                "linux capture feature disabled",
            ))
        }
    }
}

#[cfg(feature = "os-linux-input")]
pub struct LinuxAutomation {
    conn: Arc<Mutex<XCBConnection>>,
    root: xproto::Window,
    keyboard: KeyboardLookup,
}

#[cfg(feature = "os-linux-input")]
impl LinuxAutomation {
    pub fn new() -> Result<Self, BackendError> {
        let (conn, screen_idx) = open_xcb_connection()?;
        let root = conn
            .setup()
            .roots
            .get(screen_idx)
            .ok_or_else(|| BackendError::new("x11_screen_missing", "unable to read X11 screen"))?
            .root;
        let keyboard = KeyboardLookup::from_connection(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            root,
            keyboard,
        })
    }

    fn with_conn<T>(
        &self,
        f: impl FnOnce(&mut XCBConnection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| "x11 connection lock poisoned".to_string())?;
        f(&mut guard)
    }

    fn send_motion(&self, x: u32, y: u32) -> Result<(), String> {
        let xi = self.keyboard.clamp_coord(x);
        let yi = self.keyboard.clamp_coord(y);
        self.with_conn(|conn| {
            conn.xtest_fake_input(
                xproto::MOTION_NOTIFY_EVENT,
                0,
                CURRENT_TIME,
                self.root,
                xi,
                yi,
                0,
            )
            .map_err(|e| e.to_string())?;
            conn.flush().map_err(|e| e.to_string())
        })
    }

    fn send_button(&self, button: MouseButton, press: bool) -> Result<(), String> {
        let detail = match button {
            MouseButton::Left => 1,
            MouseButton::Middle => 2,
            MouseButton::Right => 3,
        };
        self.with_conn(|conn| {
            conn.xtest_fake_input(
                if press {
                    xproto::BUTTON_PRESS_EVENT
                } else {
                    xproto::BUTTON_RELEASE_EVENT
                },
                detail,
                CURRENT_TIME,
                self.root,
                0,
                0,
                0,
            )
            .map_err(|e| e.to_string())?;
            conn.flush().map_err(|e| e.to_string())
        })
    }

    fn send_keycode(&self, keycode: u8, press: bool) -> Result<(), String> {
        self.with_conn(|conn| {
            conn.xtest_fake_input(
                if press {
                    xproto::KEY_PRESS_EVENT
                } else {
                    xproto::KEY_RELEASE_EVENT
                },
                keycode,
                CURRENT_TIME,
                self.root,
                0,
                0,
                0,
            )
            .map_err(|e| e.to_string())?;
            conn.flush().map_err(|e| e.to_string())
        })
    }

    fn send_keysym(&self, keysym: Keysym) -> Result<(), String> {
        if let Some(entry) = self.keyboard.entries.get(&keysym.raw()) {
            self.send_with_mods(entry)
        } else {
            Err(format!("keysym {:x} not mapped", keysym.raw()))
        }
    }

    fn send_with_mods(&self, entry: &KeyEntry) -> Result<(), String> {
        let use_shift = entry.mods & self.keyboard.shift_mask != 0;
        if use_shift {
            if let Some(shift_keycode) = self.keyboard.shift_keycode {
                self.send_keycode(shift_keycode, true)?;
            }
        }
        self.send_keycode(entry.keycode, true)?;
        self.send_keycode(entry.keycode, false)?;
        if use_shift {
            if let Some(shift_keycode) = self.keyboard.shift_keycode {
                self.send_keycode(shift_keycode, false)?;
            }
        }
        Ok(())
    }

    fn key_from_str(&self, key: &str) -> Option<Keysym> {
        match key.to_lowercase().as_str() {
            "enter" => Some(xkb::keysyms::KEY_Return.into()),
            "escape" => Some(xkb::keysyms::KEY_Escape.into()),
            "tab" => Some(xkb::keysyms::KEY_Tab.into()),
            "space" => Some(xkb::keysyms::KEY_space.into()),
            "backspace" => Some(xkb::keysyms::KEY_BackSpace.into()),
            other if other.len() == 1 => {
                let ch = other.chars().next().unwrap();
                Some(xkb::utf32_to_keysym(ch as u32))
            }
            _ => None,
        }
    }
}

#[cfg(feature = "os-linux-input")]
impl Automation for LinuxAutomation {
    fn move_cursor(&self, x: u32, y: u32) -> Result<(), String> {
        self.send_motion(x, y)
    }

    fn click(&self, button: MouseButton) -> Result<(), String> {
        self.mouse_down(button)?;
        self.mouse_up(button)
    }

    fn type_text(&self, text: &str) -> Result<(), String> {
        for ch in text.chars() {
            if ch == '\n' {
                self.key("Enter")?;
            } else {
                let keysym = xkb::utf32_to_keysym(ch as u32);
                self.send_keysym(keysym)?;
            }
        }
        Ok(())
    }

    fn key(&self, key: &str) -> Result<(), String> {
        let keysym = self.key_from_str(key).ok_or_else(|| format!("unsupported key '{}': use Enter, Escape, Tab, Space, Backspace, or single characters", key))?;
        self.send_keysym(keysym)
    }

    fn mouse_down(&self, button: MouseButton) -> Result<(), String> {
        self.send_button(button, true)
    }

    fn mouse_up(&self, button: MouseButton) -> Result<(), String> {
        self.send_button(button, false)
    }

    fn key_down(&self, key: &str) -> Result<(), String> {
        let keysym = self.key_from_str(key).ok_or_else(|| format!("unsupported key '{}': use Enter, Escape, Tab, Space, Backspace, or single characters", key))?;
        if let Some(entry) = self.keyboard.entries.get(&keysym.raw()) {
            if entry.mods & self.keyboard.shift_mask != 0 {
                if let Some(shift_keycode) = self.keyboard.shift_keycode {
                    self.send_keycode(shift_keycode, true)?;
                }
            }
            self.send_keycode(entry.keycode, true)
        } else {
            Err(format!("keysym {:x} not mapped", keysym.raw()))
        }
    }

    fn key_up(&self, key: &str) -> Result<(), String> {
        let keysym = self.key_from_str(key).ok_or_else(|| format!("unsupported key '{}': use Enter, Escape, Tab, Space, Backspace, or single characters", key))?;
        if let Some(entry) = self.keyboard.entries.get(&keysym.raw()) {
            self.send_keycode(entry.keycode, false)?;
            if entry.mods & self.keyboard.shift_mask != 0 {
                if let Some(shift_keycode) = self.keyboard.shift_keycode {
                    self.send_keycode(shift_keycode, false)?;
                }
            }
            Ok(())
        } else {
            Err(format!("keysym {:x} not mapped", keysym.raw()))
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
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
            rx >= mx && ry >= my && rx + rw <= mx + mw && ry + rh <= my + mh
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
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            handle: None,
        }
    }
}

#[cfg(feature = "os-linux-input")]
impl InputCapture for LinuxInputCapture {
    fn start(&mut self, callback: InputEventCallback) -> Result<(), BackendError> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        let running = self.running.clone();
        let cb = callback.clone();
        let (ready_tx, ready_rx) = sync_channel(1);
        let handle = thread::spawn(move || {
            if let Err(err) = run_input_loop(cb, running.clone(), Some(ready_tx)) {
                eprintln!("linux input capture error: {}", err);
            }
        });
        match ready_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(())) => {
                self.handle = Some(handle);
                Ok(())
            }
            Ok(Err(err)) => {
                self.running.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err(err)
            }
            Err(_) => {
                self.running.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err(BackendError::new(
                    "input_init_timeout",
                    "Timed out while starting input recording. Ensure you are running an X11 session (not Wayland) and that the required X11/XInput packages are installed.",
                ))
            }
        }
    }

    fn stop(&mut self) -> Result<(), BackendError> {
        if !self.running.swap(false, Ordering::SeqCst) {
            return Ok(());
        }
        // Don't join the handle - rdev::listen() blocks forever and there's no way
        // to stop it gracefully. The thread will continue running in the background
        // but will ignore all events after running is set to false. The thread will
        // be cleaned up when the process exits. This is an acceptable tradeoff since
        // XRecord's XRecordEnableContext has no graceful shutdown mechanism without
        // calling XRecordDisableContext from another thread (which rdev doesn't expose).
        self.handle.take(); // Drop the handle without joining
        eprintln!("[LinuxInputCapture] Input recording stopped (thread detached)");
        Ok(())
    }
}

#[cfg(feature = "os-linux-input")]
impl Drop for LinuxInputCapture {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(feature = "os-linux-input")]
struct KeyEntry {
    keycode: u8,
    mods: ModMask,
}

#[cfg(feature = "os-linux-input")]
struct KeyboardLookup {
    entries: HashMap<u32, KeyEntry>,
    shift_mask: ModMask,
    shift_keycode: Option<u8>,
}

#[cfg(feature = "os-linux-input")]
impl KeyboardLookup {
    fn from_connection(conn: &XCBConnection) -> Result<Self, BackendError> {
        let context = Context::new(xkb::CONTEXT_NO_FLAGS);
        let device_id = core_keyboard_device_id(conn)?;
        let keymap = xkb::x11::keymap_new_from_device(
            &context,
            conn,
            device_id,
            xkb::KEYMAP_COMPILE_NO_FLAGS,
        );
        let mut entries = HashMap::new();
        let mut masks = [0u32; 16];
        let min = keymap.min_keycode().raw();
        let max = keymap.max_keycode().raw();
        for raw_code in min..=max {
            let keycode = Keycode::new(raw_code);
            let layouts = keymap.num_layouts_for_key(keycode);
            for layout in 0..layouts {
                let levels = keymap.num_levels_for_key(keycode, layout);
                for level in 0..levels {
                    let syms = keymap.key_get_syms_by_level(keycode, layout, level);
                    if syms.is_empty() {
                        continue;
                    }
                    let mut mask_value = 0;
                    let count = keymap.key_get_mods_for_level(keycode, layout, level, &mut masks);
                    if count > 0 {
                        mask_value = masks[0];
                    }
                    for sym in syms {
                        entries.entry(sym.raw()).or_insert(KeyEntry {
                            keycode: keycode.raw() as u8,
                            mods: mask_value,
                        });
                    }
                }
            }
        }
        let shift_index = keymap.mod_get_index(xkb::MOD_NAME_SHIFT);
        let shift_mask = if shift_index == xkb::MOD_INVALID {
            0
        } else {
            1 << shift_index
        };
        let shift_keycode = entries
            .get(&xkb::keysyms::KEY_Shift_L)
            .map(|entry| entry.keycode)
            .or_else(|| {
                entries
                    .get(&xkb::keysyms::KEY_Shift_R)
                    .map(|entry| entry.keycode)
            });
        Ok(Self {
            entries,
            shift_mask,
            shift_keycode,
        })
    }

    fn clamp_coord(&self, value: u32) -> i16 {
        value.min(i16::MAX as u32) as i16
    }
}

// XkbStateBundle removed - not needed with rdev-based input capture

// Helper functions for LinuxAutomation (XTest-based input synthesis)
#[cfg(feature = "os-linux-input")]
fn open_xcb_connection() -> Result<(XCBConnection, usize), BackendError> {
    XCBConnection::connect(None).map_err(|e| BackendError::new("x11_connect_failed", e.to_string()))
}

#[cfg(feature = "os-linux-input")]
fn core_keyboard_device_id(conn: &XCBConnection) -> Result<i32, BackendError> {
    let device_id = xkb::x11::get_core_keyboard_device_id(conn);
    if device_id == -1 {
        Err(BackendError::new(
            "x11_device_missing",
            "XKB could not find a core keyboard (is the app running in an X11 session with $DISPLAY set?).",
        ))
    } else {
        Ok(device_id)
    }
}

#[cfg(feature = "os-linux-input")]
fn run_input_loop(
    callback: InputEventCallback,
    running: Arc<AtomicBool>,
    mut ready: Option<SyncSender<Result<(), BackendError>>>,
) -> Result<(), BackendError> {
    let notify = |result: Result<(), BackendError>,
                  ready: &mut Option<SyncSender<Result<(), BackendError>>>| {
        if let Some(tx) = ready.take() {
            let _ = tx.send(result);
        }
    };

    eprintln!("[LinuxInputCapture] Starting rdev event listener...");
    eprintln!("[LinuxInputCapture] DISPLAY={:?}, XDG_SESSION_TYPE={:?}", 
              std::env::var("DISPLAY"), std::env::var("XDG_SESSION_TYPE"));
    
    // Notify that we're ready before starting the blocking listen
    notify(Ok(()), &mut ready);
    
    eprintln!("[LinuxInputCapture] About to call rdev::listen()...");
    
    // Use rdev's listen function which uses XRecord internally
    // Note: rdev::listen() blocks forever with no built-in way to stop it.
    // XRecord's XRecordEnableContext blocks until XRecordDisableContext is called
    // from another thread, which rdev doesn't expose. The solution is to let the
    // thread run but stop processing events when running becomes false. The thread
    // will be abandoned (leaked) when the app exits, which is acceptable since
    // there's no way to gracefully shut down XRecord without X11 protocol access.
    let result = rdev::listen(move |event| {
        let is_running = running.load(Ordering::Relaxed);
        eprintln!("[LinuxInputCapture] RAW CALLBACK INVOKED! event={:?}, running={}", event.event_type, is_running);
        
        // Check if we should still process events
        if !is_running {
            eprintln!("[LinuxInputCapture] Ignoring event (running=false)");
            return;
        }
        
        eprintln!("[LinuxInputCapture] Event received: {:?}", event.event_type);
        let timestamp_ms = now_ms();
        
        match event.event_type {
            rdev::EventType::KeyPress(key) => {
                eprintln!("[LinuxInputCapture] Calling domain callback for KeyPress");
                let event = InputEvent::Keyboard(KeyboardEvent {
                    state: KeyState::Down,
                    key: format!("{:?}", key),
                    code: 0, // rdev doesn't provide raw keycode
                    text: None,
                    modifiers: Modifiers {
                        shift: false, // rdev doesn't track modifiers separately
                        control: false,
                        alt: false,
                        meta: false,
                    },
                    timestamp_ms,
                });
                eprintln!("[LinuxInputCapture] About to invoke callback with: {:?}", event);
                callback(event);
                eprintln!("[LinuxInputCapture] Callback invoked successfully");
            }
            rdev::EventType::KeyRelease(key) => {
                eprintln!("[LinuxInputCapture] Calling domain callback for KeyRelease");
                callback(InputEvent::Keyboard(KeyboardEvent {
                    state: KeyState::Up,
                    key: format!("{:?}", key),
                    code: 0,
                    text: None,
                    modifiers: Modifiers {
                        shift: false,
                        control: false,
                        alt: false,
                        meta: false,
                    },
                    timestamp_ms,
                }));
            }
            rdev::EventType::ButtonPress(button) => {
                let btn = match button {
                    rdev::Button::Left => MouseButton::Left,
                    rdev::Button::Right => MouseButton::Right,
                    rdev::Button::Middle => MouseButton::Middle,
                    _ => return,
                };
                eprintln!("[LinuxInputCapture] Calling domain callback for ButtonPress");
                // rdev doesn't provide coordinates with button events
                callback(InputEvent::Mouse(MouseEvent {
                    event_type: MouseEventType::ButtonDown(btn),
                    x: 0.0,
                    y: 0.0,
                    modifiers: Modifiers {
                        shift: false,
                        control: false,
                        alt: false,
                        meta: false,
                    },
                    timestamp_ms,
                }));
            }
            rdev::EventType::ButtonRelease(button) => {
                let btn = match button {
                    rdev::Button::Left => MouseButton::Left,
                    rdev::Button::Right => MouseButton::Right,
                    rdev::Button::Middle => MouseButton::Middle,
                    _ => return,
                };
                callback(InputEvent::Mouse(MouseEvent {
                    event_type: MouseEventType::ButtonUp(btn),
                    x: 0.0,
                    y: 0.0,
                    modifiers: Modifiers {
                        shift: false,
                        control: false,
                        alt: false,
                        meta: false,
                    },
                    timestamp_ms,
                }));
            }
            rdev::EventType::MouseMove { x, y } => {
                eprintln!("[LinuxInputCapture] Calling domain callback for MouseMove");
                callback(InputEvent::Mouse(MouseEvent {
                    event_type: MouseEventType::Move,
                    x,
                    y,
                    modifiers: Modifiers {
                        shift: false,
                        control: false,
                        alt: false,
                        meta: false,
                    },
                    timestamp_ms,
                }));
            }
            rdev::EventType::Wheel { delta_x, delta_y } => {
                eprintln!("[LinuxInputCapture] Calling domain callback for Wheel");
                callback(InputEvent::Scroll(ScrollEvent {
                    delta_x: delta_x as f64,
                    delta_y: delta_y as f64,
                    modifiers: Modifiers {
                        shift: false,
                        control: false,
                        alt: false,
                        meta: false,
                    },
                    timestamp_ms,
                }));
            }
        }
    });
    
    if let Err(err) = result {
        eprintln!("[LinuxInputCapture] rdev listen error: {:?}", err);
        return Err(BackendError::new("rdev_listen_failed", format!("{:?}", err)));
    }
    
    Ok(())
}

// Old XInput event handling removed - now using XRecord

// mouse_button_from_detail removed - rdev handles button mapping internally

// no crop/resize helpers needed for the sampling hash path

/// Diagnostic information about the system's input recording prerequisites
#[cfg(feature = "os-linux-input")]
#[derive(Debug, serde::Serialize)]
pub struct PrerequisiteCheck {
    pub x11_session: bool,
    pub x11_connection: bool,
    pub xinput_available: bool,
    pub xtest_available: bool,
    pub backend_not_fake: bool,
    pub feature_enabled: bool,
    pub display_env: String,
    pub session_type: String,
    pub error_details: Vec<String>,
}

#[cfg(feature = "os-linux-input")]
pub fn check_prerequisites() -> PrerequisiteCheck {
    let mut check = PrerequisiteCheck {
        x11_session: false,
        x11_connection: false,
        xinput_available: false,
        xtest_available: false,
        backend_not_fake: true,
        feature_enabled: true,
        display_env: std::env::var("DISPLAY").unwrap_or_else(|_| "not set".to_string()),
        session_type: std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string()),
        error_details: Vec::new(),
    };

    // Check session type
    if check.session_type.to_lowercase() == "x11" {
        check.x11_session = true;
    } else {
        check.error_details.push(format!(
            "Not running X11 session (detected: {}). Input recording requires X11, not Wayland.",
            check.session_type
        ));
    }

    // Check LOOPAUTOMA_BACKEND
    if let Ok(backend) = std::env::var("LOOPAUTOMA_BACKEND") {
        if backend.to_lowercase() == "fake" {
            check.backend_not_fake = false;
            check.error_details.push(
                "LOOPAUTOMA_BACKEND=fake is set. Unset it to enable real input recording."
                    .to_string(),
            );
        }
    }

    // Try to connect to X11
    match XCBConnection::connect(None) {
        Ok((conn, _screen_num)) => {
            check.x11_connection = true;

            // Check XInput extension
            match conn.xinput_xi_query_version(2, 0) {
                Ok(cookie) => match cookie.reply() {
                    Ok(reply) => {
                        if reply.major_version >= 2 {
                            check.xinput_available = true;
                        } else {
                            check.error_details.push(format!(
                                "XInput version too old: {}.{}. Need 2.0+",
                                reply.major_version, reply.minor_version
                            ));
                        }
                    }
                    Err(e) => {
                        check
                            .error_details
                            .push(format!("XInput query failed: {}", e));
                    }
                },
                Err(e) => {
                    check
                        .error_details
                        .push(format!("XInput not available: {}", e));
                }
            }

            // Check XTest extension
            use x11rb::connection::RequestConnection;
            if conn.extension_information("XTEST").ok().flatten().is_some() {
                check.xtest_available = true;
            } else {
                check
                    .error_details
                    .push("XTest extension not available".to_string());
            }
        }
        Err(e) => {
            check.error_details.push(format!(
                "Cannot connect to X11 server: {}. Check DISPLAY={} is correct.",
                e, check.display_env
            ));
        }
    }

    check
}
