# perfBaseline

This note captures how we collect and track CPU / memory baselines for the Ubuntu/X11 MVP. The goals are:

1. Prove that the monitor loop stays within the guardrails (cooldown, maxRuntime, activations/hour).
2. Produce repeatable numbers we can compare across commits when throttling or safety work lands.
3. Provide a lightweight soak harness we can run headlessly in CI (fake backends) before moving to hardware-in-the-loop runs.

## Tooling

We added a tiny Rust binary, `soak_report`, that reuses the production `Monitor` + guardrails and loops through a configurable number of ticks using the fake capture/automation backends. It emits a JSON blob with the tick budget, guardrail trips, and activation counts, which lets us script longer runs or feed the output into dashboards.

> Binary location: `src-tauri/src/bin/soak_report.rs`

## Running the soak profiler

All commands assume you run from `src-tauri/` with fake backends to keep things deterministic:

```bash
cd src-tauri
LOOPAUTOMA_BACKEND=fake cargo run --bin soak_report -- --ticks 20000 --interval-ms 50 --cooldown-ms 50 --max-runtime-ms 2000
```

Sample output (guardrail hit intentionally early because max runtime is 2 s):

```json
{
  "tick_budget": 20000,
  "ticks_executed": 41,
  "activations": 38,
  "guardrail_trips": [
    "max_runtime"
  ],
  "error_events": [],
  "action_failures": 0,
  "runtime_ms_simulated": 2050
}
```

A longer run with a relaxed runtime limit and 200 ms cooldown shows steady-state behavior without tripping guardrails:

```bash
LOOPAUTOMA_BACKEND=fake cargo run --bin soak_report -- --ticks 2000 --interval-ms 50 --cooldown-ms 200 --max-runtime-ms 999999
```

```json
{
  "tick_budget": 2000,
  "ticks_executed": 2000,
  "activations": 500,
  "guardrail_trips": [],
  "error_events": [],
  "action_failures": 0,
  "runtime_ms_simulated": 100000
}
```

### Optional CPU/memory tracking

Use `/usr/bin/time -v` or `hyperfine` to record host metrics during a soak run:

```bash
cd src-tauri
/usr/bin/time -v LOOPAUTOMA_BACKEND=fake cargo run --bin soak_report -- --ticks 50000 --interval-ms 40 --cooldown-ms 200 --max-runtime-ms 999999
```

When running on real hardware (non-fake backends), launch the regular Tauri app, start the desired profile, and sample with `pidstat`/`psrecord` for 5+ minutes. Capture:

- Average CPU %
- Max RSS (MiB)
- Number of guardrail trips, if any

Store the raw output under `coverage/perf/` with the date so we can diff over time.

## Baseline matrix (Ubuntu 24.04, fake backends)

| Scenario | Interval ms | Cooldown ms | Max runtime ms | Tick budget | Ticks executed | Activations | Guardrail trips |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fast guardrail test | 50 | 50 | 2000 | 20,000 | 41 | 38 | `max_runtime` |
| Steady-state (no trip) | 50 | 200 | 999,999 | 2,000 | 2,000 | 500 | _none_ |
| CI hardware sample (fake backend) | 40 | 200 | 999,999 | 50,000 | 25,001 | 5,000 | `max_runtime` |

These runs finish in <2 s on CI hardware and now serve as the sanity threshold before we attempt longer hardware-in-the-loop soaks.

## Next steps

- Wire the binary into CI as an optional step so we keep producing JSON artifacts automatically.
- Extend the binary to output Prometheus-style counters once we add real backend metrics.
- Mirror the workflow on hardware by running the same command without `LOOPAUTOMA_BACKEND=fake` and logging `pidstat` output for the Tauri process.

## Hardware sample — 2025-11-15

To close Phase 2, we captured a longer soak on the actual CI host (still using the fake backend for deterministic pixels but measuring real CPU/RSS and guardrail behavior):

```bash
cd src-tauri
/usr/bin/time -v env LOOPAUTOMA_BACKEND=fake cargo run --quiet --bin soak_report -- \
  --ticks 50000 --interval-ms 40 --cooldown-ms 200 --max-runtime-ms 999999 \
  > ../coverage/perf/soak-hardware-2025-11-15.json \
  2> ../coverage/perf/soak-hardware-2025-11-15.time
```

Key results:

- Activations: 5,000 before the `max_runtime` guardrail tripped (as expected with a 1 000 ms cap).
- Simulated runtime: ~1,000,040 ms; ticks executed: 25,001.
- Host metrics (`/usr/bin/time -v`): user 2.47 s, system 0.84 s, elapsed 1.56 s, average CPU 212%, max RSS 1.31 GiB.

Raw artifacts live under `coverage/perf/` so future runs can diff against this baseline:

- `coverage/perf/soak-hardware-2025-11-15.json`
- `coverage/perf/soak-hardware-2025-11-15.time`

When real hardware backends are available, repeat the same command without `LOOPAUTOMA_BACKEND=fake` and capture `pidstat` output alongside `/usr/bin/time` for multi-minute intervals.
