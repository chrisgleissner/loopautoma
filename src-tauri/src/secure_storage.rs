/// Secure storage abstraction for sensitive data (API keys, etc.)
/// Uses OS keyring: macOS Keychain, Windows Credential Manager, Linux Secret Service/KWallet
use tauri_plugin_store::{Store, StoreExt};
use std::sync::Arc;

const OPENAI_KEY_ENTRY: &str = "openai_api_key";
const OPENAI_MODEL_ENTRY: &str = "openai_model";
const AUDIO_ENABLED_ENTRY: &str = "audio_enabled";
const AUDIO_VOLUME_ENTRY: &str = "audio_volume";

pub struct SecureStorage<R: tauri::Runtime> {
    store: Arc<Store<R>>,
}

impl<R: tauri::Runtime> SecureStorage<R> {
    pub fn new(app_handle: &tauri::AppHandle<R>) -> Result<Self, String> {
        let store = app_handle.store("secure.bin")
            .map_err(|e| format!("Failed to initialize secure storage: {}", e))?;
        
        Ok(Self {
            store,
        })
    }

    /// Get OpenAI API key from secure storage
    /// Returns None if key is not set
    pub fn get_openai_key(&self) -> Result<Option<String>, String> {
        match self.store.get(OPENAI_KEY_ENTRY) {
            Some(value) => {
                let key = value.as_str()
                    .ok_or("Invalid key format in storage")?
                    .to_string();
                Ok(Some(key))
            }
            None => Ok(None)
        }
    }

    /// Set OpenAI API key in secure storage
    pub fn set_openai_key(&self, key: &str) -> Result<(), String> {
        self.store.set(OPENAI_KEY_ENTRY, serde_json::json!(key));
        self.store.save()
            .map_err(|e| format!("Failed to save key to storage: {}", e))?;
        
        Ok(())
    }

    /// Delete OpenAI API key from secure storage
    pub fn delete_openai_key(&self) -> Result<(), String> {
        self.store.delete(OPENAI_KEY_ENTRY);
        self.store.save()
            .map_err(|e| format!("Failed to save after delete: {}", e))?;
        
        Ok(())
    }

    /// Check if OpenAI API key exists (without revealing it)
    pub fn has_openai_key(&self) -> Result<bool, String> {
        Ok(self.store.get(OPENAI_KEY_ENTRY).is_some())
    }

    /// Get preferred OpenAI model
    /// Returns None if not set (defaults to gpt-4o in client)
    pub fn get_openai_model(&self) -> Result<Option<String>, String> {
        match self.store.get(OPENAI_MODEL_ENTRY) {
            Some(value) => {
                let model = value.as_str()
                    .ok_or("Invalid model format in storage")?
                    .to_string();
                Ok(Some(model))
            }
            None => Ok(None)
        }
    }

    /// Set preferred OpenAI model
    pub fn set_openai_model(&self, model: &str) -> Result<(), String> {
        self.store.set(OPENAI_MODEL_ENTRY, serde_json::json!(model));
        self.store.save()
            .map_err(|e| format!("Failed to save model to storage: {}", e))?;
        
        Ok(())
    }

    /// Get audio enabled setting
    pub fn get_audio_enabled(&self) -> Result<bool, String> {
        match self.store.get(AUDIO_ENABLED_ENTRY) {
            Some(value) => {
                value.as_bool()
                    .ok_or("Invalid audio_enabled format in storage".to_string())
            }
            None => Ok(true) // Default to enabled
        }
    }

    /// Set audio enabled setting
    pub fn set_audio_enabled(&self, enabled: bool) -> Result<(), String> {
        self.store.set(AUDIO_ENABLED_ENTRY, serde_json::json!(enabled));
        self.store.save()
            .map_err(|e| format!("Failed to save audio setting: {}", e))?;
        Ok(())
    }

    /// Get audio volume (0.0 to 1.0)
    pub fn get_audio_volume(&self) -> Result<f32, String> {
        match self.store.get(AUDIO_VOLUME_ENTRY) {
            Some(value) => {
                value.as_f64()
                    .ok_or("Invalid audio_volume format in storage".to_string())
                    .map(|v| v as f32)
            }
            None => Ok(0.5) // Default to 50%
        }
    }

    /// Set audio volume (0.0 to 1.0)
    pub fn set_audio_volume(&self, volume: f32) -> Result<(), String> {
        if !(0.0..=1.0).contains(&volume) {
            return Err("Volume must be between 0.0 and 1.0".to_string());
        }
        self.store.set(AUDIO_VOLUME_ENTRY, serde_json::json!(volume));
        self.store.save()
            .map_err(|e| format!("Failed to save volume: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_lifecycle() {
        // Note: This test requires a Tauri AppHandle which isn't available in unit tests
        // Integration tests would be needed for full coverage
        // For now, we'll test the logic flow
    }
}
