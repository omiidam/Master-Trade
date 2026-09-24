/**
 * The Phase 7 security stage, run through the end-of-Phase-6 harness.
 *
 * Phase 7 is a UI phase, so this stage is not a second red team: it is the *same* machinery pointed
 * at the surface Phase 7 built, with the same verdict rules — a refusal must be observed, an
 * escaping error is a failure, and every result renders as one machine-readable line so a later pass
 * can diff against this one.
 *
 * The end-of-Phase-6 gate and its 150 attacks are untouched by this file: `docs/security-gate-baseline.json`
 * keeps that checkpoint under its own keys, and this stage records its own under `phase7`. Two
 * checkpoints rather than one edited total, because the Phase 6 numbers are evidence about the Phase 6
 * tree and rewriting them to include later work would make them evidence of nothing.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAGE_11 } from './phase-07.js';
import { executeAttack, report, resultLine, stageGate, type AttackResult } from './harness.js';

const FIRST_ID = 151;
const REQUIRED = 12;

/** Executed once per run, in a deterministic order. */
let cache: AttackResult[] | null = null;

async function run(): Promise<AttackResult[]> {
  if (cache) return cache;
  const collected: AttackResult[] = [];
  for (const attack of STAGE_11) collected.push(await executeAttack(attack));
  cache = collected;
  return collected;
}

interface PhaseSevenBaseline {
  stage: number;
  title: string;
  totalAttacks: number;
  pass: number;
  fail: number;
  notApplicable: number;
  cleared: boolean;
  findings: { high: number; medium: number; fixed: number };
}

const baseline = JSON.parse(readFileSync('docs/security-gate-baseline.json', 'utf8')) as {
  phase7?: PhaseSevenBaseline;
  totalAttacks: number;
};

describe('Stage 11 — the presentation surface (Phase 7)', () => {
  it('executes the twelve attacks the stage declares', async () => {
    const results = await run();
    expect(results).toHaveLength(REQUIRED);
    expect(STAGE_11).toHaveLength(REQUIRED);
    for (const result of results) expect(result.stage).toBe(11);
  });

  it('continues the gate’s id sequence rather than reusing one', async () => {
    // The ids are permanent handles: the knowledge base cites SEC-161 for VULN-007 and SEC-162 for
    // VULN-008, so a renumbered attack would point a finding at nothing.
    const results = await run();
    expect(results.map((result) => result.id)).toEqual(
      Array.from({ length: REQUIRED }, (_, index) => `SEC-${FIRST_ID + index}`),
    );
  });

  it('renders every attack as one machine-readable line', async () => {
    const results = await run();
    for (const result of results) {
      expect(resultLine(result), `${result.id} is not renderable`).toMatch(
        /^SEC-\d{3} stage=11 category="[^"]+" severity=(CRITICAL|HIGH|MEDIUM|LOW) status=(PASS|FAIL|NOT_APPLICABLE) target="[^"]+" detection="[^"]+" regression=(?:VULN|SEC)-\d{3}|no$/,
      );
    }
  });

  it('has no unresolved CRITICAL or HIGH breach, and fails nothing at any severity', async () => {
    const results = await run();
    const gate = stageGate(results);
    expect(gate.critical, `stage 11 has unresolved CRITICAL findings`).toEqual([]);
    expect(gate.high, `stage 11 has unresolved HIGH findings`).toEqual([]);
    expect(gate.cleared, 'stage 11 gate is not cleared').toBe(true);
    const broken = results
      .filter((result) => result.verdict === 'FAIL')
      .map((result) => `${result.id} [${result.severity}] ${result.target}: ${result.observed}`);
    expect(broken, `stage 11 fails ${broken.length} attack(s)`).toEqual([]);
  });

  it('prints one line per attack plus one gate summary for the stage', async () => {
    const results = await run();
    const lines = report(results).split('\n');
    expect(lines).toHaveLength(results.length + 1);
    expect(report(results)).toContain('STAGE 11 gate:');
  });

  it('records the checkpoint for this stage, separately from the Phase 6 baseline', async () => {
    const results = await run();
    const gate = stageGate(results);
    expect(
      baseline.phase7,
      'docs/security-gate-baseline.json has no phase7 checkpoint',
    ).toBeDefined();
    const recorded = baseline.phase7 as PhaseSevenBaseline;
    expect(recorded.stage).toBe(11);
    expect(recorded.totalAttacks).toBe(results.length);
    expect(recorded.pass).toBe(gate.pass);
    expect(recorded.fail).toBe(gate.fail);
    expect(recorded.notApplicable).toBe(gate.notApplicable);
    expect(recorded.cleared).toBe(gate.cleared);
    // The Phase 6 checkpoint is still the Phase 6 checkpoint.
    expect(baseline.totalAttacks).toBe(150);
  });
});
