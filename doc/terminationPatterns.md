# Intelligent Termination Patterns for Loopautoma

**Date:** 2025-11-19  
**Status:** Design Document

This document defines the complete intelligent termination system for Loopautoma automation profiles. Profiles no longer run indefinitely—they stop automatically when the task is complete, an error occurs, or a timeout is reached.

## Table of Contents

<!-- TOC -->
- [Overview](#overview)
- [Termination Signals](#termination-signals)
  - [AI Task Completion](#ai-task-completion)
  - [OCR Pattern Matching](#ocr-pattern-matching)
  - [Guardrail Limits](#guardrail-limits)
  - [Heartbeat Watchdog](#heartbeat-watchdog)
  - [TerminationCheck Action](#terminationcheck-action)
- [Structured AI Response Schema](#structured-ai-response-schema)
- [OCR Integration (uni-ocr)](#ocr-integration-uni-ocr)
- [Audio Notifications](#audio-notifications)
- [Configuration](#configuration)
- [Implementation Architecture](#implementation-architecture)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
<!-- /TOC -->

## Overview

Loopautoma profiles can now terminate intelligently based on multiple concurrent signals:

1. **AI Task Completion** — LLM analyzes screen content and returns `task_complete: true`
2. **OCR Pattern Matching** — Offline OCR detects success/failure keywords in specified regions
3. **Guardrail Limits** — Max runtime, max activations, consecutive failures, action timeout
4. **Heartbeat Watchdog** — Detects stuck loops (Airflow pattern)
5. **TerminationCheck Action** — Explicit action to inspect context/OCR/AI and decide termination

All signals are composable—any one can trigger termination. Profiles emit detailed events and play audio notifications for user awareness.

## Termination Signals

### AI Task Completion

**How it works:**
1. Profile includes `LLMPromptGeneration` action with `task_completion_check: true`
2. LLM receives screen regions and analyzes task progress
3. LLM returns structured JSON with `task_complete: boolean` and `task_complete_reason: string`
4. If `task_complete == true`, monitor stops gracefully

**Use cases:**
- Long-running AI agent tasks (e.g., "research topic and write report")
- Multi-step workflows where completion criteria are fuzzy
- Tasks where visual indicators are complex (not simple text patterns)

**Pros:**
- Handles complex completion logic
- Adapts to changing UI layouts
- Can understand context and nuance

**Cons:**
- Requires OpenAI API key and credits
- Higher latency (~2-5s per check)
- May misinterpret completion in edge cases

**Example:**
```json
{
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["output-panel"],
      "risk_threshold": 0.5,
      "task_completion_check": true,
      "completion_prompt": "Has the task finished successfully? Look for completion messages or final outputs."
    }
  ]
}
```

### OCR Pattern Matching

**How it works:**
1. Profile specifies `ocr_region_ids` and `ocr_termination_pattern` in guardrails
2. On each tick, monitor extracts text from specified regions using uni-ocr
3. Regex pattern is matched against extracted text
4. If match found, monitor stops with `ocr_pattern_matched` reason

**Use cases:**
- Waiting for "Done", "Complete", "Success" messages
- Detecting error dialogs ("Error", "Failed", "Exception")
- Monitoring build/test output for completion indicators

**Pros:**
- Offline and instant (no API calls)
- Deterministic and reliable for known text patterns
- Low latency (~100-500ms per extraction)

**Cons:**
- Requires precise regex patterns
- OCR accuracy depends on font/contrast
- Cannot understand semantic context

**Example:**
```json
{
  "guardrails": {
    "ocr_region_ids": ["status-bar"],
    "ocr_termination_pattern": "(Done|Complete|Success|Finished)",
    "success_keywords": ["Done", "Success"],
    "failure_keywords": ["Error", "Failed", "Exception"]
  }
}
```

### Guardrail Limits

**How it works:**
1. Monitor tracks runtime, activation count, consecutive failures, action duration
2. On each tick, checks against configured limits
3. If any limit exceeded, emits `WatchdogTripped` event and stops

**Guardrail types:**
- `max_runtime_ms` — Stop after N milliseconds of total runtime
- `max_activations_per_hour` — Limit action sequences per hour
- `max_consecutive_failures` — Stop after N failed action sequences in a row
- `action_timeout_ms` — Stop if single action takes longer than N milliseconds
- `cooldown_ms` — Minimum time between action sequences

**Use cases:**
- Preventing runaway loops
- Enforcing resource limits
- Detecting repeated failures

**Example:**
```json
{
  "guardrails": {
    "max_runtime_ms": 3600000,
    "max_activations_per_hour": 120,
    "max_consecutive_failures": 5,
    "action_timeout_ms": 30000,
    "cooldown_ms": 5000
  }
}
```

### Heartbeat Watchdog

**How it works:**
1. Monitor tracks `last_action_progress` timestamp
2. Each action in sequence updates this timestamp
3. If no progress for `heartbeat_timeout_ms`, watchdog trips
4. Emits `WatchdogTripped { reason: "heartbeat_stalled" }` and stops

**Use cases:**
- Detecting stuck actions (e.g., waiting for UI that never appears)
- Catching infinite loops in action logic
- Monitoring long-running external processes

**Inspired by:** Apache Airflow's task heartbeat mechanism

**Example:**
```json
{
  "guardrails": {
    "heartbeat_timeout_ms": 60000
  }
}
```

If no action completes or updates progress for 60 seconds, monitor stops.

### TerminationCheck Action

**How it works:**
1. Profile includes explicit `TerminationCheck` action in sequence
2. Action inspects:
   - ActionContext variables (e.g., `$iteration_count`, `$last_error`)
   - OCR text from specified regions
   - AI query response (optional)
3. If termination condition matches, sets `context.should_terminate = true`
4. ActionSequence stops early and monitor terminates

**Check types:**
- `context` — Inspect context variables with logic expression
- `ocr` — Extract text and match regex
- `ai_query` — Ask LLM if task is complete

**Use cases:**
- Mid-sequence termination logic
- Combining multiple signals (context + OCR + AI)
- Custom termination logic beyond guardrails

**Example:**
```json
{
  "actions": [
    { "type": "Type", "text": "check status" },
    { "type": "Key", "key": "Enter" },
    {
      "type": "TerminationCheck",
      "check_type": "ocr",
      "ocr_region_ids": ["result-panel"],
      "termination_condition": "(?i)(complete|finished|done)"
    },
    { "type": "Type", "text": "continue" }
  ]
}
```

If OCR finds "complete", sequence stops at TerminationCheck and skips remaining actions.

## Structured AI Response Schema

All LLM calls return JSON with this exact schema:

```typescript
{
  continuation_prompt: string | null,
  continuation_prompt_risk: number,  // 0.0-1.0
  task_complete: boolean,
  task_complete_reason: string | null
}
```

### Fields

**`continuation_prompt`**
- Text to use for next iteration if task not complete
- `null` if task is complete or no continuation needed
- Stored in `ActionContext` for subsequent actions

**`continuation_prompt_risk`**
- Risk level (0.0-1.0) of the continuation prompt
- Same scale as existing risk assessment
- Allows monitoring/logging of risk over time

**`task_complete`**
- `true` if task is finished (success or failure)
- `false` if more work remains
- Triggers monitor termination if `true`

**`task_complete_reason`**
- Human-readable explanation of why task is complete
- Examples: "All tests passed", "Build failed with errors", "User confirmed completion"
- Logged in termination event

### Retry Logic

If LLM returns invalid JSON:
1. Retry with correction prompt (max 3 attempts)
2. Fallback to keyword parsing:
   - Scan for: `DONE`, `COMPLETE`, `FINISHED`, `TASK_COMPLETE` → `task_complete: true`
   - Scan for: `CONTINUE`, `NEXT`, `MORE_WORK` → `task_complete: false`
   - Extract continuation text after these keywords
3. If all fails, log error and continue (don't terminate)

### Example LLM System Prompt

```
You are monitoring a desktop automation task. Analyze the screen regions provided and determine:
1. Is the task complete? (Look for completion messages, final outputs, or error states)
2. If not complete, what should happen next?

Return ONLY a JSON object:
{
  "continuation_prompt": "<text for next action, or null if complete>",
  "continuation_prompt_risk": <0.0-1.0>,
  "task_complete": <true|false>,
  "task_complete_reason": "<explanation if complete, or null>"
}

Examples:
- Task complete: {"continuation_prompt": null, "continuation_prompt_risk": 0.0, "task_complete": true, "task_complete_reason": "Build succeeded, all tests passed"}
- Task continuing: {"continuation_prompt": "click Run Tests button", "continuation_prompt_risk": 0.2, "task_complete": false, "task_complete_reason": null}
```

## OCR Integration (uni-ocr)

### Why uni-ocr?

- **Offline** — No external API calls, works without internet
- **Fast** — 100-500ms per region on modern hardware
- **Accurate** — Tesseract-based, handles English well
- **Cross-platform** — Works on Linux, macOS, Windows

### Configuration

```rust
// In Guardrails
ocr_region_ids: Vec<String>,        // Which regions to scan
success_keywords: Vec<String>,       // Terminate successfully if found
failure_keywords: Vec<String>,       // Terminate with failure if found
ocr_termination_pattern: Option<String>, // General regex pattern
```

### Caching Strategy

- Cache OCR results for 1 second per region
- Invalidate cache if region hash changes
- Use `parking_lot::RwLock` for thread-safe caching
- Threaded extraction to avoid blocking monitor loop

### Example Usage

```rust
let ocr_capture = LinuxOCRCapture::new()?;
let text = ocr_capture.extract_text(&region)?;

// Check for patterns
if success_regex.is_match(&text) {
    context.should_terminate = true;
    context.termination_reason = Some("success_keyword_matched".to_string());
}
```

### OCR Accuracy Tips

1. **High contrast regions** — White text on dark background or vice versa
2. **Large fonts** — Min 12pt for reliable extraction
3. **Clean fonts** — Sans-serif (Arial, Helvetica) better than serif
4. **Avoid overlays** — No semi-transparent UI elements
5. **Stable regions** — Wait for UI to fully render before OCR

## Audio Notifications

### Notification Types

**1. User Intervention Needed**
- Triggered by: Watchdog trips, OCR failure keywords, max consecutive failures, heartbeat stall
- Sound: Urgent alarm tone (500ms duration, 3 beeps)
- Purpose: Alert user that automation needs attention

**2. Profile Ended**
- Triggered by: Graceful termination (task_complete=true, success keywords, max_runtime reached)
- Sound: Completion chime (300ms duration, pleasant tone)
- Purpose: Notify user that profile finished successfully

### Implementation (rodio)

```rust
pub struct AudioNotifier {
    _stream: rodio::OutputStream,
    stream_handle: rodio::OutputStreamHandle,
    intervention_sound: Vec<u8>,
    completed_sound: Vec<u8>,
    enabled: bool,
    volume: f32,
}

impl AudioNotifier {
    pub fn play_intervention_needed(&self) {
        if self.enabled {
            let cursor = std::io::Cursor::new(self.intervention_sound.clone());
            let source = rodio::Decoder::new(cursor).unwrap();
            self.stream_handle.play_raw(source.amplify(self.volume).convert_samples());
        }
    }
    
    pub fn play_profile_ended(&self) {
        if self.enabled {
            let cursor = std::io::Cursor::new(self.completed_sound.clone());
            let source = rodio::Decoder::new(cursor).unwrap();
            self.stream_handle.play_raw(source.amplify(self.volume).convert_samples());
        }
    }
}
```

### Settings Storage

Audio preferences stored in secure storage (OS keyring):
- `audio_enabled`: boolean (default: true)
- `audio_volume`: float 0.0-1.0 (default: 0.7)

### UI Controls

Settings panel includes:
- Enable/disable toggle
- Volume slider (0-100%)
- "Test Intervention Sound" button
- "Test Completion Sound" button

## Configuration

### Profile Schema Extensions

```typescript
type Profile = {
  // ... existing fields ...
  guardrails?: {
    // Existing
    max_runtime_ms?: number;
    max_activations_per_hour?: number;
    cooldown_ms: number;
    
    // New termination fields
    action_timeout_ms?: number;
    heartbeat_timeout_ms?: number;
    max_consecutive_failures?: number;
    success_keywords?: string[];
    failure_keywords?: string[];
    ocr_termination_pattern?: string;
    ocr_region_ids?: string[];
  };
};

type ActionConfig = 
  // ... existing types ...
  | {
      type: "TerminationCheck";
      check_type: "context" | "ocr" | "ai_query";
      context_vars?: string[];
      ocr_region_ids?: string[];
      termination_condition: string;
      ai_query_prompt?: string;
    };
```

### Validation Rules

- At least one termination condition recommended (warning if none)
- `success_keywords` and `failure_keywords` are regex patterns
- `ocr_termination_pattern` must be valid regex
- `action_timeout_ms` must be > 0
- `heartbeat_timeout_ms` should be >= 10000 (10s minimum)
- `max_consecutive_failures` should be >= 3

## Implementation Architecture

### Rust Traits

```rust
// OCR extraction
pub trait OCRCapture: Send + Sync {
    fn extract_text(&self, region: &Region) -> Result<String, String>;
    fn extract_text_cached(&self, region: &Region) -> Result<String, String>;
}

// Audio notifications
pub trait AudioNotifier: Send + Sync {
    fn play_intervention_needed(&self);
    fn play_profile_ended(&self);
    fn set_volume(&mut self, volume: f32);
    fn set_enabled(&mut self, enabled: bool);
}
```

### Monitor Flow

```
Monitor.tick()
  ├─ Check max_runtime → WatchdogTripped?
  ├─ Check heartbeat_timeout → WatchdogTripped?
  ├─ Trigger.should_fire() → TriggerFired?
  ├─ Check cooldown → skip?
  ├─ Condition.evaluate() → ConditionEvaluated
  ├─ Check OCR regions for keywords → terminate?
  ├─ Check max_activations_per_hour → WatchdogTripped?
  ├─ ActionSequence.run()
  │   ├─ For each action:
  │   │   ├─ Check action_timeout → timeout?
  │   │   ├─ Execute action
  │   │   ├─ Update heartbeat timestamp
  │   │   ├─ If TerminationCheck: inspect + set should_terminate
  │   │   └─ Check context.should_terminate → stop early?
  │   └─ Return success/failure
  ├─ If LLM action returned task_complete=true → terminate
  ├─ Track consecutive failures → max_consecutive_failures?
  ├─ Play audio if termination occurred
  └─ Emit events
```

### Event Types

```rust
pub enum Event {
    // ... existing events ...
    TerminationCheckTriggered { reason: String },
    TaskCompleted { reason: String },
    OCRPatternMatched { pattern: String, text: String },
    HeartbeatStalled { elapsed_ms: u64 },
}
```

## Examples

### Example 1: AI-Driven Build Monitoring

```json
{
  "name": "Monitor CI Build",
  "regions": [
    {"id": "build-log", "rect": {"x": 100, "y": 200, "width": 1200, "height": 600}},
    {"id": "status", "rect": {"x": 100, "y": 850, "width": 400, "height": 100}}
  ],
  "trigger": {"type": "IntervalTrigger", "check_interval_sec": 30},
  "condition": {"type": "RegionCondition", "consecutive_checks": 1, "expect_change": true},
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["build-log", "status"],
      "risk_threshold": 0.5,
      "task_completion_check": true,
      "completion_prompt": "Check if build is complete. Look for 'BUILD SUCCESS' or 'BUILD FAILURE' messages."
    }
  ],
  "guardrails": {
    "max_runtime_ms": 1800000,
    "heartbeat_timeout_ms": 120000,
    "success_keywords": ["BUILD SUCCESS"],
    "failure_keywords": ["BUILD FAILURE", "ERROR", "FAILED"]
  }
}
```

### Example 2: OCR-Based Test Runner

```json
{
  "name": "Run Tests Until Complete",
  "regions": [
    {"id": "test-output", "rect": {"x": 50, "y": 100, "width": 1400, "height": 800}}
  ],
  "trigger": {"type": "IntervalTrigger", "check_interval_sec": 5},
  "condition": {"type": "RegionCondition", "consecutive_checks": 2, "expect_change": false},
  "actions": [
    {"type": "Type", "text": "continue"},
    {"type": "Key", "key": "Enter"},
    {
      "type": "TerminationCheck",
      "check_type": "ocr",
      "ocr_region_ids": ["test-output"],
      "termination_condition": "(?i)(all tests passed|\\d+ passed, 0 failed)"
    }
  ],
  "guardrails": {
    "max_runtime_ms": 3600000,
    "action_timeout_ms": 10000,
    "ocr_region_ids": ["test-output"],
    "success_keywords": ["all tests passed", "0 failed"],
    "failure_keywords": ["failed", "error", "exception"]
  }
}
```

### Example 3: Heartbeat-Monitored Data Processing

```json
{
  "name": "Process Data Queue",
  "regions": [
    {"id": "queue-status", "rect": {"x": 800, "y": 50, "width": 400, "height": 100}}
  ],
  "trigger": {"type": "IntervalTrigger", "check_interval_sec": 10},
  "condition": {"type": "RegionCondition", "consecutive_checks": 3, "expect_change": false},
  "actions": [
    {"type": "Click", "x": 900, "y": 500, "button": "Left"},
    {"type": "Key", "key": "Enter"}
  ],
  "guardrails": {
    "max_runtime_ms": 7200000,
    "heartbeat_timeout_ms": 60000,
    "max_consecutive_failures": 5,
    "ocr_region_ids": ["queue-status"],
    "success_keywords": ["Queue Empty", "All items processed"]
  }
}
```

## Best Practices

### 1. Always Set Multiple Termination Conditions

Don't rely on a single signal. Combine:
- Max runtime (safety net)
- OCR patterns (fast, deterministic)
- AI completion (handles complexity)
- Heartbeat watchdog (catches stuck loops)

### 2. Tune Timeouts Carefully

- `action_timeout_ms`: 2-5x typical action duration
- `heartbeat_timeout_ms`: 2-3x longest expected action
- `max_runtime_ms`: 2x expected total duration
- `cooldown_ms`: Long enough to avoid flapping (5-10s)

### 3. Test OCR Patterns Thoroughly

Use the "Test OCR" button in UI to preview extracted text. Refine regex patterns based on actual results.

### 4. Use AI Sparingly

AI checks are slower and cost money. Use for complex completion logic, not simple pattern matching.

### 5. Monitor Audio Notification Volume

Start with 70% volume and adjust based on environment. Too loud is disruptive, too quiet is missed.

### 6. Log Termination Reasons

Always check Event Log after profile stops. Termination reason helps debug unexpected stops.

### 7. Combine Success and Failure Keywords

Don't just detect success—also detect failures. Early termination on error saves time and resources.

### 8. Set Realistic Max Consecutive Failures

3-5 is typical. Too low causes premature termination on transient errors. Too high wastes time on permanent failures.

## Troubleshooting

### Profile Never Terminates

**Symptoms:** Profile runs until manually stopped, ignores termination conditions

**Causes:**
1. No termination conditions configured
2. OCR regions don't contain expected text
3. AI never returns `task_complete: true`
4. Heartbeat timeout too long

**Solutions:**
- Add at least `max_runtime_ms` as safety net
- Test OCR extraction with "Test OCR" button
- Review LLM completion prompt for clarity
- Reduce `heartbeat_timeout_ms` to 30-60s

### Profile Terminates Too Early

**Symptoms:** Profile stops before task is complete

**Causes:**
1. OCR false positive (matches unintended text)
2. AI misinterprets completion
3. Action timeout too short
4. Heartbeat timeout too aggressive

**Solutions:**
- Make OCR patterns more specific (add context)
- Improve AI completion prompt with examples
- Increase `action_timeout_ms` for slow actions
- Increase `heartbeat_timeout_ms` to 60-120s

### Audio Notifications Don't Play

**Symptoms:** No sound when profile terminates

**Causes:**
1. Audio disabled in settings
2. Volume set to 0%
3. System audio muted
4. Sound files missing or corrupted

**Solutions:**
- Check Settings → Audio Notifications → Enabled
- Increase volume slider to 50-100%
- Unmute system audio
- Use "Test Sound" buttons to verify playback

### OCR Returns Empty or Garbled Text

**Symptoms:** OCR extraction fails or returns nonsense

**Causes:**
1. Region too small (font < 12pt)
2. Low contrast (text blends with background)
3. Complex fonts or cursive
4. Region contains graphics, not text

**Solutions:**
- Enlarge region to capture larger text area
- Choose high-contrast regions (white on black)
- Target regions with sans-serif fonts
- Verify region with thumbnail capture first

### Heartbeat Watchdog Trips Immediately

**Symptoms:** Profile stops with "heartbeat_stalled" after first tick

**Causes:**
1. `heartbeat_timeout_ms` too short
2. Actions don't update heartbeat timestamp
3. First action is very slow

**Solutions:**
- Increase `heartbeat_timeout_ms` to 60000+ (60s)
- Verify ActionSequence.run() updates `last_action_progress`
- Add delay before first action if needed

### AI Returns Invalid JSON

**Symptoms:** Error logs show "Failed to parse LLM JSON response"

**Causes:**
1. LLM returning markdown code blocks
2. LLM adding explanation text
3. LLM returning partial JSON

**Solutions:**
- Retry logic automatically strips markdown and retries
- Improve system prompt: "Return ONLY JSON, no explanation"
- Fallback keyword parsing should handle most cases
- Check Event Log for fallback activation

## Performance Considerations

### OCR Extraction

- **Latency:** 100-500ms per region
- **CPU:** Moderate (uni-ocr uses Tesseract)
- **Memory:** ~10-50MB per region during extraction
- **Recommendation:** Limit to 2-3 OCR regions per profile

### AI Completion Checks

- **Latency:** 2-5s per API call (network + inference)
- **Cost:** ~$0.01-0.05 per call (depends on image size)
- **Recommendation:** Check every 60-120s, not every tick

### Audio Notifications

- **Latency:** <50ms to start playback
- **CPU:** Minimal (rodio handles async playback)
- **Memory:** ~1-2MB for loaded sounds
- **Recommendation:** No performance impact

### Heartbeat Tracking

- **Latency:** <1ms per update
- **CPU:** Negligible (single timestamp write)
- **Memory:** 8 bytes per Monitor
- **Recommendation:** Always enable, no performance cost

---

**Last Updated:** 2025-11-19  
**Version:** 1.0.0  
**Authors:** Loopautoma Contributors
