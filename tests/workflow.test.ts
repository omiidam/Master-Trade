import { describe, expect, it } from 'vitest';
import { ApprovalWorkflow } from '../src/agent/approval.js';
import { RuleRegistry } from '../src/agent/proposals.js';
import { assembleContext, sectionsFromMemory, section } from '../src/agent/context.js';
import { InMemoryVectorMemory } from '../src/vector/memory.js';
import { modelProvenance, toolProvenance } from '../src/core/provenance.js';
import { PolicyViolationError } from '../src/core/errors.js';
import type { Principal } from '../src/auth/model.js';

const principal = (roles: Principal['roles'], id: string): Principal => ({
  id,
  roles,
  session: {
    id: `sess_${id}`,
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
});

const owner = principal(['owner'], 'owner-1');
const coach = principal(['coach'], 'coach-1');

describe('approval workflow', () => {
  it('only accepts approval-gated operations', () => {
    const approvals = new ApprovalWorkflow();
    expect(() =>
      approvals.submit({
        operation: 'agent.chat',
        subjectRef: 'x',
        requestedBy: 'student-1',
        rationale: 'n/a',
      }),
    ).toThrow(PolicyViolationError);
  });

  it('refuses self-approval and unauthorized approvers', () => {
    const approvals = new ApprovalWorkflow();
    const request = approvals.submit({
      operation: 'rule.activate',
      subjectRef: 'rule-1',
      requestedBy: 'coach-1',
      rationale: 'evidence attached',
      evidence: [toolProvenance('evaluation:1')],
    });

    expect(() => approvals.decide(request.id, coach, true)).toThrow(/own request/i);
    expect(() => approvals.decide(request.id, principal(['student'], 'student-9'), true)).toThrow(
      /approver role/i,
    );
    expect(approvals.isApproved(request.id)).toBe(false);
  });

  it('records a genuine approval and rejects expired requests', () => {
    let now = 1_000_000;
    const approvals = new ApprovalWorkflow({ now: () => now, ttlMs: 1_000 });
    const request = approvals.submit({
      operation: 'rule.activate',
      subjectRef: 'rule-2',
      requestedBy: 'coach-1',
      rationale: 'deterministic evaluation attached',
      evidence: [toolProvenance('evaluation:2')],
    });

    now += 5_000;
    expect(approvals.get(request.id)?.status).toBe('expired');
    expect(() => approvals.decide(request.id, owner, true)).toThrow(/expired/i);

    const fresh = new ApprovalWorkflow({ now: () => now });
    const second = fresh.submit({
      operation: 'rule.activate',
      subjectRef: 'rule-3',
      requestedBy: 'coach-1',
      rationale: 'ok',
      evidence: [toolProvenance('evaluation:3')],
    });
    const decided = fresh.decide(second.id, owner, true, 'looks reasonable');
    expect(decided.status).toBe('approved');
    expect(fresh.isApproved(second.id)).toBe(true);
    expect(fresh.decision(second.id)?.decidedBy).toBe('owner-1');
  });
});

describe('rule proposals', () => {
  it('cannot be activated without evaluation and human approval', () => {
    const registry = new RuleRegistry();
    const approvals = new ApprovalWorkflow();
    const proposal = registry.propose({
      origin: 'model',
      proposedBy: 'scripted-model',
      ruleText: 'Skip trades when the daily range is below the 20-day average.',
      hypothesis: 'Low-volatility regimes produce worse win rates for breakout entries.',
    });

    expect(() => registry.activate(proposal.id, approvals)).toThrow(
      /without a completed evaluation/i,
    );

    registry.attachEvaluation({
      proposalId: proposal.id,
      method: 'deterministic-metrics',
      metrics: { winRate: 0.42, sampleSize: 120 },
      verdict: 'promising',
      evaluatedAt: new Date().toISOString(),
    });
    expect(registry.get(proposal.id)?.status).toBe('awaiting-approval');

    expect(() => registry.activate(proposal.id, approvals)).toThrow(/human approval/i);
  });

  it('activates only after a recorded human approval', () => {
    const registry = new RuleRegistry();
    const approvals = new ApprovalWorkflow();
    const proposal = registry.propose({
      origin: 'human',
      proposedBy: 'coach-1',
      ruleText: 'Risk at most 1% of equity per trade.',
      hypothesis: 'Fixed-fractional sizing bounds drawdown.',
    });
    registry.attachEvaluation({
      proposalId: proposal.id,
      method: 'deterministic-metrics',
      metrics: { maxDrawdown: 0.12 },
      verdict: 'promising',
      evaluatedAt: new Date().toISOString(),
    });

    const request = approvals.submit({
      operation: 'rule.activate',
      subjectRef: proposal.id,
      requestedBy: 'coach-1',
      rationale: 'evaluation attached',
      evidence: [toolProvenance('evaluation:4')],
    });
    approvals.decide(request.id, owner, true);

    const activated = registry.activate(proposal.id, approvals);
    expect(activated.status).toBe('active');
    expect(activated.activationApprovalId).toBe(request.id);
    expect(registry.evaluationsFor(proposal.id)).toHaveLength(1);
  });

  it('rejects proposals whose evaluation fails', () => {
    const registry = new RuleRegistry();
    const proposal = registry.propose({
      origin: 'model',
      proposedBy: 'scripted-model',
      ruleText: 'Always double down after a loss.',
      hypothesis: 'Mean reversion recovers quickly.',
    });
    const rejected = registry.attachEvaluation({
      proposalId: proposal.id,
      method: 'deterministic-metrics',
      metrics: { maxDrawdown: 0.9 },
      verdict: 'rejected',
      evaluatedAt: new Date().toISOString(),
    });
    expect(rejected.status).toBe('rejected');
    expect(() => registry.activate(proposal.id, new ApprovalWorkflow())).toThrow(/rejected/i);
  });
});

describe('context assembly', () => {
  it('labels unverified memory as uncertainty and keeps provenance', async () => {
    const memory = new InMemoryVectorMemory();
    await memory.upsert({
      type: 'agent-insight',
      text: 'Perhaps trading only the London session improves results.',
      metadata: { subject: 'sessions', tags: [], createdBy: 'model', epistemicKind: 'hypothesis' },
      provenance: modelProvenance('scripted-model'),
      actorId: 'model',
    });
    const ranked = await memory.query({ text: 'london session results', minScore: 0 });
    const sections = sectionsFromMemory(ranked);
    expect(sections[0]?.label).toBe('uncertainty');
    expect(sections[0]?.trust).toBe('unverified');
  });

  it('never drops instructions and reports what was dropped', () => {
    const assembled = assembleContext(
      [
        section({
          id: 'core.behavior',
          source: 'instructions',
          priority: 100,
          content: 'Never trade.',
        }),
        section({
          id: 'memory:1',
          source: 'memory',
          priority: 50,
          content: 'A very long retrieved passage '.repeat(200),
          trust: 'unverified',
          provenance: modelProvenance('m1'),
        }),
        section({ id: 'conversation:1', source: 'conversation', priority: 40, content: 'hi' }),
      ],
      { maxTokens: 400, reserveForResponse: 100 },
    );
    expect(assembled.sections.map((item) => item.id)).toContain('core.behavior');
    expect(assembled.dropped).toContain('memory:1');
    expect(assembled.truncated).toBe(true);
  });

  it('refuses to assemble memory without provenance', () => {
    expect(() =>
      assembleContext([
        section({ id: 'memory:orphan', source: 'memory', priority: 50, content: 'no source' }),
      ]),
    ).toThrow(/provenance/);
  });

  it('fails loudly rather than truncating the instruction set', () => {
    expect(() =>
      assembleContext(
        [
          section({
            id: 'core.safety',
            source: 'instructions',
            priority: 100,
            content: 'x'.repeat(10_000),
          }),
        ],
        { maxTokens: 500, reserveForResponse: 100 },
      ),
    ).toThrow(/instruction set/);
  });
});
