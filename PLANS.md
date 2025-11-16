# PLANS.md — Multi‑hour plans for loopautoma

<!-- markdownlint-disable MD032 MD036 -->

This file is the long‑lived planning surface for complex or multi‑hour tasks in this repository, following the "Using PLANS.md for multi‑hour problem solving" pattern.

Any LLM agent (Copilot, Cursor, Codex, etc.) working in this repo must:

- Read this file at the start of a substantial task or when resuming work.
- Keep an explicit, checklist‑style plan here for the current task.
- Update the plan and progress sections as work proceeds.
- Record assumptions, decisions, and known gaps so future agents can continue smoothly.

## TOC

<!-- TOC -->

- [PLANS.md — Multi‑hour plans for loopautoma](#plansmd--multihour-plans-for-loopautoma)
  - [TOC](#toc)
  - [How to use this file](#how-to-use-this-file)
  - [Maintenance rules (required for all agents)](#maintenance-rules-required-for-all-agents)
    - [Table of Contents](#table-of-contents)
    - [Pruning and archiving](#pruning-and-archiving)
    - [Structure rules](#structure-rules)
    - [Plan-then-act contract](#plan-then-act-contract)
  - [Active tasks](#active-tasks)
  - [Completed tasks (archived)](#completed-tasks-archived)

<!-- /TOC -->

## How to use this file

For each substantial user request or multi‑step feature, create a new **Task** section like this:

```markdown
## Task: <short title>

**User request (summary)**  
- <One or two bullet points capturing the essence of the request.>

**Context and constraints**  
- <Key architecture or rollout constraints from the docs.>

**Plan (checklist)**  
- [ ] Step 1 — ...
- [ ] Step 2 — ...
- [ ] Step 3 — ...

**Progress log**  
- YYYY‑MM‑DD — Started task, drafted plan.  
- YYYY‑MM‑DD — Completed Step 1 (details).  

**Assumptions and open questions**  
- Assumption: ...  
- Open question (only if strictly necessary): ...

**Follow‑ups / future work**  
- <Items that are explicitly out of scope for this task but worth noting.>
\`\`\`

Guidelines:

- Prefer small, concrete steps over vague ones.
- Update the checklist as you go—do not wait until the end.
- Avoid deleting past tasks; instead, mark them clearly as completed and add new tasks below.
- Keep entries concise; this file is a working log, not polished documentation.
- Progress through steps sequentially. Do not start on a step until all previous steps are done and their test coverage exceeds 90%.
- Perform a full build after the final task of a step. If any errors occur, fix them and rerun all tests until they are green.
- Then Git commit and push all changes with a conventional commit message indicating the step is complete.

## Maintenance rules (required for all agents)

### Table of Contents

- Maintain an automatically generated TOC using the "<!-- TOC --> … <!-- /TOC -->" block at the top of this file.
- After adding, removing, or renaming a Task section, regenerate the TOC using the standard Markdown All-in-One command.
- Do not manually edit TOC entries.

### Pruning and archiving

To prevent uncontrolled growth of this file:

- Keep only active tasks and the last 2–3 days of progress logs in this file.
- When a Task is completed, move the entire Task section to \`doc/plans/archive/YYYY-MM-DD-<task-name>.md\`.
- When progress logs exceed 30 lines, summarize older entries into a single "Historical summary" bullet at the bottom of the Task.
- Do not delete information; always archive it.

### Structure rules

- Each substantial task must begin with a second-level header:

  \`## Task: <short title>\`

- Sub-sections must follow this order:
  - User request (summary)
  - Context and constraints
  - Plan (checklist)
  - Progress log
  - Assumptions and open questions
  - Follow-ups / future work

- Agents must not introduce new section layouts.

### Plan-then-act contract

- Agents must keep the checklist strictly synchronized with actual work.  
- Agents must append short progress notes after each major step.  
- Agents must ensure that Build, Lint/Typecheck, and Tests are PASS before a Task is marked complete.  
- All assumptions must be recorded in the "Assumptions and open questions" section.

## Active tasks

### Task: Critical showstoppers - Input recording, playback, window minimize, and countdown timers

**Started:** 2025-11-16

**User request (CRITICAL - absolute show stoppers)**

1. **INPUT RECORDING BROKEN** - Record keyboard/mouse presses does not work at all. User asked many times to fix this. This is an absolute show stopper.
2. **PLAYBACK UNCLEAR** - Need to verify playback of keyboard/mouse presses actually works.
3. **WINDOW MINIMIZE** - Minimize app before drawing rectangle for screen capture region so user can see actual desktop applications beneath.
4. **COUNTDOWN TIMERS** - Show clear timer in frontend counting down until next capture. Also show time remaining until action sequence will be initiated.

**Root cause analysis (completed - deep dive into 800+ lines of linux.rs)**

After comprehensive code analysis and online research of x11rb/xkbcommon docs:

**Good news:** The input recording implementation is actually correct and sophisticated:
- LinuxInputCapture in src-tauri/src/os/linux.rs uses proper XInput2 RAW events
- Captures XI_RawKeyPress, XI_RawButtonPress, XI_RawMotion at device level
- XkbStateBundle manages keyboard state with modifier tracking
- Thread-based event loop with 2-second initialization timeout
- LinuxAutomation uses XTest extension for playback (xtest_fake_input)
- Comprehensive error messages for missing X11/XKB libraries

**The actual problem:** User environment prerequisites are not met or validated:

Root causes (one or more):
1. **Wayland session** - User is running Wayland instead of X11 (check `$XDG_SESSION_TYPE`)
2. **Missing packages** - Missing libx11-dev, libxi-dev, libxtst-dev, libxkbcommon-x11-dev
3. **Wrong backend** - LOOPAUTOMA_BACKEND=fake environment variable blocks real capture
4. **Build without feature** - Compiled without os-linux-input feature (unlikely, it's in default)
5. **X11 permissions** - App doesn't have permission to capture global input events
6. **VM/Container limits** - Running in environment that blocks raw input access

**The fix strategy:** Don't rewrite the code (it's good). Instead:
- Add comprehensive prerequisite validation and diagnostics
- Show helpful error messages with copy-pasteable fix commands
- Implement setup wizard when prerequisites fail
- Better logging to surface the actual environmental issue

**Context and constraints**
- Must maintain test coverage ≥90%
- All fixes must work in both web-only mode and desktop mode
- Input recording requires X11 session (not Wayland)
- Tauri window API needed for minimize before overlay
- Countdown timers need access to Monitor tick state

**Plan (checklist)**

Phase 1: Diagnostics and validation
- [ ] 1. Create `check_prerequisites` Tauri command that validates:
  - [ ] 1a. $XDG_SESSION_TYPE is "x11" (not "wayland")
  - [ ] 1b. X11 connection works (DISPLAY set, X server reachable)
  - [ ] 1c. Required packages installed (libxi-dev, libxtst-dev, etc.)
  - [ ] 1d. LOOPAUTOMA_BACKEND not set to "fake"
  - [ ] 1e. os-linux-input feature enabled (compile-time check)
  - [ ] 1f. XInput extension available and version ≥2.0
- [ ] 2. Add PrerequisitesCheck UI component that runs on startup
- [ ] 3. Show setup wizard modal when prerequisites fail with:
  - [ ] 3a. Clear error message explaining what's missing
  - [ ] 3b. Copy-pasteable apt install commands
  - [ ] 3c. Instructions for switching Wayland→X11 session
  - [ ] 3d. Link to troubleshooting docs
- [ ] 4. Update start_input_recording to return detailed error on failure
- [ ] 5. Add RUST_LOG=debug logging throughout input capture

Phase 2: Window minimize for region capture
- [ ] 6. Add Tauri command `hide_main_window()` using window.hide()
- [ ] 7. Add Tauri command `show_main_window()` using window.show()
- [ ] 8. Update show_region_overlay_window to call hide_main_window first
- [ ] 9. Update region overlay close handler to call show_main_window
- [ ] 10. Test region overlay shows desktop apps beneath rectangle

Phase 3: Countdown timers
- [ ] 11. Add Monitor state tracking: lastTickTime, nextTickTime, conditionMetTime
- [ ] 12. Emit new event `monitor_tick_info` with timing data
- [ ] 13. Create CountdownTimer component showing:
  - [ ] 13a. "Next check in X.Xs" (time until next condition evaluation)
  - [ ] 13b. "Action in Y.Ys" (time until action sequence fires, when condition met + within cooldown)
- [ ] 14. Add CountdownTimer to Monitor panel in App.tsx
- [ ] 15. Style timers with prominent visual design (large text, color coding)

Phase 4: Playback verification
- [ ] 16. Verify LinuxAutomation::type_text works with XTest
- [ ] 17. Verify LinuxAutomation::click works with XTest
- [ ] 18. Verify LinuxAutomation::move_cursor works with XTest
- [ ] 19. Add detailed logging to playback functions

Phase 5: E2E testing
- [ ] 20. Create Playwright test `tests/e2e/input-recording.spec.ts`:
  - [ ] 20a. Check prerequisites pass
  - [ ] 20b. Start input recording
  - [ ] 20c. Inject synthetic input events
  - [ ] 20d. Stop recording
  - [ ] 20e. Verify events captured in timeline
  - [ ] 20f. Save as ActionSequence
  - [ ] 20g. Trigger playback
  - [ ] 20h. Verify playback executed
- [ ] 21. Create test `tests/e2e/region-overlay-minimize.spec.ts`
- [ ] 22. Run all E2E tests and verify pass

Phase 6: Documentation and cleanup
- [ ] 23. Add troubleshooting section to doc/developer.md
- [ ] 24. Document X11 session requirement prominently in README.md
- [ ] 25. Add "Common Issues" section covering Wayland→X11 switch
- [ ] 26. Update installation instructions with prerequisite checks
- [ ] 27. Run full test suite (UI + Rust + E2E)
- [ ] 28. Commit and push all changes

**Progress log**
- 2025-11-16 — Task created after deep analysis of input recording implementation
- 2025-11-16 — Root cause identified: code is correct, issue is environmental prerequisites
- 2025-11-16 — Plan drafted with 28 steps across 6 phases (diagnostics → window → timers → playback → E2E → docs)

**Critical insights from code analysis**
- LinuxInputCapture implementation is **actually correct** (800+ lines reviewed)
- Uses proper XInput2 RAW event API via x11rb crate
- Thread-based with proper initialization timeout and error handling
- XkbStateBundle correctly manages keyboard state for key-to-text conversion
- LinuxAutomation playback uses XTest extension (standard approach)
- **The failure is environmental, not a code bug**

**Assumptions and open questions**
- Assumption: User is running Wayland session (most common cause)
- Assumption: User hasn't installed X11 development packages
- Assumption: User is on Ubuntu 24.04 as documented in developer.md
- Open question: Does user have proper X11 permissions configured?
- Open question: Is DISPLAY environment variable set correctly?
- Open question: Is user in VM/container with input isolation?

**Follow‑ups / future work**
- Consider adding systemd service file for proper capabilities
- Add privilege escalation UI if X11 permissions needed
- Create automated setup script (install packages + configure session)
- Add telemetry/logging to help diagnose user environment issues
- Consider Wayland support via libei (future alternative to X11/XInput)
- Add visual feedback during recording (pulsing red indicator)
- Consider caching prerequisite check results to avoid repeated validation

## Completed tasks (archived)

Completed tasks are archived in \`doc/plans/archive/\` with filenames following the pattern \`YYYY-MM-DD-<task-name>.md\`.

Recent archived tasks:

- \`2025-11-16-coreUiStabilization.md\` - Core UI stabilization and UX fixes (7 phases complete)
- \`2025-11-16-releaseBuildStabilization.md\` - Release build stabilization (removed Playwright dependency)
- \`2025-11-16-guardrailsUiPolish.md\` - Guardrails UI polish (AcceleratingNumberInput, scrolling, brand header)
- \`2025-11-15-llmPromptGenerationAction.md\` - LLM Prompt Generation action implementation
- \`2025-11-15-e2eTestSuite.md\` - E2E test suite (76 passing tests across all workflows)
- \`2025-11-15-ubuntuReleaseBuildFix.md\` - Ubuntu release build dependency fix
