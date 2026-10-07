/**
 * The Response Pipeline — the one place between Agent execution and the
 * final user response (Phase 2.11).
 *
 * Agent execution (the Agent Loop over the harness, or a single service
 * turn) produces *raw material*: statements, a structured summary, tool
 * requests, usage, and a terminal status. None of that may reach a user
 * as-is. This module is the single, centralized transformation every
 * response passes through before a surface renders it, in five explicit
 * stages, always in this order:
 *
 *   1. **Result normalization** — one defensive shape for every input:
 *      an id, a run status, the stop reason, usage, statements, the
 *      summary, outstanding tool requests, and the internals that must
 *      never travel further (system instruction lines, context digests,
 *      tool execution records). A malformed input is a violation here,
 *      not a surprise downstream.
 *   2. **Response validation** — does the answer that would ship hold
 *      together: statements with a valid epistemic kind, non-empty text
 *      and well-formed sources? Nothing to validate (a run that never
 *      completed) is `skipped`, not silently `passed`.
 *   3. **Policy check** — may this text reach the user at all? The
 *      outgoing pool is scanned for chain-of-thought markup, secret
 *      material, and the verbatim internals collected in stage 1. A hit
 *      withholds the whole response; it is never quietly stripped,
 *      because stripping would hide the violation.
 *   4. **Uncertainty handling** — the summary's uncertainty notes are
 *      carried (never silently dropped), and the pipeline decides whether
 *      an answer exists at all: an answered run, a run that still needs
 *      clarification, or a run whose data never arrived.
 *   5. **Final formatting** — the user-facing text for the decided kind,
 *      with the epistemic label and the preserved metadata.
 *
 * Five outcome kinds, and only five — the vocabulary a surface renders:
 *
 *   - `completed`         — a completed answer;
 *   - `clarification`     — clarification required (the run finished
 *                           without an answer and work is outstanding);
 *   - `blocked`           — blocked response (the run stopped at a limit
 *                           or gate, was cancelled, or the pipeline
 *                           withheld the answer at the validation or
 *                           policy stage);
 *   - `failed`            — failed response (execution errored, or the
 *                           input itself was unusable);
 *   - `unavailable-data`  — unavailable-data response (the run finished
 *                           without an answer and nothing is outstanding).
 *
 * The honesty rule the whole module exists for: **only `kind:
 * 'completed'` carries statements, and `success` is true only then.** A
 * blocked, failed, cancelled or incomplete run can produce any amount of
 * partial material — accumulated statements from steps that ran before a
 * limit hit, a refusal sentence, a stop reason — and none of it becomes a
 * successful-looking answer. Metadata (run id, run status, stop reason,
 * usage, validation status, the per-stage verdicts) travels alongside
 * every outcome, so a consumer can say *why* without guessing.
 *
 * Leakage rules, enforced at the policy stage rather than requested of
 * anyone upstream: raw internal reasoning (`<thinking>` blocks and its
 * kin), tool internals (execution ids, refusal details, serialized tool
 * records), system instructions, and private runtime data (context
 * digests, secret-shaped material) never enter the outgoing text. Free-
 * text stop-reason and failure messages stay in `metadata.stopReason`
 * for internal consumers; the user-facing copy for a failed run is a
 * fixed, honest sentence that fabricates nothing.
 *
 * Deliberately **not** here, per this phase: evaluation, observability,
 * diagnosis, quality gates, memory consolidation, learning; no chain-of-
 * thought exposure (the pipeline never has access to reasoning, because
 * upstream contracts refuse it); no mock responses — for every non-
 * completed kind the reply states what happened and asserts nothing.
 *
 * The pipeline is pure and UI-independent: same input, same result; a
 * plain-data result any surface (HTTP handler, worker, CLI) can render
 * its own way. It composes with — and changes nothing about — the Agent
 * Loop, Run Manager, Harness, Context Builder, Tool Registry, permission
 * gate and LLM Gateway.
 */

import type { AgentLoopResult, AgentLoopStopReason, AgentLoopUsage } from './agentLoop.js';
import { EPISTEMIC_KINDS, stripReasoningBlocks, type StructuredSummary } from '../llm/summary.js';
import type { EpistemicKind } from '../../packages/shared/src/types.js';

// ── Stage vocabulary ───────────────────────────────────────────────────────

/**
 * The five stages, in execution order. Exported so tests (and readers)
 * can assert the pipeline really runs them all, in this order, rather
 * than trusting a comment.
 */
