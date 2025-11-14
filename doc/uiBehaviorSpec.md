# UI Behavior Specification — Loop Automa

**Version:** 1.0  
**Date:** 2025-11-14  
**Status:** Draft for review

This document defines the exact expected behavior of all interactive UI elements in Loop Automa, with a focus on quit functionality and region capture workflow. This serves as the single source of truth for implementation and E2E testing.

---

## Quick Reference — User-Facing Descriptions

**Quit Button**  
→ Closes the application immediately (desktop mode) or logs a message (web mode)

**Define watch region Button**  
→ Opens a fullscreen overlay to select a screen area by dragging your mouse

**Region Overlay (Fullscreen)**  
→ Transparent overlay where you drag from upper-left to lower-right to capture a screen region

**Escape Key (in Overlay)**  
→ Cancels region selection and returns to main window

**Cancel Button (in Overlay)**  
→ Same as Escape key — cancels region selection

**Pending Region Card**  
→ Preview of just-captured region with editable ID/name before saving to profile

**Add region to profile Button**  
→ Saves the pending region to your automation profile

**Discard Button (Pending)**  
→ Throws away the pending region without saving

**Refresh thumbnail Button**  
→ Re-captures the screenshot for a saved region (updates preview image)

**Remove Button (Region Card)**  
→ Deletes the region from your profile permanently

**Region List**  
→ Shows all screen regions your profile monitors, with thumbnails and coordinates

**Start/Stop Button**  
→ Begins or halts the automation monitor loop for the selected profile

**Profile Selector**  
→ Choose which automation profile to view, edit, or run

**Theme Toggles (System/Light/Dark)**  
→ Changes the app's color scheme

**Record Button (RecordingBar)**  
→ Starts capturing all keyboard and mouse input system-wide until stopped

**Stop Button (RecordingBar)**  
→ Ends input capture and finalizes the recorded action sequence

**Save as ActionSequence Button**  
→ Converts recorded inputs into executable automation actions for your profile

**Live Input Timeline**  
→ Shows real-time feed of captured mouse clicks, keystrokes, and scroll events

---

## 1. Application Quit Behavior

### 1.1 Quit Button (Main Window)

**Location:** Top-right corner of main window, next to theme toggles and framework badges

**Visual States:**
- Default: Red "danger" button with text "Quit"
- Hover: Darker red with tooltip "Quit LoopAutoma"
- Active: Pressed state with standard button feedback

**Behavior:**

#### 1.1.1 Tauri Desktop Mode (Production)
**Trigger:** User clicks "Quit" button when `window.__TAURI_IPC__` is defined

**Expected Sequence:**
1. Click initiates `quitApp()` callback
2. Callback invokes Tauri command `app_quit` via bridge
3. Backend (`src-tauri/src/lib.rs::app_quit`):
   - Closes region-overlay window if open
   - Closes main window
   - Calls `app.exit(0)` to terminate process
4. Application terminates cleanly
5. No lingering processes remain

**Success Criteria:**
- Application exits within 2 seconds
- Exit code is 0
- No zombie processes (`ps aux | grep loopautoma` shows nothing)
- If monitor was running, it stops cleanly before exit

**Error Cases:**
- If Tauri IPC fails: Error logged to console ("Unable to quit Loop Automa: <error>"), button remains clickable
- If window close fails: Backend continues with `app.exit(0)` regardless

#### 1.1.2 Web-Only Dev Mode (bun run dev)
**Trigger:** User clicks "Quit" button when `window.__TAURI_IPC__` is undefined

**Expected Sequence:**
1. Click initiates `quitApp()` callback
2. Callback detects absence of `__TAURI_IPC__`
3. Logs message to console: "Quit requested in web dev mode; close the tab/window manually."
4. No attempt to close window (browsers block `window.close()` for user-opened tabs)
5. Button remains functional for subsequent clicks

**Success Criteria:**
- Console message appears exactly once per click
- No JavaScript errors in console
- No visual feedback except button pressed state
- Application remains running (expected behavior)

**Error Cases:**
- If console.info fails: Silent failure, no user impact

#### 1.1.3 Quit During Monitor Execution
**Trigger:** User clicks "Quit" while a profile monitor is running

**Expected Sequence:**
1. Quit command initiated (either Tauri or web-only mode)
2. **No automatic monitor stop** — quit proceeds immediately
3. If in Tauri mode:
   - Backend closes windows and exits process
   - Monitor thread terminates as part of process exit
4. If in web-only mode:
   - Log message displayed
   - Monitor continues running (expected)

**Success Criteria:**
- Quit does not block waiting for monitor to stop
- In Tauri mode, monitor stops because process terminates
- In web-only mode, monitor keeps running (expected)

