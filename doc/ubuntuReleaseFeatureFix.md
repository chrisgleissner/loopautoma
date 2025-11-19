# Ubuntu Release Build Feature Flag Fix

**Date:** 2025-11-19  
**Issue:** Ubuntu release build failing with "feature not found" error

## Problem

The Ubuntu release build was failing with this error:

```
error: the package 'loopautoma' does not contain this feature: os-linux-input
failed to build app: failed to build app
```

The CI workflow log showed:

```
bun tauri build -- --no-default-features --features "os-linux-input,os-linux-capture-xcap"
```

## Root Cause

**Feature name mismatch:**
- The release workflow (`.github/workflows/release.yaml` line 25) referenced feature `os-linux-input`
- The Cargo.toml only defines `os-linux-automation` (not `os-linux-input`)
- This mismatch caused Cargo to reject the build

## Investigation

Looking at `src-tauri/Cargo.toml`, the actual feature definitions are:

```toml
[features]
default = ["os-linux-capture-xcap", "os-linux-automation", "llm-integration"]
os-linux-capture-xcap = ["xcap", "ahash"]
os-linux-automation = ["x11rb", "xkbcommon"]  # ← This is the correct name
os-macos = ["screenshots"]
os-windows = ["screenshots", "windows"]
llm-integration = ["reqwest", "tokio"]
```

The feature was likely renamed from `os-linux-input` to `os-linux-automation` during refactoring (see PLANS.md line 742: "Updated feature flags: os-linux-input → os-linux-automation").

## Solution

Updated all references from `os-linux-input` to `os-linux-automation`:

1. **GitHub Workflow** (`.github/workflows/release.yaml`):
   ```yaml
   - platform: 'ubuntu-24.04'
     args: '-- --no-default-features --features os-linux-automation,os-linux-capture-xcap'
   ```

2. **Pre-release Check Script** (`scripts/preReleaseCheck.ts`):
   ```typescript
   check(
       "os-linux feature exists",
       cargoToml.includes('os-linux-automation =') && cargoToml.includes('os-linux-capture-xcap ='),
       "❌ os-linux features missing from Cargo.toml"
   );
   ```

3. **Documentation Updates**:
   - `doc/releaseBuild.md` - Build commands and feature descriptions
   - `doc/developer.md` - Developer setup instructions
   - `doc/inputRecorderHelper.md` - Input recorder usage
   - `doc/inputRecordingDiagnostics.md` - Diagnostics guide
   - `doc/ubuntuBuildFixSummary.md` - Previous build fixes
   - `doc/ubuntuReleaseBuildFix.md` - Release build instructions
   - `doc/uiBehaviorSpec.md` - UI behavior specifications

## Verification

After the fix:

```bash
# Feature exists in Cargo.toml
$ grep "os-linux-automation" src-tauri/Cargo.toml
os-linux-automation = ["x11rb", "xkbcommon"]

# Workflow uses correct feature
$ grep "ubuntu-24.04" -A 2 .github/workflows/release.yaml | grep args
args: '-- --no-default-features --features os-linux-automation,os-linux-capture-xcap'

# No references to old feature in critical files
$ grep -r "os-linux-input" .github/workflows/*.yaml src-tauri/Cargo.toml scripts/*.ts
# (no output - all cleaned up)
```

## Impact

This fix unblocks the Ubuntu release build. The next release tag pushed will successfully build Linux packages (.deb, .rpm, AppImage) with the correct feature flags.

## Related Issues

- Feature was renamed during Action Recorder refactoring (Phase 1, Task in PLANS.md)
- The rename removed OS-level input capture (rdev-based) in favor of UI-level capture
- The feature now provides X11 automation/playback capabilities via x11rb and xkbcommon