export const RESPONSE_PIPELINE_STAGES = [
  'result-normalization',
  'response-validation',
  'policy-check',
  'uncertainty-handling',
  'final-formatting',
] as const;

export type ResponsePipelineStage = (typeof RESPONSE_PIPELINE_STAGES)[number];

/** A stage's verdict for one run. `skipped` is honest: nothing to check. */
export type StageVerdict = 'passed' | 'failed' | 'skipped';

/** The five — and only five — shapes a final response may take. */
export type ResponseKind =
  'completed' | 'clarification' | 'blocked' | 'failed' | 'unavailable-data';

/** The terminal status of the execution the pipeline was handed. */
export type ResponseRunStatus = 'completed' | 'blocked' | 'failed' | 'cancelled';

// ── Input ──────────────────────────────────────────────────────────────────

/** What an answer may contain: the shared statement shape, read-only. */
export interface ResponseStatement {
  kind: EpistemicKind;
  text: string;
  sources: readonly string[];
}

/** Token accounting preserved from the run, untouched. */
export interface ResponseUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

/**
 * Internal runtime material collected from the run for one purpose: the
 * policy stage refuses an outgoing response that reproduces it verbatim.
 * Each entry names its origin so a violation is greppable evidence, not
 * a vague suspicion.
 */
export interface ForbiddenValue {
  origin: 'system-instructions' | 'context-digest' | 'tool-record';
  value: string;
}

export interface ResponsePipelineInput {
  /** The id of the execution this response answers (run id, or the correlation id of an untracked turn). */
  runId: string;
  runStatus: ResponseRunStatus;
  /** The loop's stop reason, when the input came from a loop. `null` when there was no loop. */
  stopReason?: AgentLoopStopReason | null;
  usage?: ResponseUsage | null;
  /** Everything execution produced; only a `completed` answer ships it. */
  statements?: readonly ResponseStatement[];
  summary?: StructuredSummary | null;
  /** Outstanding tool work — the signal that clarification, not absence, is the story. */
  toolRequests?: readonly { toolName: string }[];
  /**
   * The executor's proposed user-facing text (a refusal sentence, a
   * gated turn's reason). It is policy-checked like everything else and
   * preserved when it passes — the refusal *is* the reply — but it never
   * overrides the decided kind.
   */
  candidateReply?: string | null;
  /** Internals the policy stage must keep out of the outgoing text. */
  internals?: { forbiddenValues?: readonly ForbiddenValue[] };
}

// ── Output ─────────────────────────────────────────────────────────────────

/** The validation status preserved on every response, with the stage that decided it. */
export interface ResponseValidationStatus {
  status: 'passed' | 'failed' | 'skipped';
  /**
   * The stage that last decided this status: the failing gate when one
   * failed, `response-validation` when there was nothing to validate,
   * and `policy-check` (the last gate before formatting) when all passed.
   */
  stage: ResponsePipelineStage;
  /** Violation codes, prefixed by the stage that raised them. Safe to log; never shown as prose. */
  violations: readonly string[];
}

/** Everything the pipeline preserved about the execution behind a response. */
export interface ResponsePipelineMetadata {
  runId: string;
  runStatus: ResponseRunStatus;
  /** The loop's own stop reason, verbatim — structured, never interpolated into the reply. */
  stopReason: AgentLoopStopReason | null;
  usage: ResponseUsage | null;
  validation: ResponseValidationStatus;
  /** Per-stage verdicts, in execution order — proof the stages ran, not a claim. */
  stages: readonly { stage: ResponsePipelineStage; verdict: StageVerdict }[];
}

export interface ResponsePipelineResult {
  kind: ResponseKind;
  /** True only for `completed`. Every other kind forbids rendering an answer. */
  success: boolean;
  /** The final user-facing text — plain, sanitized, honest for every kind. */
  reply: string;
  /** Carried only for `completed`; empty for every other kind. */
  statements: readonly ResponseStatement[];
  /** The summary's uncertainty notes, carried for a completed status; empty otherwise. */
  uncertainty: readonly string[];
  /** The label the reply ships under. An answer it cannot label ships as `uncertainty`. */
  epistemicKind: EpistemicKind;
  metadata: ResponsePipelineMetadata;
}

// ── Fixed copy for non-completed outcomes ──────────────────────────────────
//
// These are status sentences, not mock answers: they state what happened
// and assert nothing about the world. The raw failure message, the stop
// reason's free text and every internal detail stay in
// `metadata.stopReason`, because an error string can carry anything.