**Design Decision:** Quit is immediate and does not require stopping the monitor first. Users can manually stop the monitor before quitting if they want graceful shutdown.

---

## 2. Region Capture Workflow

### 2.1 "Define watch region" Button (Main Window)

**Location:** Region Authoring Panel, above region list

**Visual States:**
- Default: Primary button with text "Define watch region"
- Disabled: Gray, unclickable when no profile selected
- Hover: Tooltip "Click to temporarily hide this window, then drag with the left mouse button over the desktop area to watch. Release to capture the region and return here with a thumbnail."

**Behavior:**

#### 2.1.1 Opening Region Overlay
**Trigger:** User clicks "Define watch region" button with a profile selected

**Expected Sequence:**
1. Button click calls `launchOverlay()` callback
2. Status message appears: "Opening overlay…"
3. Callback invokes Tauri command `region_picker_show` via bridge
4. Backend (`src-tauri/src/lib.rs::region_picker_show`):
   - Checks if `region-overlay` window already exists
     - If exists: Focuses existing window, returns success
     - If not exists: Continues to step 5
   - Hides main window (`main.hide()`)
   - Creates new fullscreen window `region-overlay`:
     - Title: "Select region"
     - Fullscreen: true
     - Decorations: false (no title bar)
     - Transparent: true
     - Always on top: true
     - Resizable: false
     - Skip taskbar: true
     - URL: `index.html` (React app detects overlay context)
5. Frontend state updates:
   - `overlayActive` → true
   - Status message: "Overlay active — click and drag upper-left to lower-right on your desktop."
   - Hint text changes: "Overlay active — drag with the left mouse button, then release to capture the region and return to LoopAutoma."
6. RegionOverlay component mounts in new window

**Success Criteria:**
- Main window hides completely (not visible in taskbar or screen)
- Overlay window appears fullscreen, transparent except HUD
- Overlay covers all monitors (multi-monitor support)
- Cursor changes to crosshair
- Status messages update correctly

**Error Cases:**
- No profile selected: Button disabled, click does nothing
- Tauri window creation fails: Error message displayed "Unable to open overlay", overlay remains closed, main window stays visible
- Web-only mode: Command fails, error displayed (overlay requires desktop mode)

#### 2.1.2 Overlay Already Open
**Trigger:** User clicks "Define watch region" when overlay is already open

**Expected Sequence:**
1. Backend detects existing `region-overlay` window
2. Focuses existing overlay window
3. Returns success immediately
4. Main window remains hidden
5. No duplicate windows created

**Success Criteria:**
- Only one overlay window exists at any time
- Existing overlay receives focus
- No flicker or window recreation

---

### 2.2 Region Overlay Interaction

**Component:** `RegionOverlay.tsx` (rendered in `region-overlay` window)

**Visual Elements:**
- Fullscreen transparent overlay
- HUD in top-center: Title "Define watch region", status text, Cancel button
- Crosshair cursor
- Selection rectangle (when dragging)

**Behavior:**

#### 2.2.1 Initial State
**State:** Overlay just opened, no interaction yet

**Visual:**
- Transparent background (entire screen visible)
- HUD visible at top
- Status text: "Click upper-left corner"
- Cursor: crosshair

**Constraints:**
- Cannot interact with windows beneath overlay (overlay captures all pointer events)
- Keyboard shortcuts functional (Escape to cancel)

#### 2.2.2 Selection Start (Pointer Down)
**Trigger:** User presses left mouse button anywhere on overlay (except HUD)

**Expected Sequence:**
1. `handlePointerDown` event fires
2. Event prevented and stopped from propagating
3. Click on HUD is ignored (HUD has `onPointerDown` stop propagation)
4. Start point captured: `{ x: event.clientX, y: event.clientY }`
5. Current point initialized to start point
6. Pointer capture activated on root element
7. Status text updates: "Drag to lower-right corner"

**Success Criteria:**
- Selection starts at exact pixel clicked
- Pointer capture prevents events from escaping overlay
- Status updates immediately

#### 2.2.3 Selection Drag (Pointer Move)
**Trigger:** User moves mouse while holding left button

**Expected Sequence:**
1. `handlePointerMove` event fires continuously
2. If no start point: Event ignored
3. If start point exists:
   - Current point updated: `{ x: event.clientX, y: event.clientY }`
   - Selection rectangle recalculated via `toCssRect(start, current)`
   - Rectangle normalized (handles drag in any direction)
   - Visual rectangle updates in real-time
4. Status remains: "Drag to lower-right corner" (or "Release to confirm lower-right corner")

**Visual Feedback:**
- Semi-transparent rectangle drawn from start to current point
- Rectangle CSS: `.region-overlay-rect` with absolute positioning
- Handles drag in all 4 directions (normalizes min/max x/y)

