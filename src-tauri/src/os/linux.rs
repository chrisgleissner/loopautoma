use crate::domain::{Region, ScreenCapture};
#[cfg(feature = "os-linux-input")]
use crate::domain::{Automation, MouseButton};

#[cfg(feature = "os-linux-capture-xcap")]
use xcap::Monitor;
#[cfg(feature = "os-linux-capture")]
use screenshots::Screen;
#[cfg(feature = "os-linux-capture")]
use ahash::AHasher;
#[cfg(feature = "os-linux-capture")]
use std::hash::{Hash, Hasher};
#[cfg(feature = "os-linux-input")]
use enigo::{Enigo, MouseButton as EnigoMouseButton, Key as EnigoKey, MouseControllable, KeyboardControllable};

pub struct LinuxCapture;
impl ScreenCapture for LinuxCapture {
    fn hash_region(&self, region: &Region, downscale: u32) -> u64 {
    #[cfg(feature = "os-linux-capture")]
        {
            if let Ok(screen) = Screen::from_point(0, 0) {
                let x = region.rect.x as i32;
                let y = region.rect.y as i32;
                let w = region.rect.width as u32;
                let h = region.rect.height as u32;
                if w == 0 || h == 0 { return 0; }
                if let Ok(capture) = screen.capture_area(x, y, w, h) {
                    let buf = capture.as_raw();
                    let mut hasher = AHasher::default();
                    (w, h, downscale).hash(&mut hasher);
                    let step = (downscale.max(1) as usize) * 4;
                    let mut i = 0usize;
                    while i + 4 <= buf.len() {
                        hasher.write(&buf[i..i+4]);
                        i += step;
                    }
                    return hasher.finish();
                }
            }
            0
        }
        #[cfg(all(not(feature = "os-linux-capture"), not(feature = "os-linux-capture-xcap")))]
        { 0 }
        #[cfg(feature = "os-linux-capture-xcap")]
        {
            if let Ok(monitors) = Monitor::all() {
                if let Some(mon) = monitors.first() {
                    let x = region.rect.x as i32;
                    let y = region.rect.y as i32;
                    let w = region.rect.width as u32;
                    let h = region.rect.height as u32;
                    if w == 0 || h == 0 { return 0; }
                    if let Ok(img) = mon.capture_area(x, y, w as i32, h as i32) {
                        let buf = img.bytes;
                        let mut hasher = AHasher::default();
                        (w, h, downscale).hash(&mut hasher);
                        let step = (downscale.max(1) as usize) * 4;
                        let mut i = 0usize;
                        while i + 4 <= buf.len() {
                            hasher.write(&buf[i..i+4]);
                            i += step;
                        }
                        return hasher.finish();
                    }
                }
            }
            0
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
}

// no crop/resize helpers needed for the sampling hash path
