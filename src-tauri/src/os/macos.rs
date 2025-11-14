use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::domain::{
    Automation, BackendError, DisplayInfo, MouseButton, Region, ScreenCapture, ScreenFrame,
};
use screenshots::{display_info::DisplayInfo as RawDisplayInfo, Screen};

pub struct MacCapture;

impl ScreenCapture for MacCapture {
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
            .map_err(|e| BackendError::new("mac_displays_failed", e.to_string()))?;
        if screens.is_empty() {
            return Err(BackendError::new(
                "mac_displays_failed",
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

impl MacCapture {
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
            .map_err(|e| BackendError::new("mac_screens_unavailable", e.to_string()))?;
        if screens.is_empty() {
            return Err(BackendError::new(
                "mac_screens_unavailable",
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

pub struct MacAutomation;
impl Automation for MacAutomation {
    fn move_cursor(&self, _x: u32, _y: u32) -> Result<(), String> {
        Ok(())
    }
    fn click(&self, _button: MouseButton) -> Result<(), String> {
        Ok(())
    }
    fn type_text(&self, _text: &str) -> Result<(), String> {
        Ok(())
    }
    fn key(&self, _key: &str) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::hash_pixels;

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
}