**Success Criteria:**
- Rectangle updates smoothly during drag (no lag)
- Rectangle always has correct orientation regardless of drag direction
- Rectangle visible against any desktop background

#### 2.2.4 Selection Complete (Pointer Up)
**Trigger:** User releases left mouse button

**Expected Sequence:**
1. `handlePointerUp` event fires
2. If no start point: Event ignored
3. If start point exists:
   - End point captured: `{ x: event.clientX, y: event.clientY }`
   - Pointer capture released
   - Both points converted to global screen coordinates:
     - `toGlobal(start)`: Applies monitor position offset and scale factor
     - `toGlobal(end)`: Same transformation
   - Tauri command invoked: `region_picker_complete({ start, end })`
   - Backend (`src-tauri/src/lib.rs::region_picker_complete`):
     - Normalizes rect (ensures width/height positive, non-zero)
     - Validation: Rejects zero-area rectangles with error "Region must have a non-zero area"
     - Captures thumbnail via `capture_thumbnail(&rect)`:
       - Uses ScreenCapture backend
       - Returns Base64 PNG string or null
     - Emits event: `loopautoma://region_pick_complete` with payload:
       ```typescript
       {
         rect: { x, y, width, height },
         thumbnail_png_base64: string | null
       }
       ```
     - Shows main window (`main.show()`, `main.set_focus()`)
     - Closes overlay window (`overlay.close()`)
   - Frontend closes overlay window: `pickerWindow.close()`
4. RegionAuthoringPanel (in main window) receives event:
   - `pending` state updated with rect and thumbnail
   - `pendingId` auto-generated: `region-${Date.now().toString(36)}`
   - `pendingName` auto-generated: `Region ${count + 1}`
   - Status message: "Region captured — review details below."
   - Pending region card displayed in UI

**Success Criteria:**
- Coordinates correctly transformed to global screen space
- Zero-area selection rejected with clear error message
- Thumbnail captured for valid selection
- Main window reappears and gains focus
- Overlay window closes completely
- Pending region appears in main window immediately
- No memory leaks (overlay resources cleaned up)

**Error Cases:**
- Zero-area selection: Error displayed in overlay, overlay remains open, user can try again
- Thumbnail capture fails: Event still emitted with `thumbnail_png_base64: null`, workflow continues
- Event emit fails: Error logged, overlay closes, main window shown (graceful degradation)
- Window operations fail: Logged but not blocking (overlay may stay open requiring manual close)

#### 2.2.5 Selection Cancel (Escape Key)
**Trigger:** User presses Escape key at any time while overlay is open

**Expected Sequence:**
1. Keyboard event listener fires (`keydown` with `key === "Escape"`)
2. Tauri command invoked: `region_picker_cancel()`
3. Backend (`src-tauri/src/lib.rs::region_picker_cancel`):
   - Shows main window (`main.show()`, `main.set_focus()`)
   - Closes overlay window (`overlay.close()`)
4. Frontend closes overlay window: `pickerWindow.close()`
5. RegionAuthoringPanel: No event received, no pending region

**Success Criteria:**
- Escape works at any stage (before selection, during drag, after release)
- Main window reappears immediately
- Overlay closes without emitting region_pick_complete event
- No state changes in main window (no pending region)

**Error Cases:**
- Backend command fails: Logged, frontend still attempts `pickerWindow.close()`
- Window close fails: Logged, may require manual close

#### 2.2.6 Selection Cancel (Cancel Button)
**Trigger:** User clicks "Cancel" button in overlay HUD

**Expected Sequence:**
1. Button click event fires
2. HUD has `onPointerDown` stop propagation (prevents selection start)
3. Click handler invokes: `regionPickerCancel()` then `pickerWindow.close()`
4. Backend and frontend behavior identical to Escape key (see 2.2.5)

**Success Criteria:**
- Cancel button always visible and clickable
- Clicking cancel doesn't start a selection
- Behavior identical to Escape key

---

### 2.3 Pending Region Review (Main Window)

**Location:** Region Authoring Panel, below toolbar

**Component:** RegionAuthoringPanel pending region card

**Behavior:**

#### 2.3.1 Pending Region Display
**Trigger:** User completes region selection (see 2.2.4)

**Visual Elements:**
- Card with aria-live="polite" for accessibility
- Rect coordinates: "x=X, y=Y, w=W, h=H"
- Thumbnail image (if captured) or no image
- Form inputs:
  - Region ID input (pre-filled with auto-generated ID)
  - Friendly name input (pre-filled with "Region N")
- Action buttons:
  - "Add region to profile" (primary)
  - "Discard" (ghost/secondary)

**Constraints:**
- Region ID must be unique within profile
- Region ID can be edited before saving
- Friendly name is optional
- Thumbnail is immutable (cannot edit after capture)

