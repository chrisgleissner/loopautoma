# Manual Verification Guide for Core Features

This guide helps you verify that the three core features of LoopAutoma work correctly on your system.

## Prerequisites

Before testing, ensure your system meets all requirements:

### 1. Run the Diagnostic Script

```bash
cd loopautoma
./scripts/verifyX11Features.sh
```

This script will check:
- X11 session (not Wayland)
- Required packages
- X11 extensions (XInput, XTEST, XKB)

**All checks must pass before proceeding.**

### 2. Fix Any Issues Found

If the diagnostic fails, follow the instructions it provides. Common fixes:

**If running Wayland:**
1. Log out
2. At login screen, click the gear/settings icon
3. Select "Ubuntu on Xorg" or "GNOME on Xorg"
4. Log back in
5. Run diagnostic again

**If missing packages:**
```bash
sudo apt install libx11-6 libxi6 libxtst6 libxkbcommon-x11-0
```

## Feature 1: Region Overlay (Window Minimize)

### What To Verify

When defining a region, the app should:
1. Minimize/hide the main window
2. Show a transparent full-screen overlay
3. Allow you to see your desktop apps clearly beneath
4. Restore the main window after selection

### Step-by-Step Test

1. **Start LoopAutoma:**
   ```bash
   ./target/release/loopautoma
   # Or use your installed binary
   ```

2. **Prepare desktop:**
   - Open a few applications (browser, terminal, text editor)
   - Arrange them so you can see them

3. **Click "Define watch region" button**
   - Look for the button with mouse/cursor icon in the Regions panel

4. **Verify main window disappears:**
   - LoopAutoma main window should hide/minimize
   - You should NOT see a blank screen
   - You SHOULD see your desktop apps clearly

5. **Draw a rectangle:**
   - Click and drag to select an area
   - You should be able to see the apps you're selecting over

6. **Complete selection:**
   - Release mouse button
   - Main window should reappear
   - Selected region should show as a pending card with thumbnail

7. **Verify thumbnail:**
   - Thumbnail should show the content you selected
   - Add region to profile with "Add region to profile" button

### Expected Results

✅ **Pass:** Main window hides, desktop visible, overlay works, window returns
❌ **Fail:** Blank screen, can't see desktop apps, window doesn't return

### If It Fails

- Check compositor settings (disable composition acceleration)
- Try different window manager
- Check if running in VM (may have graphics issues)
- File bug report with:
  - Desktop environment (GNOME, KDE, etc.)
  - Graphics driver info: `glxinfo | grep "OpenGL renderer"`
  - X11 version: `xdpyinfo | head -n 10`

## Feature 2: Keyboard/Mouse Event Capture

### What To Verify

When recording, the app should:
1. Capture all keyboard key presses
2. Capture all mouse clicks
3. Capture mouse movements
4. Show events in timeline
5. Buffer sequential text into single events

### Step-by-Step Test

1. **Open a test application:**
   ```bash
   gedit &  # Or any text editor
   ```

2. **Start recording:**
   - Click "Record" button in Recording Panel
   - "Recording" chip should appear at top

3. **Perform various inputs:**

   **Keyboard test:**
   - Click in gedit window
   - Type: "Hello World"
   - Press Enter
   - Type: "Testing 123"
   - Press Tab
   - Press Escape

   **Mouse test:**
   - Click various places in gedit
   - Double-click somewhere
   - Right-click somewhere

4. **Stop recording:**
   - Click "Stop" button
   - "Recording" chip should disappear

5. **Verify timeline:**
   - Timeline should show captured events
   - Should see text typing events (buffered)
   - Should see mouse click events with coordinates
   - Should see special key events (Enter, Tab, Escape)

6. **Save as ActionSequence:**
   - Click "Save as ActionSequence"
   - Actions should appear in Actions panel

### Expected Results

✅ **Pass:** All events captured and visible in timeline
❌ **Fail:** No events appear, or some events missing

### If It Fails

**Check diagnostics:**
```bash
./scripts/verifyX11Features.sh
```

**Check session type:**
```bash
echo $XDG_SESSION_TYPE
# Should output: x11
# If outputs: wayland - switch to X11 session
```

**Check for LOOPAUTOMA_BACKEND:**
```bash
env | grep LOOPAUTOMA
# Should be empty or not set
# If set to "fake" - unset it
```

**Check X11 connection:**
```bash
xdpyinfo | grep -i input
# Should show XInputExtension
```

**If still failing:**
- Try running with sudo (test only, not recommended for production):
  ```bash
  sudo -E ./target/release/loopautoma
  ```
- Check app logs for error messages
- File bug report with diagnostic output

## Feature 3: Keyboard/Mouse Event Replay

### What To Verify

