#[cfg(feature = "os-linux-automation")]
use crate::domain::{Automation, MouseButton};
use crate::domain::{BackendError, DisplayInfo, Region, ScreenCapture, ScreenFrame};

#[cfg(feature = "os-linux-capture-xcap")]
use ahash::AHasher;
#[cfg(feature = "os-linux-automation")]
use std::collections::HashMap;
#[cfg(feature = "os-linux-capture-xcap")]
use std::hash::{Hash, Hasher};
#[cfg(feature = "os-linux-automation")]
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(feature = "os-linux-automation")]
use x11rb::{
    connection::Connection,
    protocol::{
        xproto::{self, ConnectionExt},
        xtest::ConnectionExt as XTestExt,
    },
    xcb_ffi::XCBConnection,
    CURRENT_TIME,
};
#[cfg(feature = "os-linux-capture-xcap")]
use xcap::Monitor;
#[cfg(feature = "os-linux-automation")]
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

#[cfg(feature = "os-linux-automation")]
pub struct LinuxAutomation {
    conn: Arc<Mutex<XCBConnection>>,
    root: xproto::Window,
    keyboard: KeyboardLookup,
}

#[cfg(feature = "os-linux-automation")]
impl LinuxAutomation {
    pub fn new() -> Result<Self, BackendError> {
        eprintln!("[LinuxAutomation] Initializing X11 automation...");
        eprintln!("[LinuxAutomation] DISPLAY={:?}", std::env::var("DISPLAY"));
        
        let (conn, screen_idx) = open_xcb_connection()?;
        eprintln!("[LinuxAutomation] X11 connection established, screen_idx={}", screen_idx);
        
        let root = conn
            .setup()
            .roots
            .get(screen_idx)
            .ok_or_else(|| BackendError::new("x11_screen_missing", "unable to read X11 screen"))?
            .root;
        eprintln!("[LinuxAutomation] Root window ID: {}", root);
        
        eprintln!("[LinuxAutomation] Initializing keyboard lookup...");
        let keyboard = KeyboardLookup::from_connection(&conn)?;
        eprintln!("[LinuxAutomation] Keyboard lookup initialized successfully with {} key mappings", keyboard.entries.len());
        
        eprintln!("[LinuxAutomation] ✓ Initialization complete!");
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
        
        eprintln!("[Automation] Moving cursor to ({}, {})", xi, yi);
        
        self.with_conn(|conn| {
            // CRITICAL: XTest fake MOTION_NOTIFY doesn't actually move the cursor!
            // Must use XWarpPointer to physically move the cursor
            // This is what xdotool and other automation tools do
            conn.warp_pointer(
                x11rb::NONE,  // src_window (None = relative to root)
                self.root,     // dst_window (warp to root coordinates)
                0, 0,          // src_x, src_y (ignored when src_window is None)
                0, 0,          // src_width, src_height (ignored)
                xi, yi,        // dst_x, dst_y (target position)
            )
            .map_err(|e| format!("warp_pointer failed: {}", e))?;
            
            conn.flush().map_err(|e| format!("flush failed: {}", e))?;
            
            // Small delay to let X11 process the warp
            std::thread::sleep(std::time::Duration::from_millis(10));
            
            // Query actual cursor position to verify
            match conn.query_pointer(self.root) {
                Ok(reply) => {
                    let reply = reply.reply().map_err(|e| format!("query_pointer reply failed: {}", e))?;
                    eprintln!("[Automation] Cursor now at ({}, {}), target was ({}, {})", 
                             reply.root_x, reply.root_y, xi, yi);
                    if (reply.root_x as i32 - xi as i32).abs() > 5 || (reply.root_y as i32 - yi as i32).abs() > 5 {
                        return Err(format!("Cursor warp failed: ended at ({}, {}) instead of ({}, {})", 
                                         reply.root_x, reply.root_y, xi, yi));
                    }
                }
                Err(e) => eprintln!("[Automation] Warning: Could not verify cursor position: {}", e),
            }
            
            Ok(())
        })
    }

