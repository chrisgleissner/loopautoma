# securityReview

This note captures the Phase 2 security and permissions review for the Ubuntu/X11 MVP. The focus is on the potentially dangerous authoring helpers (input synthesis, input capture) and the OS permissions they require.

## Goals

1. Prevent packaged builds from exposing dev-only helpers that can inject arbitrary input unless the operator *rebuilds* in a debug/dev configuration.
2. Document the minimal environment variables needed to exercise these helpers locally.
3. Clarify the OS-level permissions the app needs (X11 input, accessibility permissions on other OSes) so operators can review them before enabling unattended automation.

## Input-synthesis guardrails

The only commands that send synthetic input are `inject_mouse_event` and `inject_keyboard_event`. Both now share a single guard:

| Command | Default availability | Unlock steps | Error mode |
| --- | --- | --- | --- |
| `inject_mouse_event` | **Disabled** in all builds | Set `LOOPAUTOMA_ALLOW_INJECT=1` in the environment *and* run a debug/dev build (`bun run tauri dev`, `cargo test`, etc.). Release builds ignore the flag entirely. | Errors with *"inject_mouse_event is disabled in production builds"* when running a packaged binary, or *"Input injection commands are disabled"* when the env flag is missing. |
| `inject_keyboard_event` | Same as above | Same as above | Same as above |

Release detection happens inside `ensure_dev_injection_allowed`:

- Production builds (non-`debug_assertions`) always return an error before checking any env flags.
- Developers can simulate a production build locally by exporting `LOOPAUTOMA_TREAT_AS_RELEASE=1`; the guard then behaves as if the binary were packaged.
- Tests cover the following cases: missing flag, release mode with flag, and debug mode with flag.

## Dev ergonomics

- Set `LOOPAUTOMA_ALLOW_INJECT=1` only in shells where you need authoring helpers; do not bake it into `/etc/environment` or systemd units.
- When verifying release bundles, export `LOOPAUTOMA_TREAT_AS_RELEASE=1` before running the command from the repo. This mirrors how the packaged binary behaves without waiting for a full installer build.
- Error messages tell the operator exactly which doc to read (`doc/securityReview.md`) for remediation steps.

## Permissions checklist (Ubuntu/X11 MVP)

1. **X11 session** — the monitor loop, capture, and automation traits assume an X11 desktop (Wayland remains unsupported for MVP). Verify with:
   ```bash
   echo "$XDG_SESSION_TYPE"   # expect: x11
   ```
2. **X11 dev libraries installed** — required for compilation and runtime linking: `libx11-dev`, `libxext-dev`, `libxi-dev`, `libxtst-dev`, `libxkbcommon-x11-dev`, etc. (see `doc/developer.md`).
3. **Input access** — XTest/XInput2 require the user to run inside their own session. No extra sudo rights are needed; however, some desktop environments surface a system prompt the first time input automation is used. Confirm acceptance paths in `doc/install.md`.
4. **Fake backend for safe demos** — set `LOOPAUTOMA_BACKEND=fake` to force deterministic capture/automation stubs when demoing without explicit permission to control the host.

## Operational guidance

- Ship release bundles (CI artifacts, nightly builds) without `LOOPAUTOMA_ALLOW_INJECT`. End users would need to recompile the app in debug mode to enable developer helpers.
- Keep the `coverage/perf/` metrics so regressions can be spotted without re-enabling the helpers.
- When onboarding new operators, walk through this doc plus `doc/install.md` to ensure they understand what permissions the app holds and how to revoke them (Panic Stop, env flags, etc.).

Phase 2 exit criteria (“security basics” + permissions review) are now satisfied by:

1. Code-level guard that blocks input injection in production builds.
2. Documented runtime contract for the env flags and OS-level permissions.
3. Tests enforcing the guard behavior and developer instructions for simulating production locally.
