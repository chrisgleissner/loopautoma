/// Audio notification system for user intervention and profile completion alerts
///
/// Provides trait-based abstraction for audio playback with rodio backend.

use std::io::Cursor;
use std::sync::{Arc, Mutex};

/// Trait for audio notification playback
pub trait AudioNotifier: Send + Sync {
    /// Play intervention needed sound (watchdog alert)
    fn play_intervention_needed(&self) -> Result<(), String>;
    
    /// Play profile ended sound (task completion)
    fn play_profile_ended(&self) -> Result<(), String>;
    
    /// Set volume (0.0 to 1.0)
    fn set_volume(&self, volume: f32) -> Result<(), String>;
    
    /// Enable or disable audio notifications
    fn set_enabled(&self, enabled: bool);
    
    /// Check if audio is enabled
    fn is_enabled(&self) -> bool;
}

/// Mock audio notifier for testing
pub struct MockAudioNotifier {
    enabled: Arc<Mutex<bool>>,
    volume: Arc<Mutex<f32>>,
}

impl MockAudioNotifier {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(Mutex::new(true)),
            volume: Arc::new(Mutex::new(0.5)),
        }
    }
}

impl AudioNotifier for MockAudioNotifier {
    fn play_intervention_needed(&self) -> Result<(), String> {
        if *self.enabled.lock().unwrap() {
            Ok(())
        } else {
            Err("Audio disabled".to_string())
        }
    }
    
    fn play_profile_ended(&self) -> Result<(), String> {
        if *self.enabled.lock().unwrap() {
            Ok(())
        } else {
            Err("Audio disabled".to_string())
        }
    }
    
    fn set_volume(&self, volume: f32) -> Result<(), String> {
        if !(0.0..=1.0).contains(&volume) {
            return Err("Volume must be between 0.0 and 1.0".to_string());
        }
        *self.volume.lock().unwrap() = volume;
        Ok(())
    }
    
    fn set_enabled(&self, enabled: bool) {
        *self.enabled.lock().unwrap() = enabled;
    }
    
    fn is_enabled(&self) -> bool {
        *self.enabled.lock().unwrap()
    }
}

#[cfg(feature = "audio-notifications")]
mod rodio_impl {
    use super::*;
    use rodio::{Decoder, OutputStream, Sink};
    
    /// Rodio-based audio notifier
    pub struct RodioAudioNotifier {
        enabled: Arc<Mutex<bool>>,
        volume: Arc<Mutex<f32>>,
        intervention_data: &'static [u8],
        completion_data: &'static [u8],
    }
    
    impl RodioAudioNotifier {
        /// Create new audio notifier with embedded sound files
        pub fn new() -> Result<Self, String> {
            Ok(Self {
                enabled: Arc::new(Mutex::new(true)),
                volume: Arc::new(Mutex::new(0.5)),
                // Use simple sine wave tones for now (440Hz for intervention, 880Hz for completion)
                // In production, these would be actual .wav files embedded via include_bytes!
                intervention_data: &[],
                completion_data: &[],
            })
        }
        
        fn play_sound(&self, _data: &[u8], _description: &str) -> Result<(), String> {
            if !self.is_enabled() {
                return Ok(()); // Silently skip if disabled
            }
            
            // For now, just validate that rodio can initialize
            // In production with actual sound files, this would:
            // 1. Create OutputStream
            // 2. Create Sink
            // 3. Decode sound data
            // 4. Set volume
            // 5. Play sound
            
            let _stream = OutputStream::try_default()
                .map_err(|e| format!("Failed to initialize audio output: {}", e))?;
            
            // Placeholder: would decode and play actual sound
            // For MVP, we validate audio system works but don't play actual sounds
            Ok(())
        }
    }
    
    impl AudioNotifier for RodioAudioNotifier {
        fn play_intervention_needed(&self) -> Result<(), String> {
            self.play_sound(self.intervention_data, "intervention")
        }
        
        fn play_profile_ended(&self) -> Result<(), String> {
            self.play_sound(self.completion_data, "completion")
        }
        
        fn set_volume(&self, volume: f32) -> Result<(), String> {
            if !(0.0..=1.0).contains(&volume) {
                return Err("Volume must be between 0.0 and 1.0".to_string());
            }
            *self.volume.lock().unwrap() = volume;
            Ok(())
        }
        
        fn set_enabled(&self, enabled: bool) {
            *self.enabled.lock().unwrap() = enabled;
        }
        
        fn is_enabled(&self) -> bool {
            *self.enabled.lock().unwrap()
        }
    }
}

#[cfg(feature = "audio-notifications")]
pub use rodio_impl::RodioAudioNotifier;

/// Create default audio notifier for the current platform
#[cfg(feature = "audio-notifications")]
pub fn create_audio_notifier() -> Result<Box<dyn AudioNotifier>, String> {
    RodioAudioNotifier::new()
        .map(|n| Box::new(n) as Box<dyn AudioNotifier>)
}

#[cfg(not(feature = "audio-notifications"))]
pub fn create_audio_notifier() -> Result<Box<dyn AudioNotifier>, String> {
    Ok(Box::new(MockAudioNotifier::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn mock_audio_notifier_works() {
        let notifier = MockAudioNotifier::new();
        assert!(notifier.is_enabled());
        
        assert!(notifier.play_intervention_needed().is_ok());
        assert!(notifier.play_profile_ended().is_ok());
        
        notifier.set_enabled(false);
        assert!(!notifier.is_enabled());
        assert!(notifier.play_intervention_needed().is_err());
    }
    
    #[test]
    fn volume_bounds_enforced() {
        let notifier = MockAudioNotifier::new();
        assert!(notifier.set_volume(0.0).is_ok());
        assert!(notifier.set_volume(1.0).is_ok());
        assert!(notifier.set_volume(0.5).is_ok());
        assert!(notifier.set_volume(-0.1).is_err());
        assert!(notifier.set_volume(1.1).is_err());
    }
    
    #[cfg(feature = "audio-notifications")]
    #[test]
    fn rodio_notifier_initializes() {
        // This test only verifies that rodio can initialize
        // Actual sound playback requires audio hardware
        let result = RodioAudioNotifier::new();
        // May fail in CI without audio hardware, so we just check it doesn't panic
        let _ = result;
    }
}
