# Test Parallelism Configuration

## Overview

Both Vitest (unit tests) and Playwright (E2E tests) now support configurable parallelism to significantly speed up test execution.

## Default Behavior

### Local Development

- **Vitest:** Uses 75% of available CPU cores, max cores-1 (e.g., 6 workers on 8-core machine)
- **Playwright:** Uses 75% of available CPU cores for web tests, sequential for Tauri tests

### CI Environment

- **Vitest:** Uses 75% of available CPU cores
- **Playwright:** 2 workers for stability (web tests parallel, Tauri sequential)

## Configuration

### Environment Variables

| Variable | Scope | Default | Description |
|----------|-------|---------|-------------|
| `VITEST_MAX_WORKERS` | Vitest | 50% of CPU cores | Number of parallel threads for unit tests |
| `PLAYWRIGHT_WORKERS` | Playwright | 50% local, 1 CI | Number of parallel workers for E2E tests |

### Examples

```bash
# Run with default intelligent parallelism (75% of CPU cores)
bun test:all

# Run with maximum parallelism (all CPU cores)
VITEST_MAX_WORKERS=8 PLAYWRIGHT_WORKERS=8 bun test:all

# Run with conservative parallelism (2 workers each)
VITEST_MAX_WORKERS=2 PLAYWRIGHT_WORKERS=2 bun test:all

# Run with single worker (sequential, for debugging)
VITEST_MAX_WORKERS=1 PLAYWRIGHT_WORKERS=1 bun test:all
```

## NPM Scripts

| Script | Description | Parallelism |
|--------|-------------|-------------|
| `bun test:ui` | Run Vitest unit tests | Default (75% cores) |
| `bun test:ui:cov` | Run with coverage | Default (75% cores) |
| `bun test:ui:watch` | Watch mode | Default (75% cores) |
| `bun test:e2e` | Run Playwright E2E tests | Default (75% cores local, 2 CI) |
| `bun test:all` | Run all tests (UI then E2E) | Default for both |

## Playwright Project-Level Parallelism

### Web-Only Tests (`*.web.e2e.ts`)
- **Parallel:** Yes (fully parallel)
- **Reason:** Isolated browser contexts, no shared state
- **Workers:** Configurable via `PLAYWRIGHT_WORKERS`

### Tauri Desktop Tests (`*.tauri.e2e.ts`)
- **Parallel:** No (sequential execution)
- **Reason:** Shared app state, file system operations, single Tauri process
- **Workers:** Always 1 (enforced at project level)

## Performance Impact

### Baseline (Sequential - Historical)

```text
Unit Tests:    ~18s (1 worker)
E2E Tests:     ~48s (1 worker)
Total:         ~66s
```

### Optimized (Default - 6 workers on 8-core machine)

```text
Unit Tests:    ~11-13s (6 workers, 35-40% faster)
E2E Tests:     ~36-46s (web tests parallel, Tauri sequential)
Total:         ~47-59s (28-35% faster)
```

**Measured across 3 consecutive runs:**

- Run 1: 11.12s unit + 36.3s E2E = 47.4s total
- Run 2: 10.78s unit + 41.1s E2E = 51.9s total
- Run 3: 12.90s unit + 45.7s E2E = 58.6s total

**Note:** Actual speedup depends on:
- CPU core count and speed
- Test I/O vs CPU intensity
- Browser startup overhead (E2E tests)
- Test interdependencies

## When to Use Sequential Execution

Use `VITEST_MAX_WORKERS=1 PLAYWRIGHT_WORKERS=1` when:

1. **Debugging flaky tests:** Sequential execution makes timing issues easier to reproduce
2. **Low-resource environments:** Avoid overwhelming CPU/memory
3. **CI stability:** Some CI environments benefit from sequential execution
4. **Coverage accuracy:** Parallel execution shouldn't affect coverage, but sequential can help debug discrepancies

## Implementation Details

### Vitest Configuration

```typescript
// vitest.config.ts
import { availableParallelism } from "os";

const cpuCount = availableParallelism();
const maxWorkers = process.env.VITEST_MAX_WORKERS
  ? parseInt(process.env.VITEST_MAX_WORKERS, 10)
  : Math.max(1, Math.min(cpuCount - 1, Math.floor(cpuCount * 0.75)));

export default defineConfig({
  test: {
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: maxWorkers,
        minThreads: 1,
      },
    },
  },
});
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { availableParallelism } from 'os';

const cpuCount = availableParallelism();
const defaultWorkers = process.env.CI ? 2 : Math.max(1, Math.min(cpuCount - 1, Math.floor(cpuCount * 0.75)));
const maxWorkers = process.env.PLAYWRIGHT_WORKERS
  ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10)
  : defaultWorkers;

export default defineConfig({
  fullyParallel: true,
  workers: maxWorkers,
  projects: [
    {
      name: 'web-only-mode',
      fullyParallel: true,  // Parallel within project
    },
    {
      name: 'tauri-desktop-mode',
      fullyParallel: false, // Sequential within project
    },
  ],
});
```

## Troubleshooting

### Tests fail in parallel but pass sequentially

**Symptoms:** Intermittent failures, race conditions, "element not found" errors

**Solutions:**
1. Check for shared state between tests (localStorage, global variables)
2. Ensure proper cleanup in afterEach/afterAll hooks
3. Add explicit waitFor() for async operations
4. Use test.describe.serial() for dependent tests
5. Increase timeouts if needed

### Coverage reports are incomplete

**Symptoms:** Lower coverage in parallel mode than sequential

**Solutions:**
1. Coverage should be identical - this usually indicates a bug
2. Check that all test files are being discovered
3. Verify Istanbul instrumentation is working
4. Run `bun test:ui:cov` with `VITEST_MAX_WORKERS=1` to compare

### Out of memory errors

**Symptoms:** Tests crash with heap allocation failures

**Solutions:**
1. Reduce worker count: `VITEST_MAX_WORKERS=2`
2. Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096`
3. Check for memory leaks in tests (use vitest --reporter=verbose)

## Best Practices

1. **Start conservative:** Use defaults (50% cores) for everyday development
2. **Use fast mode for CI:** `test:all:fast` optimizes for speed when you need quick feedback
3. **Debug sequentially:** When investigating flakes, use single worker
4. **Monitor resources:** Watch CPU/memory usage to find optimal worker count
5. **Profile tests:** Use `bunx vitest --reporter=verbose` to identify slow tests

## Related Documentation

- **AGENTS.md:** Testing approach section
- **doc/developer.md:** Local setup and test commands
- **.github/copilot-instructions.md:** CI testing notes
- **vitest.config.ts:** Vitest parallelism implementation
- **playwright.config.ts:** Playwright parallelism implementation