When playing back recorded actions:
1. Cursor should move to recorded positions
2. Clicks should occur at those positions
3. Text should be typed into focused application
4. Special keys should work (Enter, Tab, etc.)

### Step-by-Step Test

1. **Record some actions** (from Feature 2 test above)

2. **Prepare for playback:**
   - Clear the test application (gedit)
   - Position cursor at start of document
   - Ensure gedit window has focus

3. **Method A: Manual playback test**
   - After saving actions to a profile
   - Click on an action in the Actions panel
   - Click "Execute" or similar button
   - Watch for the action to occur

4. **Method B: Monitor activation test**
   - Configure a simple profile:
     - Add a region
     - Add recorded actions
     - Set trigger interval to 5 seconds
   - Start the monitor
   - Wait 5 seconds
   - Actions should execute

### Expected Results

✅ **Pass:** Actions execute correctly:
- Cursor moves visibly
- Clicks occur at cursor position
- Text appears in focused app
- Special keys work (Enter creates new line, etc.)

❌ **Fail:** Nothing happens, or wrong actions occur

### If It Fails

**Verify focus:**
- Ensure target application has focus when playback starts
- LoopAutoma can't control where events go, that's the window manager's job

**Verify XTEST:**
```bash
xdpyinfo | grep -i xtest
# Should show XTEST extension
```

**Test simple case:**
- Create minimal test: single cursor move + single click
- Should see cursor jump to that position and click

**Check for conflicts:**
- Some applications block or filter synthetic input
- Try with different applications (gedit, terminal, browser)

**If still failing:**
- File bug report with:
  - Diagnostic script output
  - Description of what action was attempted
  - Target application that should receive input
  - Any error messages in app logs

## Common Issues and Solutions

### Issue: "Cannot connect to X11"

**Symptoms:** Recording fails immediately with connection error

**Solution:**
```bash
# Check DISPLAY
echo $DISPLAY
# Should show something like :0 or :1

# If empty, set it:
export DISPLAY=:0

# Or find correct display:
ls /tmp/.X11-unix/
# Use the X number, e.g., if you see X0, use DISPLAY=:0
```

### Issue: "No events captured"

**Symptoms:** Recording runs but timeline stays empty

**Solution:**
1. Verify X11 session (not Wayland)
2. Ensure app has permission to monitor input
3. Check that events are actually occurring (try in another app first)
4. Look for error messages in terminal/logs

### Issue: "Playback does nothing"

**Symptoms:** Actions execute but nothing happens on screen

**Solution:**
1. Ensure target application has focus
2. Verify XTEST extension is available
3. Try simple actions first (cursor move only)
4. Check that target app accepts synthetic input
   - Some security-focused apps block this
   - Try with gedit or terminal first

### Issue: "Overlay shows blank screen"

**Symptoms:** Can't see desktop apps when defining region

**Solution:**
1. Disable desktop composition:
   ```bash
   # GNOME:
   gsettings set org.gnome.desktop.interface enable-animations false
   
   # KDE:
   qdbus org.kde.KWin /Compositor suspend
   ```
2. Try different graphics driver
3. If in VM, ensure 3D acceleration is enabled
4. Try on bare metal system

## Success Criteria

You can consider the features fully working when:

1. ✅ **Region overlay:**
   - Main window hides
   - Desktop visible beneath overlay
   - Can draw rectangle over apps
   - Window returns after selection

2. ✅ **Input capture:**
   - Keyboard events captured
   - Mouse events captured
   - Events visible in timeline
   - Text buffering works

3. ✅ **Playback:**
   - Cursor moves to recorded position
   - Clicks occur correctly
   - Text types into focused app
   - Special keys work

## Getting Help

If you've followed this guide and features still don't work:

1. **Run diagnostic:**
   ```bash
   ./scripts/verifyX11Features.sh > diagnostic.txt 2>&1
   ```

2. **Collect system info:**
   ```bash
   echo "=== System Info ===" > sysinfo.txt
   uname -a >> sysinfo.txt
   echo "\n=== Display Info ===" >> sysinfo.txt
   echo "DISPLAY=$DISPLAY" >> sysinfo.txt
   echo "XDG_SESSION_TYPE=$XDG_SESSION_TYPE" >> sysinfo.txt
   echo "\n=== X11 Info ===" >> sysinfo.txt
   xdpyinfo | head -n 30 >> sysinfo.txt
   ```

3. **File bug report** with:
   - diagnostic.txt
   - sysinfo.txt
   - Description of what doesn't work
   - Steps you've tried
   - Any error messages

## Notes for Developers

This manual verification should be run:
- After any changes to OS layer (src-tauri/src/os/)
- After any changes to region picker (src-tauri/src/lib.rs region_picker_*)
- After any changes to input recording (lib.rs start_input_recording, etc.)
- Before each release
- On each supported platform

Consider creating a checklist template for release testing.
