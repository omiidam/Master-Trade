/**
 * The adversarial security-gate harness.
 *
 * Phase 6 ends with a controlled attack simulation: 150 cases across ten stages, each one an
 * *attempt* against a real module rather than a description of one. The harness exists so the
 * attempts stay comparable: an attack declares what it is trying to break, the control it expects
 * to break it, and how severe a breach would be — and the runner turns the observed outcome into
 * one of three verdicts.
 *
 * Three verdicts, and the third is the honest one:
 *
 *   - `PASS` — the attempt was refused, and the refusal came from the named control;
 *   - `FAIL` — the attempt got through. A `FAIL` at `CRITICAL` or `HIGH` closes the stage gate;
 *   - `NOT_APPLICABLE` — **the attack surface does not exist**. `NOT_APPLICABLE` is *not* a pass.
 *     Nothing here may count it as evidence that an absent feature is secure; an attack case may
 *     only claim it by naming the missing capability, why the surface is absent, and which future
 *     phase would introduce it.
 *
 * Nothing in this suite touches a real system. There is no network, no broker, no payment
 * processor and no third-party host: `fixtures.ts` builds synthetic principals, tokens,
 * credentials, memory records and files, and every case runs against those.
 *
 * A thrown error is not a refusal unless the case says so. `refusalAttempt` is the only way a
 * case may claim "the code refused": the attempt must throw, and the case may name the message it
 * expects. An unexpected throw inside a case is reported as a `FAIL` with the stack's first line,
 * because a boundary that crashes instead of refusing is not a boundary.
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type Verdict = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

/** The attempt was refused by the control the case named. */
export interface Blocked {
  blocked: true;
  /** What happened, in a sentence — the refusal as observed, not as hoped for. */
  observed: string;
  /** The control that produced it: a module, a function or a policy. */
  detection: string;
}

/** The attempt got through. */
export interface Breached {
  blocked: false;
  observed: string;
  detection: string;
}

export type Outcome = Blocked | Breached;

/** An attack whose surface is absent, declared rather than skipped. */
export interface NotApplicable {
  id: string;
  stage: number;
  category: string;
  target: string;
  /** The severity a breach *would* carry if the capability existed. */
  severity: Severity;
  boundary: string;
  capability: string;
  why: string;
  futurePhase: string;
}

export interface AttackCase {
  /** `SEC-###`, assigned in stage order and stable forever. */
  id: string;
  stage: number;
  category: string;
  /** The boundary under attack, named so a failure points at one thing. */
  target: string;
  severity: Severity;
  boundary: string;
  /** Set when this case exists because a finding was fixed: the finding's id. */
  regression?: string;
  run: () => Promise<Outcome> | Outcome;
}

export type Attack = AttackCase | NotApplicable;

export function isNotApplicable(attack: Attack): attack is NotApplicable {
  return (attack as NotApplicable).capability !== undefined;
}

export interface AttackResult {
  id: string;
  stage: number;
  category: string;
  target: string;
  severity: Severity;
  boundary: string;
  verdict: Verdict;
  observed: string;
  detection: string;
  regression: string | null;
}

/** The refusal a case observed. */
export const blocked = (observed: string, detection: string): Blocked => ({
  blocked: true,
  observed,
  detection,
});

/** The breach a case observed. */
export const breached = (observed: string, detection: string): Breached => ({
  blocked: false,
  observed,
  detection,
});

/**
 * Run an attempt that must be refused, and report how.
 *
 * The single way a case may claim a refusal. `expects` is optional and deliberately narrow: when
 * given, the refusal must match, so a case cannot pass on an unrelated error that happened to be
 * thrown by the same call.
 */
export async function refusalAttempt(input: {
  what: string;
  detection: string;
  expects?: RegExp;
  attempt: () => unknown | Promise<unknown>;
}): Promise<Outcome> {
  try {
    const returned = await input.attempt();
    return breached(
      `${input.what} — the attempt returned instead of refusing (${describe(returned)})`,
      'none: the control did not engage',
    );
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (input.expects && !input.expects.test(message)) {
      return breached(
        `${input.what} — something was thrown, but not the refusal this case requires (${message})`,
        `${input.detection} (unexpected error)`,
      );
    }
    return blocked(`${input.what} — refused with "${message}"`, input.detection);
  }
}