#### 2.3.2 Add Region to Profile
**Trigger:** User clicks "Add region to profile" button

**Expected Sequence:**
1. Button click calls `handleSavePending()`
2. Region ID trimmed and validated:
   - If empty or whitespace-only: Use auto-generated ID
   - If provided: Use user's ID
3. Friendly name trimmed (empty string becomes undefined)
4. Callback invoked: `onRegionAdd({ rect, id, name })`
5. Parent component (ProfileEditor or App):
   - Adds region to profile's regions array
   - Persists profile via `profilesSave()`
6. If thumbnail exists: Stored in component state `thumbnails[regionId]`
7. Pending state cleared:
   - `pending` → null
   - `pendingId` → ""
   - `pendingName` → ""
   - Status: "Region added to profile."
8. Region appears in region list below

**Success Criteria:**
- Region appears in list immediately
- Thumbnail preserved in list (no re-capture needed)
- Status message confirms success
- Pending card disappears
- Profile saved to backend

**Error Cases:**
- Duplicate ID: Error displayed "Failed to add region: <error>", pending card remains, user can edit ID
- Save to backend fails: Error displayed, pending card remains, user can retry
- Missing onRegionAdd callback: Button disabled, no action

#### 2.3.3 Discard Pending Region
**Trigger:** User clicks "Discard" button

**Expected Sequence:**
1. Button click calls `handleCancelPending()`
2. Pending state cleared:
   - `pending` → null
   - `pendingId` → ""
   - `pendingName` → ""
   - `status` → null
3. Pending card disappears
4. No changes to profile (region not added)

**Success Criteria:**
- Pending card disappears immediately
- No profile modifications
- No backend calls
- Status message cleared

---

### 2.4 Region List Management

**Location:** Region Authoring Panel, below pending region card (if any)

**Component:** RegionAuthoringPanel region list

**Behavior:**

#### 2.4.1 Display Saved Regions
**Trigger:** Profile has one or more regions defined

**Visual Elements:**
- Grid layout (`.region-grid`)
- Each region card (`.region-card`):
  - Thumbnail image (or placeholder "No preview yet")
  - Friendly name (bold) or "Unnamed region"
  - Region ID (monospace code)
  - Coordinates: "(x, y) · width×height"
  - Action buttons: "Refresh thumbnail", "Remove"

**Automatic Thumbnail Loading:**
- On mount: For each region without a thumbnail in state, calls `captureRegionThumbnail(rect)`
- Sequential loading (not parallel to avoid backend overload)
- Failed captures logged to console, continue to next region
- Thumbnails stored in component state, persist across re-renders

**Success Criteria:**
- All regions displayed in order
- Thumbnails load automatically within 5 seconds
- Failed thumbnails show placeholder, don't block other regions
- Layout responsive to window size

#### 2.4.2 Refresh Thumbnail
**Trigger:** User clicks "Refresh thumbnail" button on a region card

**Expected Sequence:**
1. Button click calls `refreshThumbnail(region)`
2. State updated: `thumbLoading` → region.id
3. Button disabled, text changes to "Refreshing…"
4. Tauri command invoked: `region_capture_thumbnail(region.rect)`
5. Backend:
   - Captures screen at specified rect
   - Returns Base64 PNG or null
6. Thumbnail state updated: `thumbnails[region.id]` → new thumbnail
7. State updated: `thumbLoading` → null
8. Button re-enabled, text reverts to "Refresh thumbnail"

**Success Criteria:**
- Only one thumbnail refreshes at a time (button disabled during operation)
- New thumbnail replaces old immediately when received
- Failed refresh shows error message, old thumbnail preserved
- Operation completes within 3 seconds

**Error Cases:**
- Backend fails: Error message displayed "<error message>", button re-enabled, old thumbnail preserved

#### 2.4.3 Remove Region
**Trigger:** User clicks "Remove" button on a region card

**Expected Sequence:**
1. Button click calls `handleRemove(region.id)`
2. Callback invoked: `onRegionRemove(region.id)`
3. Parent component:
   - Removes region from profile's regions array
   - Persists profile via `profilesSave()`
4. Component state updated: `thumbnails[region.id]` deleted
5. Region card disappears from list

**Success Criteria:**
- Region removed immediately from UI
- Profile saved to backend
- Thumbnail memory freed
- Other regions unaffected

**Error Cases:**
- Backend save fails: Error message displayed "Unable to remove region: <error>", region remains in list
- Missing onRegionRemove callback: Button not rendered

#### 2.4.4 Empty Region List
**Trigger:** Profile has no regions defined

**Visual:**
- Empty state message: "No regions captured yet. Use 'Define watch region' to add one."
- Role="status" for accessibility

