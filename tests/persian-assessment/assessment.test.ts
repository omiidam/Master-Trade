/**
 * The Persian language assessment runner.
 *
 * This suite does **not** assert that the Agent’s Persian is good — it is a diagnostic, and a low
 * score is data. What it asserts is that the measurement is trustworthy: the battery is deterministic,
 * every case id is present and unique, the scores are in range, and the recorded baseline still
 * matches the run. A change in the language layer that moves a score fails here, so the score is a
 * checkpoint a later pass diffs against rather than a number somebody typed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSESSMENT_CASES } from './cases.js';
import {
  ASSESSMENT_DIMENSIONS,
  ASSESSMENT_VERSION,
  DIMENSION_META,
  fingerprint,
  runAssessment,
} from './harness.js';

const ROOT = process.cwd();
const BASELINE = JSON.parse(
  readFileSync(join(ROOT, 'docs', 'persian-assessment-baseline.json'), 'utf8'),
) as {
  version: number;
  overall: number;
  totals: {
    samples: number;
    passed: number;
    partial: number;
    failed: number;
    points: number;
    max: number;
  };
  fingerprint: string;
  dimensions: {
    id: string;
    samples: number;
    passed: number;
    partial: number;
    failed: number;
    points: number;
    max: number;
    score: number;
  }[];
  cases: { id: string; verdict: string; observed: string }[];
};

const run = runAssessment(ASSESSMENT_CASES);

describe('the Persian language assessment battery', () => {
  it('runs the same battery twice and gets the same result', () => {
    const first = runAssessment(ASSESSMENT_CASES);
    const second = runAssessment(ASSESSMENT_CASES);
    expect(fingerprint(first)).toBe(fingerprint(second));
    expect(first.overall).toBe(second.overall);
  });

  it('gives every case a permanent, contiguous, unique id', () => {
    const ids = ASSESSMENT_CASES.map((test) => test.id);
    expect(new Set(ids).size).toBe(ids.length);
    const numbers = ids.map((id) => Number(id.replace('FA-', '')));
    expect(numbers).toEqual(Array.from({ length: ids.length }, (_, i) => i + 1));
    expect(ids[0]).toBe('FA-001');
  });

  it('covers all twelve dimensions the brief names', () => {
    expect(ASSESSMENT_DIMENSIONS.length).toBe(12);
    expect(DIMENSION_META.map((meta) => meta.id)).toEqual([...ASSESSMENT_DIMENSIONS]);
    for (const dimension of run.dimensions) {
      expect(dimension.samples, dimension.id).toBeGreaterThanOrEqual(1);
      expect(dimension.score, dimension.id).toBeGreaterThanOrEqual(0);
      expect(dimension.score, dimension.id).toBeLessThanOrEqual(100);
    }
  });

  it('keeps every case to a maximum of one point', () => {
    for (const test of run.cases) {
      expect(test.points, test.id).toBeGreaterThanOrEqual(0);
      expect(test.points, test.id).toBeLessThanOrEqual(test.max);
      expect(test.max, test.id).toBe(1);
    }
  });

  it('matches the recorded baseline instead of drifting from it', () => {
    expect(run.version).toBe(ASSESSMENT_VERSION);
    expect(BASELINE.version).toBe(ASSESSMENT_VERSION);
    expect(run.overall).toBe(BASELINE.overall);
    expect(run.totalSamples).toBe(BASELINE.totals.samples);
    expect(run.totalPassed).toBe(BASELINE.totals.passed);
    expect(run.totalPartial).toBe(BASELINE.totals.partial);
    expect(run.totalFailed).toBe(BASELINE.totals.failed);
    expect(run.totalPoints).toBe(BASELINE.totals.points);
    expect(run.totalMax).toBe(BASELINE.totals.max);
    expect(fingerprint(run)).toBe(BASELINE.fingerprint);
  });

  it('records the same per-dimension reading as the baseline', () => {
    for (const recorded of BASELINE.dimensions) {
      const observed = run.dimensions.find((dimension) => dimension.id === recorded.id);
      expect(observed, recorded.id).toBeDefined();
      expect(observed!.samples, recorded.id).toBe(recorded.samples);
      expect(observed!.passed, recorded.id).toBe(recorded.passed);
      expect(observed!.partial, recorded.id).toBe(recorded.partial);
      expect(observed!.failed, recorded.id).toBe(recorded.failed);
      expect(observed!.points, recorded.id).toBe(recorded.points);
      expect(observed!.max, recorded.id).toBe(recorded.max);
      expect(observed!.score, recorded.id).toBe(recorded.score);
    }
  });

  it('records the same verdict and evidence for every case', () => {
    for (const recorded of BASELINE.cases) {
      const observed = run.cases.find((test) => test.id === recorded.id);
      expect(observed, recorded.id).toBeDefined();
      expect(observed!.verdict, recorded.id).toBe(recorded.verdict);
      expect(observed!.observed, recorded.id).toBe(recorded.observed);
    }
  });

  it('separates the failed cases so the weaknesses are named, not hidden in an average', () => {
    const failed = run.cases.filter((test) => test.verdict !== 'pass');
    expect(failed.map((test) => test.id).sort()).toEqual(
      BASELINE.cases
        .filter((test) => test.verdict !== 'pass')
        .map((test) => test.id)
        .sort(),
    );
  });
});