const CLARIFICATION_REPLY =
  'Clarification is required before an answer can be produced: the run finished without one, and the request still depends on work or information that is not yet available.';

const UNAVAILABLE_REPLY =
  'No answer was produced because the data needed for one was not available. Nothing was established, so nothing is asserted.';

const FAILED_REPLY =
  'This run failed before an answer was produced. No answer is shown, because none was completed.';

const CANCELLED_REPLY =
  'This run was cancelled before an answer was produced. No answer is shown, because none was completed.';

const WITHHELD_REPLY =
  'The response was withheld because it did not pass response validation. No answer is shown.';

function stoppedReply(stopReason: AgentLoopStopReason | null): string {
  const reason = stopReason?.reason ?? 'unknown';
  return `This run was stopped before an answer was produced (stop reason: ${reason}). No answer is shown, because none was completed.`;
}

// ── The policy stage's secret patterns ─────────────────────────────────────
//
// Shape-based, because a pipeline cannot know every credential format;
// a hit withholds the response rather than scrubbing it.

const SECRET_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'openai-style-key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private-key-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/ },
  {
    name: 'assigned-secret',
    pattern: /\b(api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["']?[^\s"']{12,}/i,
  },
] as const;

/** A stack trace is runtime internals in a response, whatever produced it. */
const STACK_TRACE_PATTERN = /^\s*at\s+\S.*\([^)]*:\d+:\d+\)/m;

// ── Stage 1: result normalization ──────────────────────────────────────────

interface NormalizedResult {
  runId: string;
  runStatus: ResponseRunStatus;
  stopReason: AgentLoopStopReason | null;
  usage: ResponseUsage | null;
  statements: ResponseStatement[];
  summary: StructuredSummary | null;
  toolRequests: readonly { toolName: string }[];
  candidateReply: string | null;
  forbiddenValues: readonly ForbiddenValue[];
  violations: string[];
}

const RUN_STATUSES: readonly ResponseRunStatus[] = ['completed', 'blocked', 'failed', 'cancelled'];

function isUsage(value: unknown): value is ResponseUsage {
  if (typeof value !== 'object' || value === null) return false;
  const usage = value as Partial<ResponseUsage>;
  return (
    typeof usage.promptTokens === 'number' &&
    typeof usage.completionTokens === 'number' &&
    typeof usage.totalTokens === 'number' &&
    typeof usage.costUsd === 'number'
  );
}

function normalizeResult(input: ResponsePipelineInput | null | undefined): NormalizedResult {
  const violations: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return {
      runId: '',
      runStatus: 'failed',
      stopReason: null,
      usage: null,
      statements: [],
      summary: null,
      toolRequests: [],
      candidateReply: null,
      forbiddenValues: [],
      violations: ['normalize:input-malformed'],
    };
  }

  if (typeof input.runId !== 'string' || input.runId.trim().length === 0) {
    violations.push('normalize:run-id-missing');
  }
  if (!RUN_STATUSES.includes(input.runStatus)) {
    violations.push('normalize:run-status-unknown');
  }

  const rawStatements = input.statements;
  let statements: ResponseStatement[] = [];
  if (rawStatements !== undefined) {
    if (!Array.isArray(rawStatements)) {
      violations.push('normalize:statements-not-an-array');
    } else {
      statements = rawStatements.map((statement) => ({
        kind: statement?.kind,
        text: typeof statement?.text === 'string' ? statement.text : '',
        sources: Array.isArray(statement?.sources) ? [...statement.sources] : [],
      }));
    }
  }

  let usage: ResponseUsage | null = null;
  if (input.usage !== undefined && input.usage !== null) {
    if (isUsage(input.usage)) usage = { ...input.usage };
    else violations.push('normalize:usage-malformed');
  }

  const candidateReply =
    typeof input.candidateReply === 'string' && input.candidateReply.length > 0
      ? input.candidateReply
      : null;

  return {
    runId: typeof input.runId === 'string' ? input.runId : '',
    runStatus: RUN_STATUSES.includes(input.runStatus) ? input.runStatus : 'failed',
    stopReason: input.stopReason ?? null,
    usage,
    statements,
    summary: input.summary ?? null,
    toolRequests: input.toolRequests ?? [],
    candidateReply,
    forbiddenValues: input.internals?.forbiddenValues ?? [],
    violations,
  };
}

// ── Stage 2: response validation ───────────────────────────────────────────

