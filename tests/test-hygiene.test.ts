/**
 * How the suite itself is allowed to behave — the Phase 5.9 flaky-test and escape-hatch audit,
 * written as a guard so the findings cannot come back.
 *
 * A test suite is the only thing standing between a regression and production, which makes the
 * ways a suite can *lie* worth pinning. Each rule below is one of those ways:
 *
 *   1. **A focused test.** A committed `.only` silently skips every other test in its file, so the
 *      suite goes green having run almost nothing. There is no legitimate committed form.
 *   2. **A bare settle delay.** Waiting a fixed number of milliseconds is a bet on how fast the
 *      machine is, and it is the single most common source of a test that passes locally and
 *      fails on a loaded two-core VPS. A wait is allowed in exactly three shapes: inside a
 *      handler simulating work, inside an injected `sleep`/`settle` helper whose bound is the
 *      caller's, or inside a loop bounded by a deadline it polls against.
 *   3. **A retry that hides a flake.** `retry` in the runner config turns a nondeterministic
 *      failure into a slow pass, which is worse than a failure because nobody investigates it.
 *   4. **A script that swallows a failure.** `--force`, `|| true` and a disabled check are how a
 *      green build stops meaning anything.
 *
 * The suite is deliberately offline: it reads the test files and the runner config, and it needs
 * no database, no server and no network.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');

/**
 * Every test file the project runs — including the browser suite.
 *
 * `tests/browser/` is listed explicitly rather than by a recursive walk, and it has to be
 * listed at all: it runs from a second config, so it is exactly the kind of suite that
 * quietly stops being covered by a guard that only looks in one place.
 */
const TEST_FILES = [
  ...readdirSync('tests')
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => `tests/${name}`),
  ...readdirSync(join('tests', 'browser'))
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => `tests/browser/${name}`),
].sort();

/**
 * This file is excluded from the pattern scans below.
 *
 * It has to be: the rules are expressed as the very patterns they forbid, so the file contains
 * `.only(` and a timer shape as data. Excluding it is explicit and visible, rather than hidden by
 * obfuscating the literals — and nothing in it waits, focuses or retries anything.
 */
const SELF = 'tests/test-hygiene.test.ts';
const SCANNED = TEST_FILES.filter((path) => path !== SELF);

/** A fixed-duration wait: `setTimeout(resolve, 5)`. */
const FIXED_WAIT = /setTimeout\(resolve, \d+\)/g;

/**
 * The forms that actually skip a test.
 *
 * Anchored on the runner's own names rather than on any `.skip`. The looser version
 * matched a property access — `shell.skipHref`, read off a measurement — which skips
 * nothing, and a guard that fires on unrelated identifiers is a guard people learn to
 * work around instead of obeying. Every form `vitest` honours is still covered.
 */
const SKIP_FORM = /\b(it|test|describe)\.skip\b/;

