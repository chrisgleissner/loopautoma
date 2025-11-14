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
use std::io::ErrorKind;
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
    errors::ConnectionError,
    protocol::{
        xinput::{ConnectionExt as XInputExt, Device, EventMask, XIEventMask},
        xproto,
        xtest::ConnectionExt as XTestExt,
        Event as X11Event,
    },
    xcb_ffi::XCBConnection,
    CURRENT_TIME,
};
#[cfg(feature = "os-linux-capture-xcap")]
use xcap::Monitor;
#[cfg(feature = "os-linux-input")]
use xkbcommon::xkb::{self, Context, KeyDirection, Keycode, Keymap, Keysym, ModMask, State};

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
        let handle = thread::spawn(move || {
            if let Err(err) = run_input_loop(cb, running.clone()) {
                eprintln!("linux input capture error: {}", err);
            }
        });
        self.handle = Some(handle);
        Ok(())
    }

    fn stop(&mut self) -> Result<(), BackendError> {
        if !self.running.swap(false, Ordering::SeqCst) {
            return Ok(());
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
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
        let device_id = xkb::x11::get_core_keyboard_device_id(conn);
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

#[cfg(feature = "os-linux-input")]
struct XkbStateBundle {
    _context: Context,
    _keymap: Keymap,
    state: State,
}

#[cfg(feature = "os-linux-input")]
impl XkbStateBundle {
    fn new(conn: &XCBConnection) -> Result<Self, BackendError> {
        let mut major = 0;
        let mut minor = 0;
        let mut base_event = 0;
        let mut base_error = 0;
        if !xkb::x11::setup_xkb_extension(
            conn,
            xkb::x11::MIN_MAJOR_XKB_VERSION,
            xkb::x11::MIN_MINOR_XKB_VERSION,
            xkb::x11::SetupXkbExtensionFlags::NoFlags,
            &mut major,
            &mut minor,
            &mut base_event,
            &mut base_error,
        ) {
            return Err(BackendError::new(
                "xkb_setup_failed",
                "unable to initialize XKB extension",
            ));
        }
        let context = Context::new(xkb::CONTEXT_NO_FLAGS);
        let device_id = xkb::x11::get_core_keyboard_device_id(conn);
        let keymap = xkb::x11::keymap_new_from_device(
            &context,
            conn,
            device_id,
            xkb::KEYMAP_COMPILE_NO_FLAGS,
        );
        let state = xkb::x11::state_new_from_device(&keymap, conn, device_id);
        Ok(Self {
            _context: context,
            _keymap: keymap,
            state,
        })
    }
}

#[cfg(feature = "os-linux-input")]
fn open_xcb_connection() -> Result<(XCBConnection, usize), BackendError> {
    XCBConnection::connect(None).map_err(|e| BackendError::new("x11_connect_failed", e.to_string()))
}

#[cfg(feature = "os-linux-input")]
fn run_input_loop(
    callback: InputEventCallback,
    running: Arc<AtomicBool>,
) -> Result<(), BackendError> {
    let (conn, screen_idx) = open_xcb_connection()?;
    let screen = conn
        .setup()
        .roots
        .get(screen_idx)
        .ok_or_else(|| BackendError::new("x11_screen_missing", "unable to read X11 screen"))?
        .clone();
    select_xinput(&conn, screen.root)?;
    let mut xkb = XkbStateBundle::new(&conn)?;
    while running.load(Ordering::Relaxed) {
        match conn.poll_for_event() {
            Ok(Some(event)) => handle_xinput_event(&conn, screen.root, &mut xkb, &callback, event),
            Ok(None) => thread::sleep(Duration::from_millis(5)),
            Err(ConnectionError::IoError(ref io)) if io.kind() == ErrorKind::BrokenPipe => break,
            Err(err) => return Err(BackendError::new("x11_event_error", err.to_string())),
        }
    }
    Ok(())
}

#[cfg(feature = "os-linux-input")]
fn handle_xinput_event(
    conn: &XCBConnection,
    root: xproto::Window,
    xkb: &mut XkbStateBundle,
    callback: &InputEventCallback,
    event: X11Event,
) {
    match event {
        X11Event::XinputRawKeyPress(data) => {
            if let Some(kb_event) =
                build_keyboard_event(&mut xkb.state, data.detail, data.time, KeyState::Down)
            {
                callback(InputEvent::Keyboard(kb_event));
            }
        }
        X11Event::XinputRawKeyRelease(data) => {
            if let Some(kb_event) =
                build_keyboard_event(&mut xkb.state, data.detail, data.time, KeyState::Up)
            {
                callback(InputEvent::Keyboard(kb_event));
            }
        }
        X11Event::XinputRawButtonPress(data) => {
            if let Some((dx, dy)) = scroll_delta_from_button(data.detail) {
                callback(InputEvent::Scroll(ScrollEvent {
                    delta_x: dx,
                    delta_y: dy,
                    modifiers: modifiers_from_state(&xkb.state),
                    timestamp_ms: data.time as u64,
                }));
            } else if let Some(button) = mouse_button_from_detail(data.detail) {
                if let Some((x, y)) = pointer_position(conn, root) {
                    callback(InputEvent::Mouse(MouseEvent {
                        event_type: MouseEventType::ButtonDown(button),
                        x,
                        y,
                        modifiers: modifiers_from_state(&xkb.state),
                        timestamp_ms: data.time as u64,
                    }));
                }
            }
        }
        X11Event::XinputRawButtonRelease(data) => {
            if scroll_delta_from_button(data.detail).is_some() {
                return;
            }
            if let Some(button) = mouse_button_from_detail(data.detail) {
                if let Some((x, y)) = pointer_position(conn, root) {
                    callback(InputEvent::Mouse(MouseEvent {
                        event_type: MouseEventType::ButtonUp(button),
                        x,
                        y,
                        modifiers: modifiers_from_state(&xkb.state),
                        timestamp_ms: data.time as u64,
                    }));
                }
            }
        }
        X11Event::XinputRawMotion(data) => {
            if let Some((x, y)) = pointer_position(conn, root) {
                callback(InputEvent::Mouse(MouseEvent {
                    event_type: MouseEventType::Move,
                    x,
                    y,
                    modifiers: modifiers_from_state(&xkb.state),
                    timestamp_ms: data.time as u64,
                }));
            }
        }
        _ => {}
    }
}

#[cfg(feature = "os-linux-input")]
fn build_keyboard_event(
    state: &mut State,
    detail: u32,
    time: u32,
    key_state: KeyState,
) -> Option<KeyboardEvent> {
    let keycode = Keycode::new(detail);
    let direction = if key_state == KeyState::Down {
        KeyDirection::Down
    } else {
        KeyDirection::Up
    };
    state.update_key(keycode, direction);
    let keysym = state.key_get_one_sym(keycode);
    let mut key = xkb::keysym_get_name(keysym);
    if key.is_empty() {
        key = format!("Keycode{}", detail);
    }
    let text_val = state.key_get_utf8(keycode);
    Some(KeyboardEvent {
        state: key_state,
        key,
        code: detail,
        text: if text_val.is_empty() {
            None
        } else {
            Some(text_val)
        },
        modifiers: modifiers_from_state(state),
        timestamp_ms: time as u64,
    })
}

#[cfg(feature = "os-linux-input")]
fn modifiers_from_state(state: &State) -> Modifiers {
    Modifiers {
        shift: state.mod_name_is_active(xkb::MOD_NAME_SHIFT, xkb::STATE_MODS_EFFECTIVE),
        control: state.mod_name_is_active(xkb::MOD_NAME_CTRL, xkb::STATE_MODS_EFFECTIVE),
        alt: state.mod_name_is_active(xkb::MOD_NAME_ALT, xkb::STATE_MODS_EFFECTIVE),
        meta: state.mod_name_is_active(xkb::MOD_NAME_LOGO, xkb::STATE_MODS_EFFECTIVE),
    }
}

#[cfg(feature = "os-linux-input")]
fn mouse_button_from_detail(detail: u32) -> Option<MouseButton> {
    match detail {
        1 => Some(MouseButton::Left),
        2 => Some(MouseButton::Middle),
        3 => Some(MouseButton::Right),
        _ => None,
    }
}

#[cfg(feature = "os-linux-input")]
fn scroll_delta_from_button(detail: u32) -> Option<(f64, f64)> {
    match detail {
        4 => Some((0.0, 1.0)),
        5 => Some((0.0, -1.0)),
        6 => Some((1.0, 0.0)),
        7 => Some((-1.0, 0.0)),
        _ => None,
    }
}

#[cfg(feature = "os-linux-input")]
fn pointer_position(conn: &XCBConnection, root: xproto::Window) -> Option<(f64, f64)> {
    let cookie = xproto::query_pointer(conn, root).ok()?;
    let reply = cookie.reply().ok()?;
    Some((reply.root_x as f64, reply.root_y as f64))
}

#[cfg(feature = "os-linux-input")]
fn select_xinput(conn: &XCBConnection, root: xproto::Window) -> Result<(), BackendError> {
    let mask = EventMask {
        deviceid: Device::ALL_MASTER.into(),
        mask: vec![
            XIEventMask::RAW_KEY_PRESS,
            XIEventMask::RAW_KEY_RELEASE,
            XIEventMask::RAW_BUTTON_PRESS,
            XIEventMask::RAW_BUTTON_RELEASE,
            XIEventMask::RAW_MOTION,
        ],
    };
    conn.xinput_xi_select_events(root, &[mask])
        .map_err(|e| BackendError::new("xi_select_failed", e.to_string()))?;
    conn.flush()
        .map_err(|e| BackendError::new("x11_flush_failed", e.to_string()))
}

// no crop/resize helpers needed for the sampling hash path