function validateResponse(normalized: NormalizedResult): {
  verdict: StageVerdict;
  violations: string[];
} {
  // A run that never completed ships no answer, so there is nothing to
  // validate — recorded as `skipped`, never as a passing grade.
  if (normalized.runStatus !== 'completed') return { verdict: 'skipped', violations: [] };
  // A completed run with no statements is not a contract violation; it
  // is an incomplete answer, which stage 4 classifies honestly.
  if (normalized.statements.length === 0) return { verdict: 'skipped', violations: [] };

  const violations: string[] = [];
  normalized.statements.forEach((statement, index) => {
    if (!EPISTEMIC_KINDS.includes(statement.kind)) {
      violations.push(`validate:statements[${index}].kind-unknown`);
    }
    if (statement.text.trim().length === 0) {
      violations.push(`validate:statements[${index}].text-empty`);
    }
    for (const [position, source] of statement.sources.entries()) {
      if (typeof source !== 'string' || source.trim().length === 0) {
        violations.push(`validate:statements[${index}].sources[${position}]-invalid`);
      }
    }
  });
  return { verdict: violations.length > 0 ? 'failed' : 'passed', violations };
}

// ── Stage 3: policy check ──────────────────────────────────────────────────

/** Collapse whitespace so a re-wrapped instruction line is still recognized. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function checkPolicy(normalized: NormalizedResult): {
  verdict: StageVerdict;
  violations: string[];
} {
  const violations: string[] = [];

  // The outgoing pool: what the user would actually read. For a run that
  // did not complete, only the candidate reply can ship (the fixed copy
  // is ours and fabricates nothing), so statements are not scanned —
  // they are not going anywhere.
  const pool: { label: string; text: string }[] = [];
  if (normalized.candidateReply !== null) {
    pool.push({ label: 'candidate', text: normalized.candidateReply });
  }
  if (normalized.runStatus === 'completed') {
    if (normalized.summary !== null && normalized.summary.headline.length > 0) {
      pool.push({ label: 'headline', text: normalized.summary.headline });
    }
    normalized.statements.forEach((statement, index) => {
      pool.push({ label: `statements[${index}]`, text: statement.text });
    });
    normalized.summary?.uncertainty.forEach((note, index) => {
      pool.push({ label: `uncertainty[${index}]`, text: note });
    });
  }

  for (const entry of pool) {
    // Raw internal reasoning, in any of its disguises: refused whole,
    // never stripped-and-shipped.
    if (stripReasoningBlocks(entry.text).stripped) {
      violations.push(`policy:reasoning-markup:${entry.label}`);
    }
    if (STACK_TRACE_PATTERN.test(entry.text)) {
      violations.push(`policy:stack-trace:${entry.label}`);
    }
    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(entry.text)) {
        violations.push(`policy:secret-${secret.name}:${entry.label}`);
      }
    }
    // Verbatim internals collected in stage 1. Short values are skipped:
    // an 8-character substring would refuse honest prose.
    const normalizedText = normalizeWhitespace(entry.text);
    for (const forbidden of normalized.forbiddenValues) {
      if (forbidden.value.length < 8) continue;
      const hit =
        entry.text.includes(forbidden.value) ||
        normalizedText.includes(normalizeWhitespace(forbidden.value));
      if (hit) violations.push(`policy:runtime-${forbidden.origin}:${entry.label}`);
    }
  }

  return { verdict: violations.length > 0 ? 'failed' : 'passed', violations };
}

// ── Stage 4: uncertainty handling ──────────────────────────────────────────

/** What stage 4 establishes: does an answer exist, does one need input, did data never arrive? */
type AnswerAvailability = 'answered' | 'needs-clarification' | 'no-data';

function handleUncertainty(normalized: NormalizedResult): {
  uncertainty: string[];
  availability: AnswerAvailability;
} {
  const uncertainty =
    normalized.summary === null
      ? []
      : normalized.summary.uncertainty.filter((note) => note.trim().length > 0);

  const availability: AnswerAvailability =
    normalized.statements.length > 0
      ? 'answered'
      : normalized.toolRequests.length > 0
        ? 'needs-clarification'
        : 'no-data';

  return { uncertainty, availability };
}

// ── The decision between stages 4 and 5 ────────────────────────────────────

