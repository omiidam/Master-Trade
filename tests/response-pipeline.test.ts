/**
 * The Response Pipeline (Phase 2.11) — the contract between Agent
 * execution and the final user response.
 *
 * The tests hold the four properties the pipeline exists for:
 *
 *   1. **Five explicit stages, in order.** Every run records a verdict
 *      for every stage, so "the pipeline checked" is evidence, not prose.
 *   2. **Honesty under every terminal state.** Blocked, failed,
 *      cancelled and incomplete runs never produce a successful-looking
 *      answer — no kind but `completed` carries statements, and no kind
 *      but `completed` reports success.
 *   3. **Metadata survives.** Run id, stop reason, usage and validation
 *      status travel with every outcome, cloned rather than shared.
 *   4. **Nothing internal escapes.** Chain-of-thought markup, system
 *      instructions, context digests, tool records, secrets and stack
 *      traces in the outgoing text withhold the whole response instead
 *      of being shipped or quietly scrubbed.
 *
 * Plus the two seams: the loop-input builder (which harvests the
 * internals the policy stage forbids) and the turn-input adapter behind
 * `agent.chat`, whose refusal candidate is preserved when clean and
 * withheld when not. The last test pins the handler to the pipeline, so
 * the wiring cannot be removed without a red suite.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RESPONSE_PIPELINE_STAGES,
  responsePipelineInputFromLoop,
  responsePipelineInputFromTurn,
  runResponsePipeline,
} from '../src/agent/responsePipeline.js';
import type { AgentLoopResult } from '../src/agent/agentLoop.js';

/** A settled loop result; every test overrides only what it is about. */
function loopResult(
  overrides: Partial<AgentLoopResult> & { runId?: string } = {},
): AgentLoopResult & { runId: string } {
  return {
    runId: 'run_test_1',
    status: 'completed',
    stopReason: { reason: 'completed' },
    iterations: 1,
    statements: [
      {
        kind: 'analysis',
        text: 'The position stays within the risk budget.',
        sources: ['tool:risk'],
      },
    ],
    summary: {
      headline: 'Risk is within budget.',
      statements: [
        {
          kind: 'analysis',
          text: 'The position stays within the risk budget.',
          sources: ['tool:risk'],
        },
      ],
      uncertainty: ['Live broker data was not consulted.'],
      toolRequests: [],
    },
    toolRequests: [],
    toolRuns: [],
    usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, costUsd: 0.001 },
    decision: { complete: true, rationale: 'the summary requested no further work' },
    timeline: [{ state: 'completed', at: '2026-10-07T00:00:00.000Z' }],
    durationMs: 12,
    runs: [],
    deliveredDigests: [],
    ...overrides,
  };
}

