<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [PLANS.md — Multi-hour plans for loopautoma](#plansmd--multi-hour-plans-for-loopautoma)
  - [TOC](#toc)
  - [How to use this file](#how-to-use-this-file)
  - [Maintenance rules (required for all agents)](#maintenance-rules-required-for-all-agents)
    - [Table of Contents](#table-of-contents)
    - [Pruning and archiving](#pruning-and-archiving)
    - [Structure rules](#structure-rules)
    - [Plan-then-act contract](#plan-then-act-contract)
  - [Active tasks](#active-tasks)
    - [Task: Guardrails persistence regression in profilesSave](#task-guardrails-persistence-regression-in-profilessave)
    - [Task: CI Playwright hang on GitHub Actions](#task-ci-playwright-hang-on-github-actions)
    - [Task: Release build failures for tag 0.3.5](#task-release-build-failures-for-tag-035)
  - [Completed tasks (archived)](#completed-tasks-archived)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# PLANS.md — Multi-hour plans for loopautoma

This file is the long-lived planning surface for complex or multi-hour tasks in this repository, following the "Using PLANS.md for multi-hour problem solving" pattern.

Any LLM agent (Copilot, Cursor, Codex, etc.) working in this repo must:

- Read this file at the start of a substantial task or when resuming work.
- Keep an explicit, checklist-style plan here for the current task.
- Update the plan and progress sections as work proceeds.
- Record assumptions, decisions, and known gaps so future agents can continue smoothly.

## TOC

<!-- TOC -->

- [PLANS.md — Multi-hour plans for loopautoma](#plansmd--multihour-plans-for-loopautoma)
  - [TOC](#toc)
  - [How to use this file](#how-to-use-this-file)
    - [Table of Contents](#table-of-contents)
    - [Pruning and archiving](#pruning-and-archiving)
    - [Structure rules](#structure-rules)
    - [Plan-then-act contract](#plan-then-act-contract)
  - [Active tasks](#active-tasks)
    - [Task: Guardrails persistence regression in profilesSave](#task-guardrails-persistence-regression-in-profilessave)
    - [Task: CI Playwright hang on GitHub Actions](#task-ci-playwright-hang-on-github-actions)
    - [Task: Release build failures for tag 0.3.5](#task-release-build-failures-for-tag-035)
  - [Completed tasks (archived)](#completed-tasks-archived)

<!-- /TOC -->

## How to use this file

For each substantial user request or multi-step feature, create a new **Task** section like this:

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
- YYYY-MM-DD — Started task, drafted plan.  
- YYYY-MM-DD — Completed Step 1 (details).  

**Assumptions and open questions**  
- Assumption: ...  
- Open question (only if strictly necessary): ...

**Follow-ups / future work**  
- <Items that are explicitly out of scope for this task but worth noting.>
```

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
- When a Task is completed, move the entire Task section to `doc/plans/archive/YYYY-MM-DD-<task-name>.md`.
- When progress logs exceed 30 lines, summarize older entries into a single "Historical summary" bullet at the bottom of the Task.
- Do not delete information; always archive it.

### Structure rules

- Each substantial task must begin with a second-level header:

  `## Task: <short title>`

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

### Task: Guardrails persistence regression in profilesSave

**Started:** 2025-11-26

**User request (summary)**
- `bun run test:all` fails in `tests/guardrails-ui.vitest.tsx` because `guardrails.max_runtime_ms` is `undefined` after profile save.

**Context and constraints**
- Guardrails are part of the ProfilesConfig JSON contract (see `doc/architecture.md`); UI must persist cooldown, runtime, and activation limits.
- Follow repo instructions (AGENTS.md); `doc/rollout-plan.md` is referenced but currently absent.

**Plan (checklist)**
- [x] Inspect guardrails UI + persistence path to find why `max_runtime_ms` drops during save.
- [x] Implement fix ensuring guardrails fields round-trip through `profilesSave` and update any related defaults/types.
- [x] Run `bun run test:all` and ensure the guardrails test passes.

**Progress log**
- 2025-11-26 — Created plan and noted failing guardrails persistence test.
- 2025-11-26 — Traced guardrail updates to drafts being overwritten; merged drafts across updates so all guardrail fields persist between consecutive edits.
- 2025-11-26 — `bun run test:all` now green; guardrails UI test passes after merging draft guardrails between edits.

**Assumptions and open questions**
- `doc/rollout-plan.md` is missing; proceeding with available docs.

**Follow-ups / future work**
- None identified yet.

### Task: CI Playwright hang on GitHub Actions

**Started:** 2025-11-21

**User request (summary)**
- UI coverage step prints no test output and times out on CI.
- E2E coverage step hangs indefinitely on GitHub runners after Playwright/parallelism changes, while local `bun test:all` passes.

**Context and constraints**
- GitHub Actions uses `.github/workflows/build-and-test.yaml` inside the `ghcr.io/.../loopautoma-ci:latest` container (Bun-only) with `timeout` wrappers (300s UI, 600s E2E) and step timeouts (5m/10m).
- Playwright config starts `bun run dev:web` via `webServer` with `VITE_E2E_COVERAGE=1` and `PLAYWRIGHT_COVERAGE=1`; workers default to 1 on CI.
- Vitest coverage runs with dynamic worker count; tests live under `tests/**/*.vitest.*` and are invoked under `CI` env.

**Plan (checklist)**
- [x] Reproduce CI behavior locally with `CI=1` for `bun run test:ui:cov` and `bun run test:e2e:cov` (including timeout wrappers) to capture where runs stall.
- [x] Inspect workflow/test configs for timeouts, environment differences, and background processes; pinpoint root causes for UI silence and E2E hang.
- [x] Implement workflow/config fixes so UI and E2E coverage steps exit cleanly on GitHub Actions (adjust timeouts/reporters, ensure webServer shutdown, avoid swallowed failures).
- [ ] Validate with local CI-mode runs and document outcomes; prepare for a CI rerun if needed.

**Progress log**
- Historical summary — As of 2025-11-21, reproduced CI behavior locally, identified missing Node.js in CI container causing Playwright hang, added Node 22.x setup, and expanded disk/memory cleanup for coverage steps. Pending final validation run.

**Assumptions and open questions**
- `doc/rollout-plan.md` remains absent; continuing with available docs.
- Assuming Actions continue to run in the published CI container with Bun and no Node.js prior to the new install step.

**Follow-ups / future work**
- Rerun GitHub Actions after fixes and monitor runtime; tighten budgets further if needed.

### Task: Release build failures for tag 0.3.5

**Started:** 2025-11-26

**User request (summary)**
- `tauri-action` builds failed on macOS (both archs) and Linux due to TypeScript errors in `src/components/EventLog.tsx` during `bun run build:web`.
- PLANS.md has grown too large and needs cleanup per its own rules.

**Context and constraints**
- Build command: `bun run build:web` invoked from tauri-action before desktop builds; TypeScript errors must be resolved.
- Repo instructions require keeping docs in `doc/` with camelCase filenames; avoid broad refactors and keep changes focused.

**Plan (checklist)**
- [x] Fix the EventLog TypeScript errors so `bun run build:web` passes across targets.
- [x] Run `bun run test:all` to ensure guardrails regression stays fixed and UI tests stay green.
- [x] Trim `PLANS.md` to only active tasks and archive the prior content in `doc/plans/archive/`.

**Progress log**
- 2025-11-26 — Recorded CI failure details and cleanup requirement; plan drafted.
- 2025-11-26 — Fixed EventLog TypeScript exhaustiveness errors, restored missing `vite-plugin-istanbul` dependency, `bun run build:web` + `bun run test:all` now pass, and archived old tasks to `doc/plans/archive/nov26PlansArchive.md`.

**Assumptions and open questions**
- No additional CI failures beyond the reported EventLog TypeScript issues are known.

**Follow-ups / future work**
- Trigger tauri-action/tag build once local fixes verified.

## Completed tasks (archived)

- Older tasks and progress logs have been archived to `doc/plans/archive/nov26PlansArchive.md`.