**Success Criteria:**
- Clear call to action
- No error appearance (neutral state)
- Message updates immediately when first region added

---

## 3. Input Recording Workflow

### 3.1 RecordingBar Component

**Location:** Profile Editor section, below profile metadata

**Component:** `RecordingBar.tsx` with live timeline display

**Purpose:** Capture keyboard and mouse input system-wide to generate ActionSequence definitions

**User Intent:** "I want to record a sequence of clicks and keystrokes to automate later"

**Visual Elements:**
- Record/Stop toggle button (primary action)
- "Recording" status chip (when active)
- "Save as ActionSequence" button (enabled when events captured)
- Event counter: "X recorded step(s)"
- Live input timeline box with scrolling event list
- Clear button for timeline
- Error alert (if recording fails to start)

---

### 3.2 Starting Input Recording

#### 3.2.1 Record Button (Initial State)
**Trigger:** User clicks "Record" button when not recording

**Expected Sequence:**
1. Button click calls `toggleRecording()` callback
2. State reset:
   - Error cleared
   - Events array emptied
   - Timeline cleared
   - Type buffer reset
3. Tauri command invoked: `start_input_recording()`
4. Backend (`src-tauri/src/lib.rs::start_input_recording`):
   - **Environment validation:**
     - If `LOOPAUTOMA_BACKEND=fake`: Returns error "Input capture is disabled because LOOPAUTOMA_BACKEND=fake. Remove that override to use the OS-level recorder."
     - If compiled without `os-linux-input` feature: Returns error "This build was compiled without the os-linux-input backend. Rebuild with --features os-linux-input..."
   - **Duplicate check:** If input capture already running, returns success immediately (idempotent)
   - **Backend initialization:**
     - Creates `InputCapture` backend (X11 XInput2 + XKB on Linux)
     - Validates X11 libraries available, returns error if missing: "Input capture backend is missing. On Ubuntu 24.04 install the X11 dev packages..."
   - **Event stream setup:**
     - Creates event callback that emits to Tauri event channel `loopautoma://input_event`
     - Starts capture thread (background, non-blocking)
     - Stores capture handle in `AppState.authoring.input_capture`
5. Frontend state updates:
   - `recording` → true
   - `recordingRef.current` → true
   - Button text changes to "Stop"
   - "Recording" chip appears
   - `onStart?.()` callback invoked
6. Event listener active: Begins receiving `InputEvent` payloads

**Success Criteria:**
- Recording starts within 500ms
- "Recording" chip visible
- Button changes to "Stop" state
- No error messages
- Timeline starts showing events immediately when input occurs
- System-wide capture active (events captured from all applications)

**Error Cases:**
- **Web-only mode:** Command fails, error displayed "Unable to start input capture" (requires desktop mode)
- **Fake backend:** Error displayed "Input capture is disabled because LOOPAUTOMA_BACKEND=fake..."
- **Missing X11 libraries:** Error displayed with installation instructions from doc/developer.md
- **Already recording:** Idempotent success, no duplicate capture thread
- **XInput2 initialization fails:** Error displayed "Make sure the X11/XKB libraries are installed...and that the app is running in an X11 session."

**Platform Requirements:**
- **Linux (Ubuntu 24.04):** X11 session required, Wayland not supported for input capture
- **Required packages:** libx11-dev, libxext-dev, libxi-dev, libxtst-dev, libxkbcommon-x11-dev
- **Build flag:** Must compile with `--features os-linux-input`
- **macOS/Windows:** Not yet implemented (Phase 5)

---

### 3.3 Recording Active State

#### 3.3.1 Event Capture and Timeline Display
**State:** Recording active, user interacting with desktop

**Captured Events:**

**Mouse Events:**
- **Button Down (Click):**
  - Captured: Button type (Left/Right/Middle), coordinates (x, y)
  - Timeline display: "`<Button> click @ <x>,<y>`" (e.g., "Left click @ 450,320")
  - Stored event: `{ t: "click", button, x, y }`
  
- **Button Up (Release):**
  - Timeline display: "`<Button> release`" (e.g., "Left release")
  - Not stored in events array (only down triggers action)
  
- **Move:**
  - Captured but not displayed (too noisy for timeline)
  - Cursor position embedded in click events

- **Scroll:**
  - Timeline display: "`scroll Δ<x>,<y>`" (e.g., "scroll Δ0,-120")
  - Not currently converted to actions (scroll not implemented in ActionSequence)

**Keyboard Events:**
- **Plain Text Characters (no modifiers):**
  - Buffered: Character added to type buffer
  - Timeline display: `text "<char>"` (one entry per character)
  - Buffer flushed on: Non-text key, modifier key, buffer timeout, or stop recording
  - Stored event: `{ t: "type", text: "<accumulated chars>" }` (one event for consecutive chars)
  