describe('the pipeline runs five explicit stages, in order', () => {
  it('names the five stages in execution order', () => {
    expect([...RESPONSE_PIPELINE_STAGES]).toEqual([
      'result-normalization',
      'response-validation',
      'policy-check',
      'uncertainty-handling',
      'final-formatting',
    ]);
  });

  it('records a verdict for every stage, in that order, on every outcome', () => {
    const outcomes = [
      loopResult(),
      loopResult({
        status: 'blocked',
        stopReason: { reason: 'iteration-limit', iterationsRun: 5, maxIterations: 5 },
      }),
      loopResult({
        status: 'failed',
        stopReason: { reason: 'failed', message: 'the provider refused' },
      }),
      loopResult({ status: 'cancelled', stopReason: { reason: 'cancelled' } }),
      loopResult({ statements: [], summary: null }),
    ];
    for (const loop of outcomes) {
      const result = runResponsePipeline(responsePipelineInputFromLoop(loop));
      expect(result.metadata.stages.map((entry) => entry.stage)).toEqual([
        ...RESPONSE_PIPELINE_STAGES,
      ]);
      for (const entry of result.metadata.stages) {
        expect(['passed', 'failed', 'skipped']).toContain(entry.verdict);
      }
    }
  });

  it('is pure data a surface can render any way: it round-trips through JSON', () => {
    const result = runResponsePipeline(responsePipelineInputFromLoop(loopResult()));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe('a completed answer', () => {
  it('reports success, carries its statements and formats the reply', () => {
    const result = runResponsePipeline(responsePipelineInputFromLoop(loopResult()));
    expect(result.kind).toBe('completed');
    expect(result.success).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.reply).toContain('Risk is within budget.');
    expect(result.reply).toContain('The position stays within the risk budget.');
    expect(result.uncertainty).toEqual(['Live broker data was not consulted.']);
    expect(result.metadata.validation.status).toBe('passed');
    expect(result.metadata.validation.violations).toEqual([]);
  });

  it('labels the answer without upgrading a mixed set to fact', () => {
    const singleFact = loopResult({
      statements: [{ kind: 'fact', text: 'The instrument is liquid.', sources: ['tool:market'] }],
      summary: null,
    });
    expect(runResponsePipeline(responsePipelineInputFromLoop(singleFact)).epistemicKind).toBe(
      'fact',
    );

    const mixed = loopResult({
      statements: [
        { kind: 'fact', text: 'The instrument is liquid.', sources: ['tool:market'] },
        { kind: 'hypothesis', text: 'Momentum continues next week.', sources: [] },
      ],
      summary: null,
    });
    expect(runResponsePipeline(responsePipelineInputFromLoop(mixed)).epistemicKind).toBe(
      'analysis',
    );
  });

  it('ships no chain-of-thought in any field of the result', () => {
    const result = runResponsePipeline(responsePipelineInputFromLoop(loopResult()));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/<thinking/i);
    expect(serialized).not.toMatch(/chain.of.thought/i);
    expect(serialized).not.toMatch(/scratchpad/i);
  });
});

describe('blocked, failed and cancelled runs never look successful', () => {
  it('withholds a blocked run even when it accumulated statements before the limit', () => {
    const result = runResponsePipeline(
      responsePipelineInputFromLoop(
        loopResult({
          status: 'blocked',
          stopReason: { reason: 'iteration-limit', iterationsRun: 5, maxIterations: 5 },
        }),
      ),
    );
    expect(result.kind).toBe('blocked');
    expect(result.success).toBe(false);
    expect(result.statements).toEqual([]);
    expect(result.uncertainty).toEqual([]);
    expect(result.reply).not.toContain('risk budget');
    expect(result.reply).toContain('iteration-limit');
    expect(result.metadata.runStatus).toBe('blocked');
    expect(result.metadata.validation.status).toBe('skipped');
  });

  it('reports a failed run without leaking the raw failure message', () => {
    const result = runResponsePipeline(
      responsePipelineInputFromLoop(
        loopResult({
          status: 'failed',
          stopReason: {
            reason: 'failed',
            message: 'ECONNREFUSED /var/lib/secrets/provider.json at handler (client.ts:42:7)',
          },
        }),
      ),
    );
    expect(result.kind).toBe('failed');
    expect(result.success).toBe(false);
    expect(result.statements).toEqual([]);
    expect(result.reply).not.toContain('ECONNREFUSED');
    expect(result.reply).not.toContain('provider.json');
    // The message itself survives — structured, for internal consumers.
    expect(result.metadata.stopReason).toEqual({
      reason: 'failed',
      message: 'ECONNREFUSED /var/lib/secrets/provider.json at handler (client.ts:42:7)',
    });
  });

  it('treats a cancellation as a prevented response, not an error, and says so exactly', () => {
    const result = runResponsePipeline(
      responsePipelineInputFromLoop(
        loopResult({ status: 'cancelled', stopReason: { reason: 'cancelled' } }),
      ),
    );
    expect(result.kind).toBe('blocked');
    expect(result.success).toBe(false);
    expect(result.metadata.runStatus).toBe('cancelled');
    expect(result.metadata.stopReason).toEqual({ reason: 'cancelled' });
    expect(result.statements).toEqual([]);
    expect(result.reply).not.toContain('risk budget');
  });

  it('refuses to classify an input it could not even normalize', () => {
    const result = runResponsePipeline(
      {} as unknown as ReturnType<typeof responsePipelineInputFromLoop>,
    );
    expect(result.kind).toBe('failed');
    expect(result.success).toBe(false);
    expect(result.metadata.validation.status).toBe('failed');
    expect(result.metadata.validation.stage).toBe('result-normalization');
    expect(result.metadata.validation.violations).toContain('normalize:run-id-missing');
  });
});

describe('incomplete runs are classified honestly', () => {
  it('asks for clarification when the run finished with outstanding work and no answer', () => {
    const result = runResponsePipeline(
      responsePipelineInputFromLoop(
        loopResult({
          statements: [],
          summary: {
            headline: '',
            statements: [],
            uncertainty: ['No sizing was computed.'],
            toolRequests: [{ toolName: 'risk.positionSize', arguments: {}, purpose: null }],
          },
          toolRequests: [{ toolName: 'risk.positionSize', arguments: {}, purpose: null }],
        }),
      ),
    );
    expect(result.kind).toBe('clarification');
    expect(result.success).toBe(false);
    expect(result.statements).toEqual([]);
    expect(result.reply.length).toBeGreaterThan(0);
    expect(result.uncertainty).toEqual(['No sizing was computed.']);
    expect(result.metadata.validation.status).toBe('skipped');
  });

  it('reports unavailable data when the run finished with neither an answer nor work', () => {
    const result = runResponsePipeline(
      responsePipelineInputFromLoop(
        loopResult({ statements: [], summary: null, toolRequests: [] }),
      ),
    );
    expect(result.kind).toBe('unavailable-data');
    expect(result.success).toBe(false);
    expect(result.statements).toEqual([]);
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it('withholds a completed run whose statements do not validate', () => {
    const result = runResponsePipeline(
      responsePipelineInputFromLoop(
        loopResult({
          statements: [{ kind: 'analysis', text: '   ', sources: [] }],
          summary: null,
        }),
      ),
    );
    expect(result.kind).toBe('blocked');
    expect(result.success).toBe(false);
    expect(result.metadata.validation.status).toBe('failed');
    expect(result.metadata.validation.stage).toBe('response-validation');
    expect(result.metadata.validation.violations).toContain('validate:statements[0].text-empty');
    expect(result.reply).not.toContain('   ');
  });
});

describe('the policy check keeps internals from reaching the user', () => {
  const instructionLine =
    'You are the Master Trade training assistant and must never claim to execute a trade.';

  /** A loop result whose only statement reproduces `text`. */
  const leakingLoop = (text: string, harvest: Partial<AgentLoopResult> = {}) =>
    responsePipelineInputFromLoop(
      loopResult({
        statements: [{ kind: 'analysis', text, sources: [] }],
        summary: null,
        ...harvest,
      }),
    );

  it('withholds a response carrying inline reasoning markup', () => {
    const result = runResponsePipeline(
      leakingLoop(
        'The risk looks fine. <thinking>Let me reason about the user’s real intent first…</thinking>',
      ),
    );
    expect(result.kind).toBe('blocked');
    expect(result.success).toBe(false);
    expect(result.metadata.validation.status).toBe('failed');
    expect(result.metadata.validation.stage).toBe('policy-check');
    expect(
      result.metadata.validation.violations.some((code) =>
        code.startsWith('policy:reasoning-markup'),
      ),
    ).toBe(true);
    expect(result.reply).not.toContain('real intent');
  });

  it('withholds a response reproducing the system instructions', () => {
    const result = runResponsePipeline(
      leakingLoop(`As instructed: ${instructionLine}`, {
        runs: [
          {
            assembly: {
              systemInstructions: instructionLine,
              history: [],
              userPrompt: '',
              contextSections: [],
              dropped: [],
              estimatedTokens: 10,
            },
          },
        ] as unknown as AgentLoopResult['runs'],
      }),
    );
    expect(result.kind).toBe('blocked');
    expect(
      result.metadata.validation.violations.some((code) =>
        code.startsWith('policy:runtime-system-instructions'),
      ),
    ).toBe(true);
    expect(result.reply).not.toContain('training assistant');
  });

  it('withholds a response reproducing a delivered context digest or a tool record', () => {
    const digestLeak = runResponsePipeline(
      leakingLoop('Checksum d34db33fdeadbeefcafef00d confirms it.', {
        deliveredDigests: ['d34db33fdeadbeefcafef00d'],
      }),
    );
    expect(digestLeak.kind).toBe('blocked');
    expect(
      digestLeak.metadata.validation.violations.some((code) =>
        code.startsWith('policy:runtime-context-digest'),
      ),
    ).toBe(true);

    const toolLeak = runResponsePipeline(
      leakingLoop('The tool said: permission denied by the risk gate evaluation.', {
        toolRuns: [
          {
            executionId: 'exec_01HZX9K2Q7',
            toolName: 'risk.positionSize',
            toolVersion: '1.0.0',
            status: 'refused',
            refusalReason: 'permission-denied',
            detail: 'permission denied by the risk gate evaluation',
            durationMs: 3,
            timedOut: false,
          },
        ],
      }),
    );
    expect(toolLeak.kind).toBe('blocked');
    expect(
      toolLeak.metadata.validation.violations.some((code) =>
        code.startsWith('policy:runtime-tool-record'),
      ),
    ).toBe(true);
    expect(toolLeak.reply).not.toContain('risk gate evaluation');
  });

  it('withholds a response carrying secret-shaped material or a stack trace', () => {
    const secret = runResponsePipeline(
      leakingLoop('Use sk-AbcDefGhijklMnopQrStuvWxYz123456 for the feed.'),
    );
    expect(secret.kind).toBe('blocked');
    expect(secret.metadata.validation.violations.some((code) => code.includes('secret-'))).toBe(
      true,
    );

    const trace = runResponsePipeline(
      leakingLoop('Broke while reading the feed.\n    at handler (/app/src/server.ts:10:5)'),
    );
    expect(trace.kind).toBe('blocked');
    expect(
      trace.metadata.validation.violations.some((code) => code.startsWith('policy:stack-trace')),
    ).toBe(true);
    expect(trace.reply).not.toContain('/app/src/server.ts');
  });
});

describe('the turn seam behind agent.chat', () => {
  it('passes a clean completed turn through with the reply the service composed', () => {
    const reply = 'Risk stays within the budget. Diversification reduces concentration.';
    const result = runResponsePipeline(
      responsePipelineInputFromTurn('corr_1', {
        status: 'completed',
        reply,
        statements: [
          { kind: 'analysis', text: 'Risk stays within the budget.', sources: [] },
          { kind: 'analysis', text: 'Diversification reduces concentration.', sources: [] },
        ],
      }),
    );
    expect(result.kind).toBe('completed');
    expect(result.success).toBe(true);
    expect(result.reply).toBe(reply);
    expect(result.epistemicKind).toBe('analysis');
    expect(result.metadata.runId).toBe('corr_1');
    expect(result.metadata.stopReason).toBeNull();
    expect(result.metadata.validation.status).toBe('passed');
  });

  it('preserves a clean refusal as the reply while still reporting blocked', () => {
    const refusal = 'The analysis was not produced: the declared inputs do not support it.';
    const result = runResponsePipeline(
      responsePipelineInputFromTurn('run_9', {
        status: 'blocked',
        reply: refusal,
        statements: [],
      }),
    );
    expect(result.kind).toBe('blocked');
    expect(result.success).toBe(false);
    expect(result.reply).toBe(refusal);
    expect(result.epistemicKind).toBe('uncertainty');
    expect(result.statements).toEqual([]);
    expect(result.metadata.runId).toBe('run_9');
  });

  it('withholds even the candidate reply when it carries leaked internals', () => {
    const result = runResponsePipeline(
      responsePipelineInputFromTurn('run_9', {
        status: 'blocked',
        reply:
          'Blocked. Internal detail: at run (/app/loop.ts:88:3) and token ghp_AbCdEfGh1234567890abcdEfGh1234567890.',
        statements: [],
      }),
    );
    expect(result.metadata.validation.status).toBe('failed');
    expect(result.metadata.validation.stage).toBe('policy-check');
    expect(result.reply).not.toContain('loop.ts');
    expect(result.reply).not.toContain('ghp_');
  });
});

describe('the handler is wired to the pipeline', () => {
  it('finalizes agent.chat responses through runResponsePipeline', () => {
    const source = readFileSync('src/server/handlers/agent.ts', 'utf8');
    expect(source).toContain('runResponsePipeline(');
    expect(source).toContain('responsePipelineInputFromTurn(');
    expect(source).toContain('responsePipeline:');
  });
});
