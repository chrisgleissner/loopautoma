# Loop Automa — Gap Analysis (Regions, Conditions, Actions) performed after phase 2 and before phase 3

## Summary

- The current design already covers: rectangular Regions, a RegionCondition that detects visual stability, and ActionSequences recorded from real input via a RecordingBar.
- Linux/X11 backends fully support capture, automation, and recording; macOS and Windows currently provide capture only, with automation and recording still using stubs.
- Authoring UX is built around a full-screen region overlay, static thumbnails, and a RecordingBar timeline; these helpers are available but not yet fully aligned with the target cross‑platform story.

## Strengths

- Clear, JSON-based Profile model that binds Regions, IntervalTrigger, RegionCondition, and ActionSequence.
- RegionCondition implementation matches the intended semantics: “all watched regions unchanged for stable_ms”.
- RecordingBar converts InputEvent sequences into a portable series of MoveCursor/Click/Type/Key actions.
- Trait-based backends (ScreenCapture, Automation, InputCapture) keep the domain and UI independent of OS specifics.

## Gaps

- macOS and Windows lack concrete Automation and InputCapture implementations; action recording and replay are effectively Linux-only.
- Region cards show coordinates and thumbnails but not display identity; the architecture expects per-display reasoning.
- The region overlay is implemented for selection but not yet used to briefly highlight existing Regions for validation.
- Documentation for Tauri bridge commands and authoring helpers does not fully reflect the overlay + RecordingBar authoring model and cross‑platform goals.

## High-level tasks

- Complete Automation and InputCapture backends on macOS and Windows so recording and playback work consistently across OSes.
- Extend the region overlay to support a “highlight this Region” mode used from the Regions panel.
- Surface per‑display information in the Regions UI (e.g., “Display 1/2/3”) using ScreenCapture.displays().
- Align architecture and rollout docs with the implemented authoring flow and cross‑OS parity objectives.