- **Modifier Keys (Ctrl/Alt/Meta) + Key:**
  - Type buffer flushed immediately
  - Timeline display: `key <key>` (e.g., "key Control+C")
  - Stored event: `{ t: "key", key: "<key>" }`
  
- **Special Keys (Enter, Escape, Tab, etc.):**
  - Type buffer flushed immediately
  - Timeline display: `key <key>` (e.g., "key Enter")
  - Stored event: `{ t: "key", key: "<key>" }`

**Timeline Behavior:**
- **Scrolling:** Shows last 20 events, auto-scrolls to bottom
- **Live updates:** New events appear immediately (aria-live="polite")
- **Persistence:** Timeline persists until cleared or recording stopped
- **Clear button:** Clears timeline display only, does not affect recorded events

**Event Counter:**
- Updates in real-time: "X recorded step(s)"
- Counts stored events (not raw timeline entries)
- Type events count as 1 regardless of character count

**Success Criteria:**
- Events appear in timeline within 100ms of user action
- Timeline scrolls smoothly, no visual lag
- Type buffer coalesces consecutive characters into single events
- Special keys and modifier combinations captured accurately
- Event counter matches stored events array length

---

### 3.4 Stopping Input Recording

#### 3.4.1 Stop Button (Recording Active)
**Trigger:** User clicks "Stop" button while recording

**Expected Sequence:**
1. Button click calls `toggleRecording()` callback (recording=true branch)
2. `stopRecording()` callback invoked:
   - `recordingRef.current` → false (stops event processing)
   - Tauri command invoked: `stop_input_recording()`
   - Backend (`src-tauri/src/lib.rs::stop_input_recording`):
     - Locks `AppState.authoring.input_capture` mutex
     - If capture handle exists:
       - Calls `capture.stop()` to terminate background thread
       - Removes handle from state (`guard.take()`)
     - If no capture handle: Returns success (idempotent)
   - Type buffer flushed (any pending characters converted to type event)
   - `recording` → false
   - `onStop?.(eventsRef.current)` callback invoked with final events array
3. UI state updates:
   - Button text changes to "Record"
   - "Recording" chip disappears
   - Timeline frozen at final state
   - "Save as ActionSequence" button enabled (if events > 0)

**Success Criteria:**
- Recording stops within 200ms
- Final type buffer flushed (no lost characters)
- Button returns to "Record" state
- Timeline shows complete event history
- Event counter reflects final total
- Backend capture thread terminates cleanly

**Error Cases:**
- Backend command fails: Logged to console ("stop_input_recording failed"), recording state clears regardless (graceful degradation)
- Type buffer flush fails: Unlikely, but characters may be lost
- Callback invocation fails: Recording stops but parent component not notified

#### 3.4.2 Automatic Stop on Component Unmount
**Trigger:** Component unmounts while recording (e.g., user navigates away, app quits)

**Expected Sequence:**
1. React cleanup effect runs
2. Event listener unsubscribed
3. If `recording` still true:
   - No explicit stop command sent (backend thread continues until app exit)
   - Memory leak potential if component remounts before app restart

**Design Note:** Current implementation does not automatically stop recording on unmount. Backend capture thread persists until explicit `stop_input_recording()` call or app exit. This is acceptable for single-window app but may need improvement for multi-profile workflows.

---

### 3.5 Saving Recorded Actions

#### 3.5.1 Save as ActionSequence Button
**Trigger:** User clicks "Save as ActionSequence" button after recording

**Prerequisites:**
- Recording stopped (button disabled while recording)
- Events array not empty (button disabled if 0 events)

**Expected Sequence:**
1. Button click calls `onSave?.(eventsRef.current)` callback
2. Parent component receives `RecordingEvent[]` array
3. Events converted to ActionConfig via `toActions()` helper:
   - **Click event** → Two actions:
     1. `{ type: "MoveCursor", x, y }`
     2. `{ type: "Click", button }`
   - **Type event** → `{ type: "Type", text }`
   - **Key event** → `{ type: "Key", key }`
4. ActionConfig array appended to profile's ActionSequence
5. Profile persisted via `profilesSave()`
6. Recording state optionally cleared (implementation-dependent)

**Success Criteria:**
- Actions appear in profile's ActionSequence immediately
- Coordinate-based actions use absolute screen positions
- Text preserved verbatim (no encoding issues)
- Profile saves to backend successfully
- Button re-enabled for next recording session

**Error Cases:**
- Parent callback missing: Button click does nothing (graceful degradation)
- Profile save fails: Error displayed by parent component, actions may be lost
- Conversion fails: Invalid events silently skipped (logged to console)

---