function decideKind(
  normalized: NormalizedResult,
  validation: { verdict: StageVerdict; violations: string[] },
  policy: { verdict: StageVerdict; violations: string[] },
  availability: AnswerAvailability,
): ResponseKind {
  // The input itself was unusable: there is no honest classification of
  // a run the pipeline could not even read.
  if (normalized.violations.length > 0) return 'failed';
  // Execution decided first. A blocked, failed or cancelled run never
  // reaches the answer path, whatever statements it accumulated before
  // it stopped. Cancelled maps to `blocked`: a cancellation prevented
  // the response; it did not error. `metadata.runStatus` says exactly
  // which, so nothing is misrepresented.
  if (normalized.runStatus === 'failed') return 'failed';
  if (normalized.runStatus === 'blocked' || normalized.runStatus === 'cancelled') {
    return 'blocked';
  }
  // A completed run whose answer did not pass a gate is withheld.
  if (validation.verdict === 'failed' || policy.verdict === 'failed') return 'blocked';
  // Completed, valid, clean — but was there an answer at all?
  if (availability === 'answered') return 'completed';
  if (availability === 'needs-clarification') return 'clarification';
  return 'unavailable-data';
}

// ── Stage 5: final response formatting ─────────────────────────────────────

function dominantKind(statements: readonly ResponseStatement[]): EpistemicKind {
  const first = statements[0];
  if (first === undefined) return 'uncertainty';
  const kinds = new Set(statements.map((statement) => statement.kind));
  return kinds.size === 1 ? first.kind : 'analysis';
}

function formatResponse(
  kind: ResponseKind,
  normalized: NormalizedResult,
  validationFailed: boolean,
  uncertainty: readonly string[],
): { reply: string; statements: readonly ResponseStatement[]; epistemicKind: EpistemicKind } {
  switch (kind) {
    case 'completed': {
      const statements = normalized.statements;
      const body = statements.map((statement) => statement.text.trim()).join(' ');
      const headline = normalized.summary?.headline.trim() ?? '';
      return {
        reply: headline.length > 0 ? `${headline}\n\n${body}` : body,
        statements,
        epistemicKind: dominantKind(statements),
      };
    }
    case 'clarification':
      return {
        reply: normalized.candidateReply ?? CLARIFICATION_REPLY,
        statements: [],
        epistemicKind: 'uncertainty',
      };
    case 'unavailable-data':
      return {
        reply: normalized.candidateReply ?? UNAVAILABLE_REPLY,
        statements: [],
        epistemicKind: 'uncertainty',
      };
    case 'failed':
      // The raw failure message is deliberately not interpolated: it can
      // carry anything (paths, provider errors, internals). The stop
      // reason travels intact in metadata for internal consumers.
      return {
        reply: normalized.candidateReply ?? FAILED_REPLY,
        statements: [],
        epistemicKind: 'uncertainty',
      };
    case 'blocked':
    default: {
      if (validationFailed) {
        // A withheld answer ships the withholding notice, never the
        // offending text.
        return {
          reply: WITHHELD_REPLY,
          statements: [],
          epistemicKind: 'uncertainty',
        };
      }
      if (normalized.runStatus === 'cancelled') {
        return {
          reply: normalized.candidateReply ?? CANCELLED_REPLY,
          statements: [],
          epistemicKind: 'uncertainty',
        };
      }
      if (normalized.runStatus === 'blocked') {
        return {
          reply: normalized.candidateReply ?? stoppedReply(normalized.stopReason),
          statements: [],
          epistemicKind: 'uncertainty',
        };
      }
      return {
        reply: normalized.candidateReply ?? WITHHELD_REPLY,
        statements: [],
        epistemicKind: 'uncertainty',
      };
    }
  }
}

// ── The pipeline ───────────────────────────────────────────────────────────

/**
 * Run one response through the five stages, in order, and settle on
 * exactly one of the five kinds.
 *
 * Pure: same input, same result; no clock, no I/O, no rendering. The
 * result is plain data — a surface decides how to draw it, and the
 * pipeline never does.
 */
