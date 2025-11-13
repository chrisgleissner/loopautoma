use crate::domain::{Automation, BackendError, DisplayInfo, MouseButton, Region, ScreenCapture, ScreenFrame};

pub struct FakeCapture;
impl ScreenCapture for FakeCapture {
    fn hash_region(&self, _region: &Region, _downscale: u32) -> u64 { 42 }

    fn capture_region(&self, region: &Region) -> Result<ScreenFrame, BackendError> {
        Ok(ScreenFrame {
            display: DisplayInfo { id: 0, name: Some("fake".into()), x: 0, y: 0, width: region.rect.width.max(1), height: region.rect.height.max(1), scale_factor: 1.0, is_primary: true },
            width: region.rect.width.max(1),
            height: region.rect.height.max(1),
            stride: region.rect.width.max(1) * 4,
            bytes: vec![0; (region.rect.width.max(1) * region.rect.height.max(1) * 4) as usize],
            timestamp_ms: 0,
        })
    }

    fn displays(&self) -> Result<Vec<DisplayInfo>, BackendError> {
        Ok(vec![DisplayInfo { id: 0, name: Some("fake".into()), x: 0, y: 0, width: 1920, height: 1080, scale_factor: 1.0, is_primary: true }])
    }
}

pub struct FakeAutomation;
impl Automation for FakeAutomation {
    fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> { Ok(()) }
    fn click(&self, _button: MouseButton) -> Result<(), String> { Ok(()) }
    fn type_text(&self, _text: &str) -> Result<(), String> { Ok(()) }
    fn key(&self, _key: &str) -> Result<(), String> { Ok(()) }
}
