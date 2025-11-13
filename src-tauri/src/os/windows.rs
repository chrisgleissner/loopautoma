use crate::domain::{Automation, MouseButton, Region, ScreenCapture};

pub struct WinCapture;
impl ScreenCapture for WinCapture {
    fn hash_region(&self, _region: &Region, _downscale: u32) -> u64 { 0 }
}

pub struct WinAutomation;
impl Automation for WinAutomation {
    fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> { Ok(()) }
    fn click(&self, _button: MouseButton) -> Result<(), String> { Ok(()) }
    fn type_text(&self, _text: &str) -> Result<(), String> { Ok(()) }
    fn key(&self, _key: &str) -> Result<(), String> { Ok(()) }
}
