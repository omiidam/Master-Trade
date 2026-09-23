/**
 * The release baseline cannot lie.
 *
 * `docs/release-baseline.json` is a claim: this build passed these gates, at these counts, with the
 * trading boundary closed and nothing deployed. A checkpoint that nothing checks is worse than no
 * checkpoint, because it goes stale silently and is then quoted as evidence.
 *
 * So the file is asserted against the code it describes rather than trusted:
 *
 *   - the safety flags must agree with `DEFAULT_CONFIG` and with `resolveConfig()`, which are the
 *     values the server would actually boot with;
 *   - a deployment must not be claimed while `deployed` is false — the honesty rule that matters
 *     most, because a fabricated "verified in production" is how a foundation gets handed over with
 *     a hole in it;
 *   - the width list must be the one the browser suite claims to test, so the two cannot drift.
 *
 * It is deliberately offline: it reads two committed files and one module, and needs no browser.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, resolveConfig } from '../src/core/config.js';

interface Baseline {
  productFoundation: string;
  phase: string;
  branch: string;
  validatedAgainst: string;
  gates: {
    unitAndIntegration: { files: number; tests: number; status: string };
    browserE2E: { files: number; tests: number; status: string };
    audit: { all: number; production: number };
    [gate: string]: unknown;
  };
  responsiveMatrix: {
    pages: number;
    widths: number[];
    horizontalOverflow: number;
    touchTargetsBelowMinimum: number;
    clippedTextElements: number;
  };
  publicDemo: { deployed: boolean; reason: string };
  safety: {
    liveTradingEnabled: boolean;
    brokerExecutionEnabled: boolean;
    autonomousOrderPlacement: boolean;
  };
}

const baseline = JSON.parse(readFileSync('docs/release-baseline.json', 'utf8')) as Baseline;
const browserSuite = readFileSync('tests/browser/e2e.test.ts', 'utf8');

describe('the release baseline', () => {
  it('is a complete checkpoint rather than a partial one', () => {
    expect(baseline.productFoundation).toContain('5.1');
    expect(baseline.phase).toBe('5.10');
    expect(baseline.branch).toBe('main');
    // The commit the validation was performed against. The SHA of the commit that
    // introduces this file cannot be written into the file, which the file says itself.
    expect(baseline.validatedAgainst).toMatch(/^[0-9a-f]{40}$/);

    expect(baseline.gates.unitAndIntegration.status).toBe('pass');
    expect(baseline.gates.browserE2E.status).toBe('pass');
    expect(baseline.gates.unitAndIntegration.tests).toBeGreaterThan(0);
    expect(baseline.gates.browserE2E.tests).toBeGreaterThan(0);

    // Every gate `npm run validate` runs is recorded, so a new gate cannot be added to the
    // release path and left out of the checkpoint that describes it.
    for (const gate of [
      'format',
      'typecheckBackend',
      'typecheckFrontend',
      'buildBackend',
      'buildWeb',
      'desktopVerify',
    ]) {
      expect(baseline.gates[gate], `${gate} is missing from the baseline`).toBe('pass');
    }
  });

  it('records the dependency audit as clean in both scopes', () => {
    // Production scope being clean is the claim that matters; the development scope is
    // recorded because a vulnerable dev-only toolchain is still a way into a build.
    expect(baseline.gates.audit.all).toBe(0);
    expect(baseline.gates.audit.production).toBe(0);
  });

  it('records the trading boundary as closed, and agrees with the code', () => {
    expect(baseline.safety.liveTradingEnabled).toBe(false);
    expect(baseline.safety.brokerExecutionEnabled).toBe(false);
    expect(baseline.safety.autonomousOrderPlacement).toBe(false);

    // Both the declared default and the resolved configuration, because the guarantee is
    // about what the server boots with and not only about what the type permits.
    expect(DEFAULT_CONFIG.safety.liveTradingEnabled).toBe(false);
    expect(DEFAULT_CONFIG.safety.brokerExecutionEnabled).toBe(false);
    expect(resolveConfig().safety.liveTradingEnabled).toBe(false);
    expect(resolveConfig().safety.brokerExecutionEnabled).toBe(false);
  });

  it('does not claim a deployment that does not exist', () => {
    // If this ever starts failing because `deployed` became true, that is the signal to run
    // the public-demo validation Phase 5.10 could not perform — not to loosen the test.
    expect(baseline.publicDemo.deployed).toBe(false);
    expect(baseline.publicDemo.reason.length).toBeGreaterThan(40);
    expect(baseline.publicDemo.reason).toMatch(/no public deployment/i);
  });

  it('describes the responsive commitment as met, not as intended', () => {
    expect(baseline.responsiveMatrix.horizontalOverflow).toBe(0);
    expect(baseline.responsiveMatrix.touchTargetsBelowMinimum).toBe(0);
    expect(baseline.responsiveMatrix.clippedTextElements).toBe(0);
    expect(baseline.responsiveMatrix.pages).toBe(14);
    expect(baseline.responsiveMatrix.widths).toContain(375);
    expect(baseline.responsiveMatrix.widths).toContain(1920);
  });

  it('measures the widths the browser suite actually renders', () => {
    // The two lists are independent files, so this is the assertion that keeps them the
    // same list: a width dropped from the suite must be dropped from the claim.
    for (const width of baseline.responsiveMatrix.widths) {
      expect(browserSuite, `the suite does not render ${width}px`).toContain(`[${width}, `);
    }
  });
});