### 3.6 Input Recording Limitations

#### 3.6.1 Current Limitations
- **Platform:** Linux X11 only; Wayland and macOS/Windows not supported (Phase 5)
- **Scroll events:** Captured but not converted to actions (no Scroll action type)
- **Mouse move:** Not recorded (only click positions)
- **Drag operations:** Not explicitly supported (recorded as button down + move + button up, but move not captured)
- **Multi-monitor:** Coordinates are global but not monitor-aware (may fail on complex layouts)
- **Key combinations:** Modifier state captured but playback fidelity depends on Automation backend
- **Text input methods:** Only direct keyboard input; IME (Input Method Editor) not supported

#### 3.6.2 Security and Privacy
- **System-wide capture:** Records input from ALL applications, not just Loop Automa
- **No visual indicator:** No system tray icon or overlay indicates recording is active (privacy risk)
- **Sensitive data:** Passwords and private information captured verbatim in type events
- **No filtering:** No option to exclude specific applications or windows
- **Event persistence:** Recorded events stored in component state until save or discard (memory-only, not persisted to disk until saved to profile)

#### 3.6.3 Performance Considerations
- **Background thread:** Capture runs in separate thread, minimal impact on UI responsiveness
- **Event rate:** High-frequency events (mouse move) ignored to prevent memory bloat
- **Timeline limit:** Only last 20 events displayed, older events discarded from timeline (not from events array)
- **Memory usage:** Unbounded events array growth (no limit on recording duration)

---

### 3.7 Error Handling (Recording-Specific)

#### 3.7.1 Start Recording Errors
**Display:** Red alert box with role="alert" above timeline

**Common Errors:**
1. **Fake backend active:**
   - Message: "Input capture is disabled because LOOPAUTOMA_BACKEND=fake. Remove that override to use the OS-level recorder."
   - Resolution: Unset environment variable, restart app
   
2. **Missing build feature:**
   - Message: "This build was compiled without the os-linux-input backend. Rebuild with --features os-linux-input..."
   - Resolution: Rebuild with `cargo build --features os-linux-input`
   
3. **X11 libraries missing:**
   - Message: "Input capture backend is missing. On Ubuntu 24.04 install the X11 dev packages listed in doc/developer.md..."
   - Resolution: Install required packages, rebuild app
   
4. **Wayland session:**
   - Message: "Make sure...the app is running in an X11 session."
   - Resolution: Switch to X11 session (logout, select X11 at login screen)
   
5. **Web-only mode:**
   - Message: "Unable to start input capture"
   - Resolution: Use desktop mode (`bun run tauri dev` or packaged app)

**Success Criteria:**
- Error message displayed immediately on start failure
- Recording button remains enabled (user can retry)
- Error message specific enough to guide resolution
- Error clears on next successful start attempt

#### 3.7.2 Stop Recording Errors
- Generally silent (logged to console only)
- Recording state clears regardless of backend success
- No user-facing error (graceful degradation)

---

### 3.8 Accessibility (Recording-Specific)

#### 3.8.1 Keyboard Navigation
- Record/Stop button: Tab-accessible, Enter/Space to activate
- Save button: Tab-accessible, Enter/Space to activate
- Clear button: Tab-accessible, Enter/Space to activate

#### 3.8.2 Screen Reader Support
- Timeline: aria-live="polite" announces new events as they arrive
- Recording chip: Announces "Recording" state change
- Event counter: Announces count updates
- Error alerts: role="alert" for immediate announcement

#### 3.8.3 Visual Indicators
- "Recording" chip: Red background, clear visual distinction
- Button state: "Record" vs "Stop" text, color change
- Save button: Disabled state clearly visible (grayed out)
- Timeline scrolling: Auto-scroll provides visual feedback

---

### 3.9 Testing Scenarios (Input Recording)

#### 3.9.1 Happy Path
1. User clicks Record → recording starts, chip appears
2. User clicks, types text, presses special keys
3. Timeline updates in real-time with 20 most recent events
4. User clicks Stop → recording stops, events finalized
5. User clicks Save → actions added to profile
6. Profile saved successfully

#### 3.9.2 Error Scenarios
1. Start recording in web-only mode → error displayed
2. Start recording with LOOPAUTOMA_BACKEND=fake → specific error message
3. Start recording without X11 libraries → installation guidance
4. Start recording twice → second attempt succeeds immediately (idempotent)
5. Stop recording without starting → succeeds silently (idempotent)

#### 3.9.3 Edge Cases
1. Record → close app without stopping → backend thread cleans up on exit
2. Record → unmount component → listener unsubscribed but backend continues
3. Record → type very fast → type buffer coalesces characters correctly
4. Record → press modifier keys rapidly → flush timing correct
5. Record 1000+ events → memory usage acceptable, save works

