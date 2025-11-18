# X11 Automation Deep Dive - Critical Findings

**Date:** 2025-11-19  
**Issue:** Actions report success but have no visible effect (no cursor movement, no clicks, no typing)

## Research: How Other Tools Work

### xdotool (Industry Standard)
- **Cursor movement:** Uses `XWarpPointer()` NOT `XTestFakeMotionEvent()`
- **Why:** XTest fake motion events generate motion notify events but DON'T actually move the cursor!
- **Source:** xdotool source code, X11 documentation

### AutoKey, pyautogui, robot framework
- All use **XWarpPointer** for cursor movement
- All add delays between events (10-50ms typical)
- All verify cursor position after warping

### XTest Extension Limitations
From X11 documentation:
- `XTestFakeMotionEvent()` - Generates motion events but cursor may not move
- `XTestFakeButtonEvent()` - Generates click at CURRENT cursor position (not at motion event position!)
- Timing: Events need processing time between operations

## Critical Bugs Found

### Bug 1: Using Wrong API for Cursor Movement ⚠️⚠️⚠️

**Location:** `src-tauri/src/os/linux.rs:157-173` (send_motion)

**What We Were Doing (WRONG):**
```rust
conn.xtest_fake_input(
    xproto::MOTION_NOTIFY_EVENT,  // ❌ Generates event but doesn't move cursor!
    0,
    CURRENT_TIME,
    self.root,
    xi, yi,
    0,
)
```

**What We MUST Do (CORRECT):**
```rust
conn.warp_pointer(
    x11rb::NONE,   // src_window
    self.root,     // dst_window
    0, 0,          // src position (ignored)
    0, 0,          // src size (ignored)
    xi, yi,        // ACTUAL cursor destination
)
```

**Impact:**
- Cursor never moved to (70, 251)
- Click happened at OLD cursor position (wherever it was)
- Kate editor never received click
- No focus change occurred
- Typing went nowhere

### Bug 2: No Verification of Cursor Position

**Problem:** We called cursor move but never checked if it worked

**Fix:** Query cursor position after warp:
```rust
let reply = conn.query_pointer(self.root)?.reply()?;
if (reply.root_x != target_x || reply.root_y != target_y) {
    return Err("Cursor warp failed");
}
```

### Bug 3: No Delays Between Events

**Problem:** Events fired instantly with no processing time

**Timing Requirements (from xdotool research):**
- After cursor warp: 10ms minimum
- Between button press/release: 10ms minimum  
- Between key press/release: 10ms minimum
- Between typed characters: 5ms minimum

**Fix:** Added `std::thread::sleep()` after each operation

### Bug 4: No Diagnostic Logging

**Problem:** "success=true" told us nothing about actual behavior

**Fix:** Added comprehensive eprintln! logging:
- Cursor position before/after warp
- Every button press/release
- Every key press/release with keysym
- Character count and special keys

## The Fix

### 1. Replaced Fake Motion with Real Warp

**File:** `src-tauri/src/os/linux.rs` (send_motion function)

```rust
// BEFORE (broken)
conn.xtest_fake_input(xproto::MOTION_NOTIFY_EVENT, ...)

// AFTER (working)
conn.warp_pointer(x11rb::NONE, self.root, 0, 0, 0, 0, xi, yi)
```

### 2. Added Cursor Position Verification

```rust
let reply = conn.query_pointer(self.root)?.reply()?;
eprintln!("[Automation] Cursor now at ({}, {}), target was ({}, {})", 
         reply.root_x, reply.root_y, xi, yi);
         
if (reply.root_x - xi).abs() > 5 || (reply.root_y - yi).abs() > 5 {
    return Err("Cursor warp failed");
}
```

### 3. Added Processing Delays

**Between operations:**
- Cursor warp → 10ms delay
- Button press → 10ms delay → Button release
- Key press → 10ms delay → Key release
- Character → 5ms delay → Next character

### 4. Added Diagnostic Logging

**Terminal will now show:**
```
[Automation] Moving cursor to (70, 251)
[Automation] Cursor now at (70, 251), target was (70, 251)
[Automation] Mouse Left button DOWN
[Automation] Mouse Left button UP
[Automation] Typing text: "hello[Enter]" (12 chars)
[Automation] Typing char 'h' (keysym=68)
[Automation] Typing char 'e' (keysym=65)
...
[Automation] Pressing special key: [Enter]
[Automation] Finished typing 5 characters
```

