# Secure Storage Guide

This document covers how loopautoma stores sensitive credentials (OpenAI API keys) securely using OS-native keychains.

## Overview

loopautoma uses `tauri-plugin-store` v2.4.1 to integrate with the operating system's secure credential storage:

- **macOS**: Keychain Services API
- **Windows**: Windows Credential Manager
- **Linux**: Secret Service API (GNOME Keyring, KWallet, or compatible)

All credentials are encrypted at rest by the OS and never stored in plaintext files.

## Security best practices

### For users

1. **API key hygiene**:
   - Never share your API key or post it in public forums
   - Rotate keys regularly (monthly recommended)
   - Delete old keys from OpenAI platform after rotation
   - Use separate keys for different applications

2. **Account security**:
   - Enable 2FA on your OpenAI account
   - Monitor your OpenAI usage dashboard for unexpected activity
   - Set usage limits in your OpenAI account settings

3. **Machine security**:
   - Lock your computer when away (Ctrl+Alt+L on Linux, Cmd+Ctrl+Q on macOS, Win+L on Windows)
   - Use full-disk encryption (LUKS on Linux, FileVault on macOS, BitLocker on Windows)
   - Keep your OS and keyring software up to date

### For developers

1. **Never log API keys**: The codebase must never log, print, or display full API keys
2. **Mask in UI**: Always show masked values (`sk-••••••••••••••••`) in the UI
3. **No plaintext storage**: Never write keys to JSON, env files, or logs
4. **Fail securely**: If keyring access fails, do not fall back to plaintext storage

## Platform-specific notes

### macOS

- Credentials are stored in the login keychain (`~/Library/Keychains/login.keychain-db`)
- Backed up by Time Machine (encrypted)
- Access is controlled by macOS Keychain Access app
- You can view/delete credentials via: Keychain Access → "loopautoma" items

**Troubleshooting**:
- If keychain is locked, macOS will prompt for your password
- Errors like "keychain not available" may indicate corrupted keychain; repair via Keychain Access → Keychain First Aid

### Windows

- Credentials are stored in Windows Credential Manager
- View via: Control Panel → Credential Manager → Windows Credentials → Generic Credentials
- Look for entries with "loopautoma" in the name

**Troubleshooting**:
- Run as administrator if you see "access denied" errors
- Check Windows Security settings haven't disabled Credential Manager

### Linux

- Requires a Secret Service API implementation:
  - **GNOME**: `gnome-keyring` (usually installed by default)
  - **KDE**: `kwallet`
  - **Others**: `seahorse` or `keepassxc` with Secret Service support

- Install on Ubuntu/Debian:
  ```bash
  sudo apt install gnome-keyring seahorse
  ```

- The keyring must be unlocked (happens automatically on login for most DEs)

**Troubleshooting**:

1. **"No such secret collection" or "keyring not available"**:
   - Ensure keyring daemon is running:
     ```bash
     ps aux | grep gnome-keyring-daemon
     ```
   - If not running, start it:
     ```bash
     gnome-keyring-daemon --start --components=secrets
     ```
   - For headless/server environments, you may need to unlock the keyring manually:
     ```bash
     echo -n "your-password" | gnome-keyring-daemon --unlock
     ```

2. **Permission errors**:
   - Check D-Bus is running and accessible
   - Verify your user is in the correct groups (usually automatic)

3. **Wayland-specific issues**:
   - Some Wayland compositors may require additional configuration
   - Try setting `QT_QPA_PLATFORM=wayland` if using KWallet

## Implementation details

### Rust backend (`src-tauri/src/secure_storage.rs`)

```rust
pub struct SecureStorage<R: Runtime> {
    store: Arc<Store<R>>,
}

impl<R: Runtime> SecureStorage<R> {
    pub fn new(app: &AppHandle<R>) -> Result<Self, StoreError> {
        let store = StoreBuilder::new("secure.bin").build(app.clone())?;
        Ok(Self { store: Arc::new(store) })
    }

    pub async fn get_openai_key(&self) -> Option<String> {
        self.store.get(OPENAI_KEY_ENTRY).ok().flatten()
    }

    pub async fn set_openai_key(&self, key: &str) -> Result<(), StoreError> {
        self.store.set(OPENAI_KEY_ENTRY, json!(key))?;
        self.store.save().await
    }

    pub async fn delete_openai_key(&self) -> Result<(), StoreError> {
        self.store.delete(OPENAI_KEY_ENTRY)?;
        self.store.save().await
    }
}
```

### TypeScript UI (`src/components/SettingsPanel.tsx`)

```typescript
// Check if key exists
const hasKey = await getOpenAIKeyStatus();

// Save key (never store in app state)
await setOpenAIKey(apiKey);

// Delete key
await deleteOpenAIKey();

// Always mask display
const maskedKey = "sk-" + "•".repeat(16);
```

## Testing secure storage

1. **Save a test key**:
   - Open Settings (gear icon)
   - Enter a dummy key: `sk-test-key-12345`
   - Click "Save Key"
   - Status should show "✓ API key is configured"

2. **Verify persistence**:
   - Quit loopautoma completely
   - Restart the app
   - Open Settings → should still show key as configured

3. **Delete key**:
   - Click "Delete Key"
   - Status should change to show input field again

4. **Test on actual API** (optional):
   - Use a real OpenAI key with low rate limits
   - Create a simple LLMPromptGeneration action
   - Run the monitor and verify API calls work
   - Check OpenAI dashboard for logged requests

## Migrating from plaintext storage

If you previously stored keys in environment variables or config files:

1. Delete old plaintext keys from:
   - `.env` files
   - Config JSONs
   - Shell RC files (~/.bashrc, ~/.zshrc)

2. Add keys via Settings panel UI

3. Verify old files are removed:
   ```bash
   grep -r "sk-proj" ~/.config/loopautoma/ ~/.local/share/loopautoma/
   ```

## Security incident response

If you suspect your API key is compromised:

1. **Immediate action**:
   - Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Revoke the compromised key
   - Create a new key
   - Update loopautoma via Settings → Replace Key

2. **Investigation**:
   - Check OpenAI usage dashboard for unexpected requests
   - Review system logs for unauthorized access
   - Consider rotating all API keys as a precaution

3. **Prevention**:
   - Enable 2FA if not already enabled
   - Set up usage alerts in OpenAI dashboard
   - Review account access logs regularly

## Further reading

- [Tauri Plugin Store Documentation](https://v2.tauri.app/plugin/store/)
- [OpenAI API Keys Best Practices](https://platform.openai.com/docs/api-reference/authentication)
- [GNOME Keyring Documentation](https://wiki.gnome.org/Projects/GnomeKeyring)
- [Linux Secret Service API](https://specifications.freedesktop.org/secret-service/)

## Support

If you encounter issues with secure storage:

1. Check the troubleshooting sections above for your platform
2. Review [doc/developer.md](developer.md) for local setup requirements
3. File an issue at [github.com/chrisgleissner/loopautoma/issues](https://github.com/chrisgleissner/loopautoma/issues)