---

## 4. Error Handling Principles

### 3.1 General Error Display
- Errors shown in red alert boxes with role="alert"
- Error messages user-friendly (not raw stack traces)
- Errors dismissible or auto-clear on next action
- Console.error for developer debugging, user-facing message for UI

### 3.2 Network/Backend Failures
- Tauri command failures caught and displayed
- User can retry operation (buttons remain functional)
- Graceful degradation (e.g., missing thumbnail shows placeholder)

### 3.3 Web-Only Mode Limitations
- Region capture requires Tauri desktop mode
- Attempting region capture in web mode shows error immediately
- Quit button behavior documented in console (not an error)

---

## 4. Accessibility Requirements

### 4.1 Keyboard Navigation
- All buttons keyboard accessible (tab order logical)
- Escape key cancels region overlay (documented)
- Enter key submits pending region form
- Focus visible on all interactive elements

### 4.2 Screen Reader Support
- ARIA labels on icon buttons (theme toggles)
- aria-live regions for status updates
- Role="alert" on errors
- Role="status" on empty states
- Alt text on all images (thumbnails include region name/id)

### 4.3 Visual Indicators
- Button states clearly visible (hover, active, disabled)
- Loading states shown with text changes ("Refreshing…")
- Running state chip visible when monitor active
- Error styling distinct from normal content

---

## 5. Performance Requirements

### 5.1 Response Times
- Button clicks respond within 100ms (visual feedback)
- Quit completes within 2s (Tauri mode)
- Region overlay opens within 500ms
- Thumbnail capture completes within 3s
- Region selection drag updates at 60fps minimum

### 5.2 Resource Management
- Overlay window resources cleaned up on close
- Thumbnails stored in component state (not persisted in profile JSON by default)
- No memory leaks from repeated overlay open/close cycles
- Multiple rapid clicks don't create multiple overlays

---

## 6. Multi-Monitor Support

### 6.1 Overlay Coverage
- Overlay spans all connected monitors
- Fullscreen window covers primary monitor or virtual desktop (OS-dependent)

### 6.2 Coordinate Transformation
- Selection coordinates transformed to global screen space
- Accounts for monitor position offset (outer position)
- Accounts for device pixel ratio (scale factor)
- Supports negative monitor coordinates (multi-monitor with offset)

### 6.3 Thumbnail Capture
- Backend captures from global screen coordinates
- Works correctly across monitor boundaries
- Handles mixed DPI scenarios (different scale factors per monitor)

---

## 7. Testing Strategy

### 7.1 Unit Tests (Existing)
- Component rendering and state management
- Event handler logic
- Coordinate transformation functions
- Error boundary behavior

### 7.2 Integration Tests (Existing)
- Tauri command invocation mocking
- Event emission and handling
- Profile save/load round-trips

### 7.3 E2E Tests (To Be Added in Stabilization Phase)
- Full quit workflow (desktop mode)
- Full region capture workflow (happy path)
- Region capture cancel scenarios
- Error recovery scenarios
- Multi-region management
- Thumbnail refresh workflow

---

## 8. Known Limitations (Current Implementation)

### 8.1 Web-Only Mode
- Region capture not functional (requires desktop)
- Quit button logs message only (cannot close tab)
- Input recording not functional (requires desktop)

### 8.2 Desktop Mode
- Overlay may not cover all monitors on some Linux window managers
- Thumbnail capture may fail if screen capture backend unavailable
- Quit during monitor execution stops abruptly (no graceful shutdown)

### 8.3 Cross-Platform
- macOS and Windows backends not yet implemented (Phase 5)
- Current implementation tested on Ubuntu/X11 only

---

## 9. Future Enhancements (Out of Scope)

- Drag-to-reorder regions in list
- Region templates/presets
- Region grouping/tagging
- Annotation/notes on regions
- Region preview overlay (highlight on screen)
- Graceful monitor shutdown before quit
- Undo/redo for region operations

---

## Review Notes

**Review Date:** 2025-11-14  
**Reviewer:** [To be filled]  
**Status:** Awaiting approval

**Questions for Reviewer:**
1. Is the quit behavior acceptable (immediate exit without monitor stop)?
2. Should we add confirmation dialog before quit when monitor is running?
3. Is auto-generated region ID format (`region-<timestamp36>`) acceptable?
4. Should thumbnail capture be retried automatically on failure?
5. Maximum number of regions per profile (unlimited currently)?

**Next Steps After Approval:**
1. Add this document to required reading in AGENTS.md
2. Create E2E test plan in PLANS.md (Stabilization Phase)
3. Implement E2E tests using Playwright or equivalent
4. Update architecture.md with any contract clarifications
5. Document any behavioral changes discovered during E2E implementation
