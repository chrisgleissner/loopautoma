# Agent Instructions for loopautoma

This repository is optimized for long‑running, largely autonomous LLM work across tools (Codex CLI, GitHub Copilot, Cursor, and others).

If you are an LLM agent working in this repo:

- Treat this file as required reading before you write or edit code.
- Obey these instructions together with any system/developer prompts from your host tool. If they conflict, system‑level instructions win.
- Prefer acting directly (editing files, running tests, updating plans) over merely suggesting code.

## Required reading order

Before making non‑trivial changes, you must read or skim, in this order:

1. `README.md` — high‑level overview and entry points.
2. `doc/architecture.md` — core contracts and intended design.
3. `doc/rollout-plan.md` — phases, acceptance gates, and coverage expectations.
4. `doc/developer.md` — local setup, commands, and troubleshooting.
5. `PLANS.md` — current multi‑hour task plan and history (see below).

Re‑open `PLANS.md` whenever you start a new user request or resume work after a pause.

## Multi‑hour planning (`PLANS.md`)

This repo uses the PLANS pattern from the OpenAI Cookbook article “Using PLANS.md for multi‑hour problem solving”.

As an agent:

- Always open `PLANS.md` when you start working.
- For each substantial user request, create or update a **Task** section in `PLANS.md` rather than keeping the plan only in transient memory.
- Maintain a concrete, checklist‑style plan there (phases/steps, not just prose), and keep it in sync with your actual work.
- Append short progress updates to the relevant task as you complete steps; do not silently diverge from the written plan.
- When you finish a task, clearly mark it as completed in `PLANS.md` and record any follow‑ups or known gaps.

`PLANS.md` is the shared memory for multi‑hour problem solving. Prefer editing it incrementally over rewriting large sections.

## Persistence and autonomy

When responding to a user request in this repo:

- Default to **persistent, end‑to‑end execution**: keep going until the request is fully implemented, tested where reasonable, and reflected in documentation or `PLANS.md`.
- Do **not** stop early just because you hit an uncertainty; instead, make the most reasonable assumption you can, based on the docs and code, and record that assumption in `PLANS.md` (or in your plan tool) for later adjustment.
- Avoid asking the user to clarify edge cases unless the environment explicitly requires it. Prefer to decide, act, and document.
- Use the host tool’s planning mechanisms (e.g., explicit plan/execute phases, task lists, or planning tools like `update_plan`) alongside `PLANS.md`.
- Prioritize high‑leverage actions (tests, small refactors, doc updates) that move the codebase closer to the documented architecture and rollout plan.

Always stay within the safety and capability constraints of your host environment (e.g., sandboxing, network, approvals).

## Coding conventions

- Keep changes minimal and focused on the current task; avoid broad refactors unless explicitly requested or clearly required by the architecture.
- Match the existing style in each language:
  - Rust: idiomatic 2021 edition, small focused modules, no unnecessary generics. Favor traits and contracts already defined in `doc/architecture.md`.
  - TypeScript/React: idiomatic Vite + React; keep components small and composable; respect existing testing patterns in `tests/*.vitest.tsx`.
- Do not add copyright or license headers.
- Do not introduce new top‑level tools or frameworks without a strong justification aligned with `doc/architecture.md` and `doc/rollout-plan.md`.

### Documentation conventions

- **All new documentation files must be placed in the `doc/` folder** and use camelCase filenames (e.g., `doc/releaseBuildValidation.md`, not `RELEASE_BUILD_VALIDATION.md` or `doc/release-build-validation.md`).
- Exception: `README.md` in the root follows standard naming.
- When creating new documentation during task execution, always place it in `doc/` with camelCase naming.

### Testing and safety

- Prefer writing or updating tests alongside non‑trivial changes.
- Use the existing commands from `doc/developer.md` and `.github/copilot-instructions.md`:
  - UI tests: `bun test` (with coverage when appropriate).
  - Rust tests: `cargo test` from `src-tauri/`.
- When you cannot run tests (environment limits), reason carefully about edge cases and call them out in `PLANS.md` and your final summary.

## Tool‑specific notes

These notes are to help different tools discover and obey the same instructions:

- **GitHub Copilot (including Workspace/Agents)**:
  - Always read `.github/copilot-instructions.md` (which points back to this file and `PLANS.md`) before large changes.
  - For multi‑step work, keep `PLANS.md` in sync with any internal Copilot plan or workspace.
  - Important: Do not auto-serve Playwright HTML reports during `bun run test:e2e`. The HTML server blocks the terminal and your session. Our Playwright config sets `open: "never"`; if you need to view the report, run `bun run test:e2e:report` in a new terminal.
- **Cursor**:
  - Always obey `.cursorrules` in the repo root, which requires reading this file and `PLANS.md` before editing.
  - Keep Cursor’s inline “Plan” or “Agent” view consistent with `PLANS.md`.
- **Codex / Codex CLI / other terminal agents**:
  - Treat `AGENTS.md` and `PLANS.md` as required reading before starting a task.
  - Use explicit plan/execute cycles, and reflect each major step in `PLANS.md` as a checklist item.

When in doubt about behavior, prefer:

1. Read relevant docs and existing tests.
2. Update `PLANS.md` with your intended approach.
3. Implement the smallest coherent slice.
4. Add or run tests.
5. Summarize changes and remaining work in `PLANS.md`.

