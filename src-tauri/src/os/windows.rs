use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::domain::{
    Automation, BackendError, DisplayInfo, MouseButton, Region, ScreenCapture, ScreenFrame,
};
use screenshots::{display_info::DisplayInfo as RawDisplayInfo, Screen};
#[cfg(target_os = "windows")]
use std::mem::size_of;
#[cfg(target_os = "windows")]
use windows::core::Error as WinError;
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, MOUSEINPUT, MOUSE_EVENT_FLAGS, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, VIRTUAL_KEY, VK_BACK, VK_ESCAPE, VK_RETURN, VK_SPACE, VK_TAB,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::SetCursorPos;

pub struct WinCapture;
impl ScreenCapture for WinCapture {
    fn hash_region(&self, region: &Region, downscale: u32) -> u64 {
        if region.rect.width == 0 || region.rect.height == 0 {
            return 0;
        }
        self.capture_raw(region)
            .map(|cap| hash_pixels(&cap.bytes, cap.width, cap.height, downscale))
            .unwrap_or(0)
    }

    fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError> {
        let captured = self.capture_raw(region)?;
        Ok(ScreenFrame {
            display: captured.display,
            width: captured.width,
            height: captured.height,
            stride: captured.width * 4,
            bytes: captured.bytes,
            timestamp_ms: now_ms(),
        })
    }

    fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
        let screens = Screen::all()
            .map_err(|e| BackendError::new("win_displays_failed", e.to_string()))?;
        if screens.is_empty() {
            return Err(BackendError::new(
                "win_displays_failed",
                "no displays detected",
            ));
        }
        Ok(screens
            .iter()
            .map(|s| to_display_info(&s.display_info))
            .collect())
    }
}

struct CapturedRegion {
    display: DisplayInfo,
    width: u32,
    height: u32,
    bytes: Vec<u8>,
}

impl WinCapture {
    fn capture_raw(&self, region: &Region) -> Result<CapturedRegion, BackendError> {
        if region.rect.width == 0 || region.rect.height == 0 {
            return Err(BackendError::new(
                "invalid_region",
                "region has zero area",
            ));
        }
        let screen = self.find_screen(region)?;
        let display = to_display_info(&screen.display_info);
        let rel_x = relative_coord(region.rect.x, screen.display_info.x);
        let rel_y = relative_coord(region.rect.y, screen.display_info.y);
        let img = screen
            .capture_area(rel_x, rel_y, region.rect.width, region.rect.height)
            .map_err(|e| BackendError::new("capture_failed", e.to_string()))?;
        Ok(CapturedRegion {
            display,
            width: region.rect.width,
            height: region.rect.height,
            bytes: img.into_vec(),
        })
    }

    fn find_screen(&self, region: &Region) -> Result<Screen, BackendError> {
        let screens = Screen::all()
            .map_err(|e| BackendError::new("win_screens_unavailable", e.to_string()))?;
        if screens.is_empty() {
            return Err(BackendError::new(
                "win_screens_unavailable",
                "no monitors reported by system",
            ));
        }
        let mut fallback = screens[0];
        for screen in &screens {
            if contains_region(&screen.display_info, region) {
                return Ok(*screen);
            }
            if screen.display_info.is_primary {
                fallback = *screen;
            }
        }
        Ok(fallback)
    }
}

fn contains_region(display: &RawDisplayInfo, region: &Region) -> bool {
    let rx = region.rect.x as i64;
    let ry = region.rect.y as i64;
    let rw = region.rect.width as i64;
    let rh = region.rect.height as i64;
    let dx = display.x as i64;
    let dy = display.y as i64;
    let dw = display.width as i64;
    let dh = display.height as i64;
    rx >= dx && ry >= dy && rx + rw <= dx + dw && ry + rh <= dy + dh
}