export function runResponsePipeline(input: ResponsePipelineInput): ResponsePipelineResult {
  const stages: { stage: ResponsePipelineStage; verdict: StageVerdict }[] = [];

  // 1. Result normalization.
  const normalized = normalizeResult(input);
  stages.push({
    stage: 'result-normalization',
    verdict: normalized.violations.length > 0 ? 'failed' : 'passed',
  });

  // 2. Response validation.
  const validation = validateResponse(normalized);
  stages.push({ stage: 'response-validation', verdict: validation.verdict });

  // 3. Policy check.
  const policy = checkPolicy(normalized);
  stages.push({ stage: 'policy-check', verdict: policy.verdict });

  // 4. Uncertainty handling.
  const { uncertainty, availability } = handleUncertainty(normalized);
  stages.push({ stage: 'uncertainty-handling', verdict: 'passed' });

  const kind = decideKind(normalized, validation, policy, availability);
  const validationFailed = validation.verdict === 'failed' || policy.verdict === 'failed';

  // 5. Final response formatting.
  const formatted = formatResponse(kind, normalized, validationFailed, uncertainty);
  stages.push({ stage: 'final-formatting', verdict: 'passed' });

  // The preserved validation status: a failing gate wins, then an
  // honest `skipped`, then `passed`.
  const validationStatus: ResponseValidationStatus =
    normalized.violations.length > 0
      ? {
          status: 'failed',
          stage: 'result-normalization',
          violations: normalized.violations,
        }
      : policy.verdict === 'failed'
        ? {
            status: 'failed',
            stage: 'policy-check',
            violations: policy.violations,
          }
        : validation.verdict === 'failed'
          ? {
              status: 'failed',
              stage: 'response-validation',
              violations: validation.violations,
            }
          : validation.verdict === 'skipped'
            ? {
                status: 'skipped',
                stage: 'response-validation',
                violations: [],
              }
            : { status: 'passed', stage: 'policy-check', violations: [] };

  return {
    kind,
    success: kind === 'completed',
    reply: formatted.reply,
    statements: kind === 'completed' ? formatted.statements : [],
    // Uncertainty notes ride only on a run that *completed*: for a
    // blocked, failed or cancelled run the notes describe a partial
    // answer that is being dropped in full — shipping them alone would
    // read as a hedged answer, the misleading shape this forbids.
    uncertainty:
      normalized.runStatus === 'completed' &&
      (kind === 'completed' || kind === 'clarification' || kind === 'unavailable-data')
        ? uncertainty
        : [],
    epistemicKind: formatted.epistemicKind,
    metadata: {
      runId: normalized.runId,
      runStatus: normalized.runStatus,
      stopReason: normalized.stopReason,
      usage: normalized.usage,
      validation: validationStatus,
      stages,
    },
  };
}

// ── Input builders for the two execution seams ─────────────────────────────

/**
 * Build the pipeline input from a settled Agent Loop result (with the
 * run id the Run Manager minted). The internals the policy stage needs
 * are harvested from the result itself: what the run assembled as system
 * instructions, the context digests it delivered, and the tool records
 * it settled — exactly the material a user must never see verbatim.
 */
export function responsePipelineInputFromLoop(
  result: AgentLoopResult & { runId: string },
): ResponsePipelineInput {
  const forbiddenValues: ForbiddenValue[] = [];

  for (const run of result.runs) {
    const assembly = run.assembly;
    if (assembly === undefined) continue;
    // Long instruction lines verbatim: a response reproducing the system
    // prompt is the clearest system-instruction leak there is.
    for (const line of assembly.systemInstructions.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length >= 60) {
        forbiddenValues.push({ origin: 'system-instructions', value: trimmed });
      }
    }
  }
  for (const digest of result.deliveredDigests) {
    forbiddenValues.push({ origin: 'context-digest', value: digest });
  }
  for (const tool of result.toolRuns) {
    if (tool.executionId.length > 0) {
      forbiddenValues.push({ origin: 'tool-record', value: tool.executionId });
    }
    if (tool.detail !== undefined && tool.detail.length >= 8) {
      forbiddenValues.push({ origin: 'tool-record', value: tool.detail });
    }
  }

  return {
    runId: result.runId,
    runStatus: result.status,
    stopReason: result.stopReason,
    usage: result.usage,
    statements: result.statements,
    summary: result.summary,
    toolRequests: result.toolRequests,
    internals: { forbiddenValues },
  };
}

/**
 * Build the pipeline input from one service turn — the single-step
 * execution path behind `agent.chat`. The turn's reply becomes the
 * candidate the policy stage checks and formatting preserves (a refusal
 * *is* the reply), and there is no loop, so the stop reason is `null`.
 */
export function responsePipelineInputFromTurn(
  runId: string,
  turn: {
    status: 'completed' | 'blocked';
    reply: string;
    statements: readonly ResponseStatement[];
    usage?: ResponseUsage | null;
  },
): ResponsePipelineInput {
  return {
    runId,
    runStatus: turn.status === 'completed' ? 'completed' : 'blocked',
    stopReason: null,
    usage: turn.usage ?? null,
    statements: turn.statements,
    summary: null,
    toolRequests: [],
    candidateReply: turn.reply,
  };
}