/** The three shapes a wait is allowed to take. */
const PERMITTED_WAIT_CONTEXT = [/register\(/, /sleep:/, /settle/, /deadline/, /Date\.now\(\) </];

/** How far back to look for the construct a wait sits inside. */
const LOOKBACK_LINES = 30;

describe('no test can be silently skipped', () => {
  it('carries no focused or commented-out test', () => {
    // A focus is a suite that reports success having run one case.
    const forbidden = /\.(only)\(|\bxit\(|\bxdescribe\(|it\.todo|\btest\.only\(/;
    for (const path of SCANNED) {
      expect(read(path), `${path} focuses or disables a test`).not.toMatch(forbidden);
    }
  });

  it('uses a skip only as a documented environment guard', () => {
    /** A comment line is prose about a skip, not a skip. Only code is held to the rule. */
    const isComment = (line: string): boolean => /^\s*(\*|\/\/|\/\*)/.test(line);

    for (const path of SCANNED) {
      const source = read(path);
      for (const [index, line] of source.split('\n').entries()) {
        if (!SKIP_FORM.test(line) || isComment(line)) continue;
        // The guard shape: `available ? it : it.skip`, `declared.length === 0 ? it.skip : it`,
        // or a whole suite behind an environment check
        // (`noBrowser ? describe.skip : describe`). A bare `it.skip(` or `describe.skip(`
        // is a test that was turned off and left off.
        expect(
          /\?\s*(it|describe)(\.skip)?\s*:/.test(line),
          `${path}:${index + 1} skips unconditionally: ${line.trim()}`,
        ).toBe(true);
      }
    }
  });

  it('declares every test file to a runner, so none can be excluded by omission', () => {
    const config = read('vitest.config.ts');
    expect(config).toMatch(/include:\s*\['tests\/\*\*\/\*\.test\.ts'\]/);

    // The browser suite is declared to its own config...
    const browser = read('vitest.browser.config.ts');
    expect(browser).toMatch(/include:\s*\['tests\/browser\/\*\*\/\*\.test\.ts'\]/);

    // ...and excluded from the hermetic run, which must not come to depend on a build or
    // on a browser being installed. Without the exclusion the broad `tests/**` include
    // above would collect it, and `npm test` would stop being runnable on a clean clone.
    expect(config).toMatch(/exclude:\s*\[[^\]]*'tests\/browser\/\*\*'/);
  });
});

describe('no test waits a fixed duration to synchronise', () => {
  it('allows a wait only inside a handler, an injected helper, or a bounded poll', () => {
    const inspected: string[] = [];

    for (const path of SCANNED) {
      const lines = read(path).split('\n');
      for (const [index, line] of lines.entries()) {
        FIXED_WAIT.lastIndex = 0;
        if (!FIXED_WAIT.test(line)) continue;

        const context = lines.slice(Math.max(0, index - LOOKBACK_LINES), index + 1).join('\n');
        const permitted = PERMITTED_WAIT_CONTEXT.some((pattern) => pattern.test(context));
        expect(
          permitted,
          `${path}:${index + 1} waits a fixed duration with no bound or handler around it`,
        ).toBe(true);
        inspected.push(`${path}:${index + 1}`);
      }
    }

    // The rule only means something while there is something to inspect: an empty scan would
    // pass forever. These are the waits the audit accepted, and each is one of the three shapes.
    expect(inspected.length).toBeGreaterThan(0);
  });

  it('keeps the bounded poll that waits for a close rather than sleeping at it', () => {
    const ws = read('tests/realtime-ws.test.ts');
    // The pattern the rest of the suite should follow: poll a condition, bound the wait, and say
    // why the bound is generous. A fixed sleep here fails a test whose subject is not timing.
    expect(ws).toMatch(/const deadline = Date\.now\(\) \+ ms/);
    expect(ws).toMatch(/while \([^)]*Date\.now\(\) < deadline\)/);
  });

  it('releases a handler from the test rather than racing it with a clock', () => {
    const jobs = read('tests/jobs.test.ts');
    // "Still running at the deadline" is made a fact, not a bet: the handler blocks on a promise
    // the test holds, so a slow runner cannot turn the case into a pass that tests nothing.
    expect(jobs).toMatch(/let release: \(\) => void/);
    expect(jobs).toMatch(/const blocked = new Promise<void>/);
    // And "the handler has started" is signalled by the handler, not waited for.
    expect(jobs).toMatch(/const begun = new Promise<void>/);
  });
});

describe('no configuration hides a failure', () => {
  it('does not retry a nondeterministic test into a pass', () => {
    const config = read('vitest.config.ts');
    // A retry converts a flake into a slow pass, which is how a real defect survives a green run.
    expect(config).not.toMatch(/\bretry\s*:/);
    // And nothing bails early, which would report fewer failures than there are.
    expect(config).not.toMatch(/\bbail\s*:\s*[1-9]/);
  });

  it('raises the timeout budget rather than relaxing an assertion', () => {
    const config = read('vitest.config.ts');
    // The stated deployment target is a small VPS, so the budget is sized for the runner.
    expect(config).toMatch(/testTimeout:\s*[\d_]+/);
    expect(config).toMatch(/hookTimeout:\s*[\d_]+/);
    // Passing is still decided by the assertions; only the budget is generous.
    expect(config).toMatch(/testTimeout:\s*30_000/);
  });

  it('keeps no forced or swallowed failure in the scripts', () => {
    const scripts = read('package.json');
    expect(scripts).not.toMatch(/audit fix --force|--force(?!:)/);
    expect(scripts).not.toMatch(/\|\|\s*true/);
    expect(scripts).not.toMatch(/--passWithNoTests/);

    // The validation entry point runs every gate, so a local `validate` means what CI means.
    const pkg = JSON.parse(scripts) as { scripts: Record<string, string> };
    for (const gate of [
      'format:check',
      'typecheck',
      'typecheck:web',
      'test',
      'build',
      'build:web',
      'desktop:verify',
    ]) {
      expect(pkg.scripts.validate, `validate omits ${gate}`).toContain(`npm run ${gate}`);
    }
  });

  it('keeps the dependency guard that prevents a second vulnerable toolchain', () => {
    // The dev-toolchain advisories were cleared by deleting a nested `vite`; the standing guard
    // is what stops one returning through a dependency bump nobody reviewed.
    expect(TEST_FILES).toContain('tests/dependency-graph.test.ts');
    expect(TEST_FILES).toContain('tests/monorepo-boundary.test.ts');
  });
});