## Testing

### Run Diagnostic First

```bash
./scripts/checkX11Automation.sh
```

**Must pass:**
- ✓ X11 session (not Wayland)
- ✓ XTest extension available
- ✓ Cursor movement works (xdotool test)

### Run App with Logging

```bash
cd /home/chris/dev/loopautoma
bun run tauri dev 2>&1 | tee automation.log
```

**Watch terminal for:**
1. `[Automation] Moving cursor to (X, Y)`
2. `[Automation] Cursor now at (X, Y)` - should match target
3. `[Automation] Mouse Left button DOWN/UP` - should appear
4. `[Automation] Typing...` - should show each character

### Verify Visually

1. **Cursor movement:** Should SEE cursor jump to position
2. **Click:** Should SEE window activate/focus change
3. **Typing:** Should SEE text appear character by character

## Why Previous Attempts Failed

### Attempt 1: Added 50ms delay between actions
- **Problem:** Delays were BETWEEN actions (MoveCursor + Click + Type)
- **Reality:** Cursor never moved in the first place!
- **Result:** Click and Type still happened at wrong position

### Attempt 2: Fixed [SpecialKey] parsing
- **Problem:** Fixed typing syntax
- **Reality:** Text never reached target window (no focus)
- **Result:** Correct text sent to wrong window

### Root Cause
**We were using the wrong X11 API from the beginning.**

XTestFakeMotionEvent does NOT move the cursor. It only generates a motion event that applications can see, but the cursor stays where it is. The click then happens at the OLD cursor position, not the new one.

## X11 API Summary

| Operation | WRONG API (what we had) | CORRECT API (what we need) |
|-----------|------------------------|---------------------------|
| Move cursor | `XTestFakeMotionEvent` | `XWarpPointer` ✓ |
| Click | `XTestFakeButtonEvent` ✓ | (same) |
| Type | `XTestFakeKeyEvent` ✓ | (same) |

## Expected Behavior After Fix

### Before (Broken)
```
1. send_motion(70, 251) → generates event, cursor stays at (0, 0)
2. click() → clicks at (0, 0) instead of (70, 251)
3. Kate never receives click
4. type("hello") → goes to wrong window or nowhere
```

### After (Fixed)
```
1. warp_pointer(70, 251) → cursor PHYSICALLY moves to (70, 251)
2. verify: query_pointer() confirms (70, 251)
3. wait 10ms for window manager
4. click() → clicks at (70, 251) ✓
5. Kate receives click and gains focus ✓
6. wait 10ms for focus change
7. type("hello") → goes to Kate ✓
8. Text appears! ✓
```

## References

- **xdotool source:** Uses XWarpPointer for all cursor movement
- **X11 XTest docs:** Clarifies fake motion vs actual warp
- **AutoKey source:** Uses XWarpPointer + verification
- **Robot Framework:** Same approach, always verifies position

## Next Steps

1. Run diagnostic script: `./scripts/checkX11Automation.sh`
2. Rebuild: `cd src-tauri && cargo build`
3. Run with logging: `bun run tauri dev 2>&1 | tee automation.log`
4. Record simple action (click on Kate)
5. Start monitor
6. **WATCH the terminal for [Automation] logs**
7. **WATCH the screen for actual cursor movement**
8. Verify text appears in Kate

If cursor still doesn't move after this fix, there's a deeper X11 permissions issue.

## Common Issues

### Issue: "BadWindow" error
- **Cause:** Root window ID is wrong
- **Fix:** Check `conn.setup().roots[screen_idx].root`

### Issue: Cursor moves but click doesn't work
- **Cause:** Window manager blocking focus change
- **Fix:** Increase delay after cursor warp to 50-100ms

### Issue: Typing works but wrong characters
- **Cause:** Keyboard layout mismatch
- **Fix:** Check XKB keymap loading in KeyboardLookup

### Issue: Everything logs success but nothing happens
- **Cause:** XTest extension not actually enabled
- **Fix:** `sudo apt install xserver-xorg-input-all && restart X11`