fn relative_coord(value: u32, origin: i32) -> i32 {
    let v = value as i64 - origin as i64;
    v.clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

fn to_display_info(raw: &RawDisplayInfo) -> DisplayInfo {
    DisplayInfo {
        id: raw.id,
        name: None,
        x: raw.x,
        y: raw.y,
        width: raw.width,
        height: raw.height,
        scale_factor: raw.scale_factor,
        is_primary: raw.is_primary,
    }
}

fn hash_pixels(bytes: &[u8], width: u32, height: u32, downscale: u32) -> u64 {
    if bytes.is_empty() || width == 0 || height == 0 {
        return 0;
    }
    const OFFSET: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x100000001b3;

    let mut hash = OFFSET;
    hash ^= width as u64;
    hash = hash.wrapping_mul(PRIME);
    hash ^= height as u64;
    hash = hash.wrapping_mul(PRIME);
    let step = (downscale.max(1) as usize) * 4;
    hash ^= step as u64;
    hash = hash.wrapping_mul(PRIME);

    let mut idx = 0usize;
    let mut samples = 0usize;
    let max_samples = 4096usize;
    while idx + 4 <= bytes.len() {
        for b in &bytes[idx..idx + 4] {
            hash ^= *b as u64;
            hash = hash.wrapping_mul(PRIME);
        }
        idx += step;
        samples += 1;
        if samples >= max_samples {
            break;
        }
    }
    hash
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NamedKey {
    Enter,
    Escape,
    Tab,
    Space,
    Backspace,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KeySpec {
    Named(NamedKey),
    Char(char),
}

#[cfg(any(target_os = "windows", test))]
fn classify_key(raw: &str) -> Result<KeySpec, String> {
    if raw.is_empty() {
        return Err("key cannot be empty".into());
    }
    let lower = raw.to_lowercase();
    let named = match lower.as_str() {
        "enter" => Some(NamedKey::Enter),
        "escape" | "esc" => Some(NamedKey::Escape),
        "tab" => Some(NamedKey::Tab),
        "space" => Some(NamedKey::Space),
        "backspace" => Some(NamedKey::Backspace),
        _ => None,
    };
    if let Some(named) = named {
        return Ok(KeySpec::Named(named));
    }
    let mut chars = raw.chars();
    if let Some(first) = chars.next() {
        if chars.next().is_none() {
            return Ok(KeySpec::Char(first));
        }
    }
    Err(format!(
        "unsupported key '{}': use Enter, Escape, Tab, Space, Backspace, or a single Unicode character",
        raw
    ))
}

pub struct WinAutomation;

#[cfg(target_os = "windows")]
impl WinAutomation {
    fn set_cursor_pos(x: u32, y: u32) -> Result<(), String> {
        let xi = x.min(i32::MAX as u32) as i32;
        let yi = y.min(i32::MAX as u32) as i32;
        unsafe {
            if SetCursorPos(xi, yi).as_bool() {
                Ok(())
            } else {
                Err(format!("SetCursorPos failed: {}", WinError::from_win32()))
            }
        }
    }

    fn dispatch(inputs: &mut [INPUT]) -> Result<(), String> {
        unsafe {
            let sent = SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32);
            if sent == inputs.len() as u32 {
                Ok(())
            } else {
                Err(format!(
                    "SendInput dispatched {} of {} events: {}",
                    sent,
                    inputs.len(),
                    WinError::from_win32()
                ))
            }
        }
    }

    fn mouse_input(flag: MOUSE_EVENT_FLAGS) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: flag,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn key_input(vk: VIRTUAL_KEY, key_up: bool) -> INPUT {
        let mut flags = KEYBD_EVENT_FLAGS(0);
        if key_up {
            flags |= KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP.0);
        }
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn unicode_input(unit: u16, key_up: bool) -> INPUT {
        let mut flags = KEYBD_EVENT_FLAGS(KEYEVENTF_UNICODE.0);
        if key_up {
            flags |= KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP.0);
        }
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn send_mouse_flag(flag: MOUSE_EVENT_FLAGS) -> Result<(), String> {
        let mut input = [Self::mouse_input(flag)];
        Self::dispatch(&mut input)
    }

    fn button_flags(button: MouseButton) -> (MOUSE_EVENT_FLAGS, MOUSE_EVENT_FLAGS) {
        match button {
            MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
            MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        }
    }

    fn named_virtual_key(key: NamedKey) -> VIRTUAL_KEY {
        match key {
            NamedKey::Enter => VK_RETURN,
            NamedKey::Escape => VK_ESCAPE,
            NamedKey::Tab => VK_TAB,
            NamedKey::Space => VK_SPACE,
            NamedKey::Backspace => VK_BACK,
        }
    }

    fn send_named_key(key: NamedKey, key_up: bool) -> Result<(), String> {
        let vk = Self::named_virtual_key(key);
        let mut input = [Self::key_input(vk, key_up)];
        Self::dispatch(&mut input)
    }

    fn send_unicode_for_char(ch: char, key_up: bool) -> Result<(), String> {
        let mut buf = [0u16; 2];
        let units = ch.encode_utf16(&mut buf);
        for unit in units {
            let mut input = [Self::unicode_input(*unit, key_up)];
            Self::dispatch(&mut input)?;
        }
        Ok(())
    }

    fn tap_unicode_char(ch: char) -> Result<(), String> {
        let mut buf = [0u16; 2];
        let units = ch.encode_utf16(&mut buf);
        for unit in units {
            let mut inputs = [
                Self::unicode_input(*unit, false),
                Self::unicode_input(*unit, true),
            ];
            Self::dispatch(&mut inputs)?;
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
impl Automation for WinAutomation {
    fn move_cursor(&self, x: u32, y: u32) -> Result<(), String> {
        Self::set_cursor_pos(x, y)
    }

    fn click(&self, button: MouseButton) -> Result<(), String> {
        self.mouse_down(button)?;
        self.mouse_up(button)
    }

    fn type_text(&self, text: &str) -> Result<(), String> {
        for ch in text.chars() {
            match ch {
                '\r' => {}
                '\n' => {
                    self.key("Enter")?;
                }
                '\t' => {
                    self.key("Tab")?;
                }
                _ => Self::tap_unicode_char(ch)?,
            }
        }
        Ok(())
    }

    fn key(&self, key: &str) -> Result<(), String> {
        let spec = classify_key(key)?;
        match spec {
            KeySpec::Named(named) => {
                Self::send_named_key(named, false)?;
                Self::send_named_key(named, true)
            }
            KeySpec::Char(ch) => {
                Self::send_unicode_for_char(ch, false)?;
                Self::send_unicode_for_char(ch, true)
            }
        }
    }

    fn mouse_down(&self, button: MouseButton) -> Result<(), String> {
        let (down, _) = Self::button_flags(button);
        Self::send_mouse_flag(down)
    }

    fn mouse_up(&self, button: MouseButton) -> Result<(), String> {
        let (_, up) = Self::button_flags(button);
        Self::send_mouse_flag(up)
    }

    fn key_down(&self, key: &str) -> Result<(), String> {
        let spec = classify_key(key)?;
        match spec {
            KeySpec::Named(named) => Self::send_named_key(named, false),
            KeySpec::Char(ch) => Self::send_unicode_for_char(ch, false),
        }
    }

    fn key_up(&self, key: &str) -> Result<(), String> {
        let spec = classify_key(key)?;
        match spec {
            KeySpec::Named(named) => Self::send_named_key(named, true),
            KeySpec::Char(ch) => Self::send_unicode_for_char(ch, true),
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl WinAutomation {
    fn unsupported<T>() -> Result<T, String> {
        Err("Windows automation backend requires building on Windows; run on a Windows target to enable SendInput automation.".into())
    }
}

#[cfg(not(target_os = "windows"))]
impl Automation for WinAutomation {
    fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> {
        Self::unsupported()
    }

    fn click(&self, _button: MouseButton) -> Result<(), String> {
        Self::unsupported()
    }

    fn type_text(&self, _text: &str) -> Result<(), String> {
        Self::unsupported()
    }

    fn key(&self, _key: &str) -> Result<(), String> {
        Self::unsupported()
    }

    fn mouse_down(&self, _button: MouseButton) -> Result<(), String> {
        Self::unsupported()
    }

    fn mouse_up(&self, _button: MouseButton) -> Result<(), String> {
        Self::unsupported()
    }

    fn key_down(&self, _key: &str) -> Result<(), String> {
        Self::unsupported()
    }

    fn key_up(&self, _key: &str) -> Result<(), String> {
        Self::unsupported()
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_key, hash_pixels, KeySpec, NamedKey};

    #[test]
    fn hash_pixels_changes_with_content() {
        let data = vec![0u8, 1, 2, 3, 4, 5, 6, 7];
        let other = vec![0u8, 1, 9, 3, 4, 5, 6, 7];
        let h1 = hash_pixels(&data, 2, 1, 1);
        let h2 = hash_pixels(&other, 2, 1, 1);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_pixels_respects_downscale() {
        let data = vec![10u8; 64];
        let h1 = hash_pixels(&data, 4, 4, 1);
        let h2 = hash_pixels(&data, 4, 4, 4);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_pixels_returns_zero_for_empty_buffer() {
        assert_eq!(hash_pixels(&[], 4, 4, 1), 0);
        let buf = vec![1u8; 16];
        assert_eq!(hash_pixels(&buf, 0, 4, 1), 0);
    }

    #[test]
    fn classify_named_keys() {
        assert!(matches!(
            classify_key("Enter").unwrap(),
            KeySpec::Named(NamedKey::Enter)
        ));
        assert!(matches!(
            classify_key("escape").unwrap(),
            KeySpec::Named(NamedKey::Escape)
        ));
        assert!(matches!(
            classify_key("TAB").unwrap(),
            KeySpec::Named(NamedKey::Tab)
        ));
    }

    #[test]
    fn classify_single_char_keys() {
        assert!(matches!(classify_key("a").unwrap(), KeySpec::Char('a')));
        assert!(matches!(
            classify_key("✅").unwrap(),
            KeySpec::Char('✅')
        ));
    }

    #[test]
    fn classify_rejects_invalid_inputs() {
        assert!(classify_key("").is_err());
        assert!(classify_key("ShiftLeft").is_err());
    }
}