/**
 * Report an attempt whose evidence is an observation rather than a refusal — a comparison of two
 * prompts, a scan of an output for a secret, an assertion about a stored record.
 */
export function observe(input: {
  what: string;
  detection: string;
  /** What was seen. Rendered into the report either way. */
  seen: string;
  /** True when the boundary held. */
  held: boolean;
}): Outcome {
  return input.held
    ? blocked(`${input.what} — ${input.seen}`, input.detection)
    : breached(`${input.what} — ${input.seen}`, 'none: the boundary did not hold');
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
  return String(value);
}

/** Execute one attack. */
export async function executeAttack(attack: Attack): Promise<AttackResult> {
  const base = {
    id: attack.id,
    stage: attack.stage,
    category: attack.category,
    target: attack.target,
    severity: attack.severity,
    boundary: attack.boundary,
  };

  if (isNotApplicable(attack)) {
    return {
      ...base,
      verdict: 'NOT_APPLICABLE',
      observed: `${attack.capability} does not exist in this build`,
      detection: attack.why,
      regression: null,
    };
  }

  try {
    const outcome = await attack.run();
    return {
      ...base,
      verdict: outcome.blocked ? 'PASS' : 'FAIL',
      observed: outcome.observed,
      detection: outcome.detection,
      regression: attack.regression ?? null,
    };
  } catch (error) {
    // A case that throws is a case whose boundary crashed. Refusals are *reported* by the case
    // through `refusalAttempt`; an escaping error means the harness could not see a verdict.
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return {
      ...base,
      verdict: 'FAIL',
      observed: `the attempt raised an unhandled error (${message})`,
      detection: 'none: the boundary crashed rather than refusing',
      regression: attack.regression ?? null,
    };
  }
}

export interface StageGate {
  stage: number;
  total: number;
  pass: number;
  fail: number;
  notApplicable: number;
  /** Unresolved breaches at CRITICAL, each rendered as a line. */
  critical: string[];
  high: string[];
  /** True when the stage may be considered cleared: no unresolved CRITICAL or HIGH breach. */
  cleared: boolean;
}

/** Summarize one stage against the gate criteria. */
export function stageGate(results: readonly AttackResult[]): StageGate {
  const failed = results.filter((result) => result.verdict === 'FAIL');
  const critical = failed
    .filter((result) => result.severity === 'CRITICAL')
    .map((result) => `${result.id} ${result.target}: ${result.observed}`);
  const high = failed
    .filter((result) => result.severity === 'HIGH')
    .map((result) => `${result.id} ${result.target}: ${result.observed}`);
  return {
    stage: results[0]?.stage ?? 0,
    total: results.length,
    pass: results.filter((result) => result.verdict === 'PASS').length,
    fail: failed.length,
    notApplicable: results.filter((result) => result.verdict === 'NOT_APPLICABLE').length,
    critical,
    high,
    cleared: critical.length === 0 && high.length === 0,
  };
}

/** The machine-readable line for one attack — the shape the gate's report is built from. */
export function resultLine(result: AttackResult): string {
  return (
    `${result.id} stage=${result.stage} category=${JSON.stringify(result.category)} ` +
    `severity=${result.severity} status=${result.verdict} target=${JSON.stringify(result.target)} ` +
    `detection=${JSON.stringify(result.detection)} regression=${result.regression ?? 'no'}`
  );
}

/** The whole run as a printable report: one line per attack, then the gate summary. */
export function report(results: readonly AttackResult[]): string {
  const lines = results.map(resultLine);
  const stages = [...new Set(results.map((result) => result.stage))].sort((a, b) => a - b);
  for (const stage of stages) {
    const gate = stageGate(results.filter((result) => result.stage === stage));
    lines.push(
      `STAGE ${String(stage).padStart(2, '0')} gate: ${gate.pass} pass, ${gate.fail} fail, ` +
        `${gate.notApplicable} not-applicable — ${gate.cleared ? 'CLEARED' : 'BLOCKED'}`,
    );
  }
  return lines.join('\n');
}