    fn send_button(&self, button: MouseButton, press: bool) -> Result<(), String> {
        let detail = match button {
            MouseButton::Left => 1,
            MouseButton::Middle => 2,
            MouseButton::Right => 3,
        };
        
        let button_name = match button {
            MouseButton::Left => "Left",
            MouseButton::Middle => "Middle",
            MouseButton::Right => "Right",
        };
        
        eprintln!("[Automation] Mouse {} button {}", button_name, if press { "DOWN" } else { "UP" });
        
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
            .map_err(|e| format!("xtest_fake_input button failed: {}", e))?;
            
            conn.flush().map_err(|e| format!("flush failed: {}", e))?;
            
            // Critical: Add delay between button press and release
            // Some apps need time to register the event
            std::thread::sleep(std::time::Duration::from_millis(10));
            
            Ok(())
        })
    }

    fn send_keycode(&self, keycode: u8, press: bool) -> Result<(), String> {
        eprintln!("[Automation] Key {} keycode={}", if press { "DOWN" } else { "UP" }, keycode);
        
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
            .map_err(|e| format!("xtest_fake_input key failed: {}", e))?;
            
            conn.flush().map_err(|e| format!("flush failed: {}", e))?;
            
            // Critical: Add delay between key press and release
            // Without this, some apps don't register the keypress
            std::thread::sleep(std::time::Duration::from_millis(10));
            
            Ok(())
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

#[cfg(feature = "os-linux-automation")]
impl Automation for LinuxAutomation {
    fn move_cursor(&self, x: u32, y: u32) -> Result<(), String> {
        self.send_motion(x, y)
    }

    fn click(&self, button: MouseButton) -> Result<(), String> {
        self.mouse_down(button)?;
        self.mouse_up(button)
    }

    fn type_text(&self, text: &str) -> Result<(), String> {
        eprintln!("[Automation] Typing text: {:?} ({} chars)", text, text.len());
        
        let mut i = 0;
        let chars: Vec<char> = text.chars().collect();
        let mut char_count = 0;
        
        while i < chars.len() {
            // Check for [SpecialKey] syntax (e.g., [Enter], [Tab], [Escape])
            if chars[i] == '[' {
                if let Some(end_pos) = text[i..].find(']') {
                    let key_name = &text[i+1..i+end_pos];
                    eprintln!("[Automation] Pressing special key: [{}]", key_name);
                    // Send the special key
                    self.key(key_name)?;
                    i += end_pos + 1;
                    continue;
                }
            }
            
            // Regular character
            if chars[i] == '\n' {
                eprintln!("[Automation] Pressing Enter key");
                self.key("Enter")?;
            } else {
                let keysym = xkb::utf32_to_keysym(chars[i] as u32);
                eprintln!("[Automation] Typing char '{}' (keysym={:x})", chars[i], keysym.raw());
                self.send_keysym(keysym)?;
                char_count += 1;
            }
            i += 1;
            
            // Small delay between characters for reliability
            if i < chars.len() {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
        }
        
        eprintln!("[Automation] Finished typing {} characters", char_count);
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



#[cfg(feature = "os-linux-automation")]
struct KeyEntry {
    keycode: u8,
    mods: ModMask,
}

#[cfg(feature = "os-linux-automation")]
struct KeyboardLookup {
    entries: HashMap<u32, KeyEntry>,
    shift_mask: ModMask,
    shift_keycode: Option<u8>,
}

#[cfg(feature = "os-linux-automation")]
impl KeyboardLookup {
    fn from_connection(conn: &XCBConnection) -> Result<Self, BackendError> {
        // Try XKB first, but fall back to static keymap if it fails
        match Self::from_xkb(conn) {
            Ok(lookup) => {
                eprintln!("[XKB] Using live XKB keymap from X11");
                Ok(lookup)
            }
            Err(e) => {
                eprintln!("[XKB] Failed to get live keymap: {}", e);
                eprintln!("[XKB] Falling back to static US QWERTY keymap");
                Ok(Self::static_us_qwerty())
            }
        }
    }
    
    fn from_xkb(conn: &XCBConnection) -> Result<Self, BackendError> {
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
    
    /// Fallback static keymap for US QWERTY layout
    /// Based on standard X11 keycodes (evdev offset +8)
    fn static_us_qwerty() -> Self {
        use xkb::keysyms::*;
        let mut entries = HashMap::new();
        
        // Special keys (no shift)
        entries.insert(KEY_Return.into(), KeyEntry { keycode: 36, mods: 0 });
        entries.insert(KEY_Escape.into(), KeyEntry { keycode: 9, mods: 0 });
        entries.insert(KEY_Tab.into(), KeyEntry { keycode: 23, mods: 0 });
        entries.insert(KEY_space.into(), KeyEntry { keycode: 65, mods: 0 });
        entries.insert(KEY_BackSpace.into(), KeyEntry { keycode: 22, mods: 0 });
        
        // Lowercase letters (no shift)
        entries.insert(KEY_a.into(), KeyEntry { keycode: 38, mods: 0 });
        entries.insert(KEY_b.into(), KeyEntry { keycode: 56, mods: 0 });
        entries.insert(KEY_c.into(), KeyEntry { keycode: 54, mods: 0 });
        entries.insert(KEY_d.into(), KeyEntry { keycode: 40, mods: 0 });
        entries.insert(KEY_e.into(), KeyEntry { keycode: 26, mods: 0 });
        entries.insert(KEY_f.into(), KeyEntry { keycode: 41, mods: 0 });
        entries.insert(KEY_g.into(), KeyEntry { keycode: 42, mods: 0 });
        entries.insert(KEY_h.into(), KeyEntry { keycode: 43, mods: 0 });
        entries.insert(KEY_i.into(), KeyEntry { keycode: 31, mods: 0 });
        entries.insert(KEY_j.into(), KeyEntry { keycode: 44, mods: 0 });
        entries.insert(KEY_k.into(), KeyEntry { keycode: 45, mods: 0 });
        entries.insert(KEY_l.into(), KeyEntry { keycode: 46, mods: 0 });
        entries.insert(KEY_m.into(), KeyEntry { keycode: 58, mods: 0 });
        entries.insert(KEY_n.into(), KeyEntry { keycode: 57, mods: 0 });
        entries.insert(KEY_o.into(), KeyEntry { keycode: 32, mods: 0 });
        entries.insert(KEY_p.into(), KeyEntry { keycode: 33, mods: 0 });
        entries.insert(KEY_q.into(), KeyEntry { keycode: 24, mods: 0 });
        entries.insert(KEY_r.into(), KeyEntry { keycode: 27, mods: 0 });
        entries.insert(KEY_s.into(), KeyEntry { keycode: 39, mods: 0 });
        entries.insert(KEY_t.into(), KeyEntry { keycode: 28, mods: 0 });
        entries.insert(KEY_u.into(), KeyEntry { keycode: 30, mods: 0 });
        entries.insert(KEY_v.into(), KeyEntry { keycode: 55, mods: 0 });
        entries.insert(KEY_w.into(), KeyEntry { keycode: 25, mods: 0 });
        entries.insert(KEY_x.into(), KeyEntry { keycode: 53, mods: 0 });
        entries.insert(KEY_y.into(), KeyEntry { keycode: 29, mods: 0 });
        entries.insert(KEY_z.into(), KeyEntry { keycode: 52, mods: 0 });
        
        // Uppercase letters (with shift bit set - bit 0)
        let shift_mask = 1;
        entries.insert(KEY_A.into(), KeyEntry { keycode: 38, mods: shift_mask });
        entries.insert(KEY_B.into(), KeyEntry { keycode: 56, mods: shift_mask });
        entries.insert(KEY_C.into(), KeyEntry { keycode: 54, mods: shift_mask });
        entries.insert(KEY_D.into(), KeyEntry { keycode: 40, mods: shift_mask });
        entries.insert(KEY_E.into(), KeyEntry { keycode: 26, mods: shift_mask });
        entries.insert(KEY_F.into(), KeyEntry { keycode: 41, mods: shift_mask });
        entries.insert(KEY_G.into(), KeyEntry { keycode: 42, mods: shift_mask });
        entries.insert(KEY_H.into(), KeyEntry { keycode: 43, mods: shift_mask });
        entries.insert(KEY_I.into(), KeyEntry { keycode: 31, mods: shift_mask });
        entries.insert(KEY_J.into(), KeyEntry { keycode: 44, mods: shift_mask });
        entries.insert(KEY_K.into(), KeyEntry { keycode: 45, mods: shift_mask });
        entries.insert(KEY_L.into(), KeyEntry { keycode: 46, mods: shift_mask });
        entries.insert(KEY_M.into(), KeyEntry { keycode: 58, mods: shift_mask });
        entries.insert(KEY_N.into(), KeyEntry { keycode: 57, mods: shift_mask });
        entries.insert(KEY_O.into(), KeyEntry { keycode: 32, mods: shift_mask });
        entries.insert(KEY_P.into(), KeyEntry { keycode: 33, mods: shift_mask });
        entries.insert(KEY_Q.into(), KeyEntry { keycode: 24, mods: shift_mask });
        entries.insert(KEY_R.into(), KeyEntry { keycode: 27, mods: shift_mask });
        entries.insert(KEY_S.into(), KeyEntry { keycode: 39, mods: shift_mask });
        entries.insert(KEY_T.into(), KeyEntry { keycode: 28, mods: shift_mask });
        entries.insert(KEY_U.into(), KeyEntry { keycode: 30, mods: shift_mask });
        entries.insert(KEY_V.into(), KeyEntry { keycode: 55, mods: shift_mask });
        entries.insert(KEY_W.into(), KeyEntry { keycode: 25, mods: shift_mask });
        entries.insert(KEY_X.into(), KeyEntry { keycode: 53, mods: shift_mask });
        entries.insert(KEY_Y.into(), KeyEntry { keycode: 29, mods: shift_mask });
        entries.insert(KEY_Z.into(), KeyEntry { keycode: 52, mods: shift_mask });
        
        // Numbers (no shift)
        entries.insert(KEY_0.into(), KeyEntry { keycode: 19, mods: 0 });
        entries.insert(KEY_1.into(), KeyEntry { keycode: 10, mods: 0 });
        entries.insert(KEY_2.into(), KeyEntry { keycode: 11, mods: 0 });
        entries.insert(KEY_3.into(), KeyEntry { keycode: 12, mods: 0 });
        entries.insert(KEY_4.into(), KeyEntry { keycode: 13, mods: 0 });
        entries.insert(KEY_5.into(), KeyEntry { keycode: 14, mods: 0 });
        entries.insert(KEY_6.into(), KeyEntry { keycode: 15, mods: 0 });
        entries.insert(KEY_7.into(), KeyEntry { keycode: 16, mods: 0 });
        entries.insert(KEY_8.into(), KeyEntry { keycode: 17, mods: 0 });
        entries.insert(KEY_9.into(), KeyEntry { keycode: 18, mods: 0 });
        
        Self {
            entries,
            shift_mask,
            shift_keycode: Some(50),  // Left Shift keycode
        }
    }

    fn clamp_coord(&self, value: u32) -> i16 {
        value.min(i16::MAX as u32) as i16
    }
}

// Helper functions for LinuxAutomation (XTest-based input synthesis)
#[cfg(feature = "os-linux-automation")]
fn open_xcb_connection() -> Result<(XCBConnection, usize), BackendError> {
    XCBConnection::connect(None).map_err(|e| BackendError::new("x11_connect_failed", e.to_string()))
}

#[cfg(feature = "os-linux-automation")]
fn core_keyboard_device_id(conn: &XCBConnection) -> Result<i32, BackendError> {
    eprintln!("[XKB] Attempting to get core keyboard device ID...");
    let device_id = xkb::x11::get_core_keyboard_device_id(conn);
    eprintln!("[XKB] get_core_keyboard_device_id returned: {}", device_id);
    
    if device_id == -1 {
        // Try to get more context about the failure
        eprintln!("[XKB] DISPLAY={:?}", std::env::var("DISPLAY"));
        eprintln!("[XKB] XDG_SESSION_TYPE={:?}", std::env::var("XDG_SESSION_TYPE"));
        
        Err(BackendError::new(
            "x11_device_missing",
            "XKB could not find a core keyboard (is the app running in an X11 session with $DISPLAY set?).",
        ))
    } else {
        eprintln!("[XKB] Successfully found core keyboard with device_id={}", device_id);
        Ok(device_id)
    }
}


