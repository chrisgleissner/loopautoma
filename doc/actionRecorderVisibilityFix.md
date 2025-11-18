# Action Recorder Visibility Fix

## Problem

When clicking "Record Actions", the entire app disappeared and no screenshot overlay appeared. The user had to force-kill the app with `kill -9`.

## Root Cause

The Action Recorder component was being rendered **inside** the `RecordingBar` component, which is part of the main window's DOM tree. When the Tauri command `action_recorder_show()` hides the main window, the entire React component tree (including the Action Recorder) becomes invisible.

**Previous architecture:**
```
App.tsx (main window)
  └─ RecordingBar.tsx
      └─ ActionRecorder.tsx (conditionally rendered here)
```

When the main window was hidden, the Action Recorder vanished with it.

## Solution

Lifted the Action Recorder state to `App.tsx` and render it as an **independent overlay** at the top level, outside the main content hierarchy. This ensures the Action Recorder remains visible even when the main window content is hidden.

**New architecture:**
```
App.tsx
  ├─ <main> (main content, can be hidden)
  │   └─ RecordingBar.tsx (just a button now)
  └─ <ActionRecorder /> (independent overlay, always rendered when showActionRecorder is true)
```

## Changes Made

### 1. Updated `RecordingBar.tsx`

**Before:** RecordingBar managed Action Recorder state and conditionally rendered it
**After:** RecordingBar is just a button that triggers a callback

```typescript
// Old: RecordingBar managed everything
export function RecordingBar(props: {
  onStop?: (events: RecordingEvent[]) => void;
}) {
  const [showRecorder, setShowRecorder] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  // ...
  if (showRecorder && screenshot) {
    return <ActionRecorder ... />;
  }
  return <button>Record Actions</button>;
}

// New: RecordingBar just triggers callback
export function RecordingBar(props: {
  onOpenRecorder?: () => void;
}) {
  return <button onClick={() => props.onOpenRecorder?.()}>Record Actions</button>;
}
```

### 2. Updated `App.tsx`

**Added state variables:**
```typescript
const [showActionRecorder, setShowActionRecorder] = useState(false);
const [actionRecorderScreenshot, setActionRecorderScreenshot] = useState<string | null>(null);
```

**Updated RecordingBar usage:**
```typescript
<RecordingBar
  onOpenRecorder={async () => {
    const screenshotData = await actionRecorderShow();
    setActionRecorderScreenshot(screenshotData);
    setShowActionRecorder(true);
  }}
/>
```

**Added Action Recorder overlay at App level:**
```tsx
return (
  <>
    <main>
      {/* All existing content */}
    </main>

    {/* Action Recorder - independent overlay */}
    {showActionRecorder && actionRecorderScreenshot && (
      <ActionRecorder
        screenshot={actionRecorderScreenshot}
        onComplete={async (actions) => {
          // Save actions to profile
          setShowActionRecorder(false);
        }}
        onCancel={() => {
          setShowActionRecorder(false);
        }}
      />
    )}
  </>
);
```

## Why This Fixes It

1. **Independent rendering:** Action Recorder is now a **sibling** to `<main>`, not a child
2. **Always in DOM:** When `showActionRecorder` is true, the overlay is rendered regardless of main window visibility
3. **Proper overlay semantics:** Action Recorder is now truly a full-screen overlay that sits "above" the main content

## Testing

To verify the fix:

```bash
bun run tauri dev
```

Expected behavior:
1. Click "📹 Record Actions"
2. Main window content hides (but window stays open)
3. **Action Recorder appears as full-screen overlay with screenshot**
4. Can click on screenshot to record actions
5. Click "Done" to save actions and return to main view

The key difference: the Action Recorder overlay should now **remain visible** when the main window is hidden, because it's rendered independently at the top level of the App component tree.
