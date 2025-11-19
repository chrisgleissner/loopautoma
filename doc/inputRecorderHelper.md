# Input Recorder Helper

This utility mirrors the production Linux input recorder so you can confirm keyboard and mouse capture without launching the full Tauri UI.

## Usage

```bash
cd src-tauri
cargo run --bin input_recorder
```

Workflow:

1. Press Enter to start recording.
2. Interact with the desktop (type text, move the mouse, click buttons).
3. Press Enter again to stop recording.
4. After a 5-second delay the helper prints a condensed summary, e.g.

```text
keyboard: hello world[Enter]
mouse: x=100, y=200, left click
```

If the helper reports an error, verify the same prerequisites required by the main app:

- X11 session (not Wayland) with `DISPLAY` set
- Required X11/XInput packages installed (see `doc/developer.md`)
- `LOOPAUTOMA_BACKEND` unset or not equal to `fake`
- Build includes the `os-linux-automation` feature (enabled by default)
