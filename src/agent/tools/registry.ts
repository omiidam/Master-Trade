/**
 * The centralized Tool Registry — the one server-side execution path for
 * agent tools.
 *
 * Tools are registered here and only here; the Agent Loop Engine (and any
 * future caller) discovers them with `list()`/`get()` and runs them with
 * `invoke()`. One `invoke` is one gate sequence, in this order, each stage
 * refusing without ever reaching the next:
 *
 *   1. **identity** — the invocation carries an `AgentToolContext` (user +
 *      run); a malformed one is a caller bug and throws. A tool run without
 *      a user identity can never happen, so isolation is structural.
 *   2. **existence** — an unknown tool is refused, not guessed.
 *   3. **approval** — a tool that declared `requiresApproval` runs only
 *      when the injected approval seam (the existing human approval
 *      workflow, ADR-0057 discipline) says an approval exists.
 *   4. **permissions** — every declared capability is checked against the
 *      existing deny-by-default permission system (`checkPermission` over
 *      `PHASE1_PERMISSIONS`). This module does not re-implement
 *      permissions; it consumes the one that exists.
 *   5. **input validation** — arguments are parsed against the tool's zod
 *      input schema; nothing unvalidated reaches `execute`.
 *   6. **execution** — server-side only, under the tool's own timeout.
 *   7. **output validation** — the result is parsed against the tool's zod
 *      output schema before it is returned to the loop; a tool that
 *      returns the wrong shape fails instead of leaking a bad payload.
 *
 * Every invocation settles into one `AgentToolRunOutcome` — `succeeded`,
 * `failed`, `timeout` or `refused` — and leaves one `ToolExecutionRecord`
 * with the status, the error, the duration and the user/run scope. Records
 * are in-memory and bounded: basic status and error recording for this
 * phase, not a persistent tool history.
 *
 * What this module deliberately does not do: execute anything in the
 * client, register a trading action (the category is gated at contract
 * level and no trading tool ships in this phase), implement RAG/retrieval,
 * evaluation or learning, or touch the harness, run manager, context
 * builder or gateway — the loop composes those; this module never does.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../packages/shared/src/core/errors.js';
import { checkPermission, PHASE1_PERMISSIONS } from '../../permissions/model.js';
import {
  assertAgentToolContract,
  agentToolContextSchema,
  type AgentTool,
  type AgentToolContext,
  type AgentToolDescriptor,
} from './contracts.js';
import { ToolPermissionGate, type ToolGateEvaluation } from './permissionGate.js';

// ── Outcomes and records ───────────────────────────────────────────────────

export type ToolRunStatus = 'succeeded' | 'failed' | 'timeout' | 'refused';

/** Why an invocation was refused before execution was ever attempted. */
export type ToolRefusalReason =
  | 'unknown-tool'
  | 'permission-denied'
  | 'approval-required'
  | 'invalid-input'
  | 'missing-identity'
  | 'duplicate-request'
  | 'gate-blocked';

/** The settled result of one invocation. Failures are values, not throws. */
export interface AgentToolRunOutcome {
  executionId: string;
  toolName: string;
  toolVersion: string;
  status: ToolRunStatus;
  /** Present when `refused`: which gate said no. */
  refusalReason?: ToolRefusalReason;
  /** Human-readable error or refusal detail; present when not succeeded. */
  detail?: string;
  /** The validated output; present only when `succeeded`. */
  output?: unknown;
  durationMs: number;
  timedOut: boolean;
  /** The permission-gate decision behind this outcome, with every check. */
  gate?: ToolGateEvaluation;
}

/** The durable-for-this-process trace of one invocation. */
export interface ToolExecutionRecord {
  executionId: string;
  toolName: string;
  toolVersion: string;
  userId: string;
  runId: string;
  correlationId?: string;
  status: ToolRunStatus;
  detail?: string;
  durationMs: number;
  at: string;
}

export interface ToolRecordFilter {
  userId?: string;
  runId?: string;
  toolName?: string;
  status?: ToolRunStatus;
}

export interface AgentToolRegistryOptions {
  /**
   * The approval seam for `requiresApproval` tools: does a current human
   * approval exist for this tool, for this context? Production wiring
   * delegates to the existing `ApprovalWorkflow`; in this phase no tool
   * that needs it is registered, and an unapproved call is refused.
   */
  isApproved?: (toolName: string, context: AgentToolContext) => boolean;
  /** In-memory record cap; the oldest record is evicted. Default 1000. */
  maxRecords?: number;
  now?: () => number;
  idFactory?: () => string;
  /**
   * The centralized permission gate every invocation passes through before
   * execution. Defaults to the standard gate; injection lets a deployment
   * tighten policy without the Registry ever growing permission logic.
   */
  gate?: ToolPermissionGate;
}

const TIMEOUT_SENTINEL: unique symbol = Symbol('tool-timeout');

// ── The registry ───────────────────────────────────────────────────────────

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();
  private readonly recordLog: ToolExecutionRecord[] = [];
  private readonly isApproved:
    ((toolName: string, context: AgentToolContext) => boolean) | undefined;
  private readonly maxRecords: number;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly gate: ToolPermissionGate;

  constructor(options: AgentToolRegistryOptions = {}) {
    this.isApproved = options.isApproved;
    this.maxRecords = options.maxRecords ?? 1_000;
    if (!Number.isInteger(this.maxRecords) || this.maxRecords < 1) {
      throw new AppError('VALIDATION_FAILED', 'registry maxRecords must be a positive integer', {
        details: { maxRecords: this.maxRecords },
      });
    }
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.gate = options.gate ?? new ToolPermissionGate();
  }

  /** Register a tool. Duplicate names and invalid contracts are loud bugs. */
  register<I, O>(tool: AgentTool<I, O>): void {
    assertAgentToolContract(tool as unknown as AgentTool);
    if (this.tools.has(tool.name)) {
      throw new AppError('VALIDATION_FAILED', `tool already registered: ${tool.name}`, {
        details: { name: tool.name },
      });
    }
    this.tools.set(tool.name, tool as unknown as AgentTool);
  }

  /** Discovery: every registered tool's contract, minus how to run it. */
  list(): AgentToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      version: tool.version,
      description: tool.description,
      category: tool.category,
      capabilities: [...tool.capabilities],
      riskLevel: tool.riskLevel,
      timeoutMs: tool.timeoutMs,
      requiresApproval: tool.requiresApproval,
      sideEffects: tool.sideEffects,
    }));
  }

  get(name: string): AgentToolDescriptor | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;
    return this.list().find((descriptor) => descriptor.name === name);
  }

  /** The records this process still holds, newest last, filtered. */
  records(filter: ToolRecordFilter = {}): readonly ToolExecutionRecord[] {
    return this.recordLog.filter(
      (record) =>
        (filter.userId === undefined || record.userId === filter.userId) &&
        (filter.runId === undefined || record.runId === filter.runId) &&
        (filter.toolName === undefined || record.toolName === filter.toolName) &&
        (filter.status === undefined || record.status === filter.status),
    );
  }

  /**
   * The one execution path. See the module contract for the gate order.
   * Refusals and failures are returned as outcomes — never thrown — so a
   * caller (the loop) can feed the exact reason back to the model instead
   * of aborting the run.
   */
  async invoke(
    name: string,
    args: unknown,
    context: AgentToolContext,
  ): Promise<AgentToolRunOutcome> {
    const contextCheck = agentToolContextSchema.safeParse(context);
    if (!contextCheck.success) {
      // A malformed isolation scope is a caller bug, not a model error:
      // throw rather than fabricate an outcome with no scope to record.
      throw new AppError('VALIDATION_FAILED', 'tool invocation requires a valid user/run context', {
        details: { issues: contextCheck.error.issues.map((issue) => issue.message) },
      });
    }
    const startedAt = this.now();
    const executionId = this.idFactory();
    const tool = this.tools.get(name);

    // The centralized permission gate: exactly one pre-execution decision
    // (ALLOW / BLOCK / REQUIRE_APPROVAL) over user, run, tool, risk and
    // approval — deny by default on missing information. Every outcome
    // carries the evaluation, so the run trace records the decision and
    // its reason. Nothing executes without it: this is the only path.
    const evaluation = this.gate.evaluate(
      tool,
      {
        ...context,
        approvalGranted: tool !== undefined && this.isApproved?.(name, context) === true,
      },
      name,
    );
    if (evaluation.decision === 'BLOCK') {
      const refusalReason =
        tool === undefined
          ? 'unknown-tool'
          : evaluation.checks.tool.verdict === 'block'
            ? 'permission-denied'
            : 'gate-blocked';
      return this.settle(startedAt, executionId, name, tool?.version ?? 'unknown', context, {
        status: 'refused',
        refusalReason,
        detail: evaluation.reason,
        gate: evaluation,
      });
    }
    if (tool === undefined) {
      // Unreachable — the gate blocks every unknown tool above — but a
      // missing tool must never reach execution even if policy changes.
      return this.settle(startedAt, executionId, name, 'unknown', context, {
        status: 'refused',
        refusalReason: 'unknown-tool',
        detail: `no tool registered under the name "${name}"`,
        gate: evaluation,
      });
    }
    if (evaluation.decision === 'REQUIRE_APPROVAL') {
      return this.settle(startedAt, executionId, name, tool.version, context, {
        status: 'refused',
        refusalReason: 'approval-required',
        detail: evaluation.reason,
        gate: evaluation,
      });
    }
    const parsedInput = tool.inputSchema.safeParse(args);
    if (!parsedInput.success) {
      return this.settle(startedAt, executionId, name, tool.version, context, {
        status: 'refused',
        refusalReason: 'invalid-input',
        detail: parsedInput.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
        gate: evaluation,
      });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raced = await Promise.race([
        tool.execute(parsedInput.data, context).then(
          (value) => ({ ok: true as true, value }),
          (error: unknown) => ({ ok: false as false, error }),
        ),
        new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
          timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), tool.timeoutMs);
        }),
      ]);
      if (raced === TIMEOUT_SENTINEL) {
        return this.settle(startedAt, executionId, name, tool.version, context, {
          status: 'timeout',
          detail: `tool ${name} exceeded its ${tool.timeoutMs}ms timeout`,
          timedOut: true,
          gate: evaluation,
        });
      }
      if (!raced.ok) {
        const error = raced.error;
        return this.settle(startedAt, executionId, name, tool.version, context, {
          status: 'failed',
          detail: error instanceof Error ? error.message : String(error),
          gate: evaluation,
        });
      }
      const parsedOutput = tool.outputSchema.safeParse(raced.value);
      if (!parsedOutput.success) {
        return this.settle(startedAt, executionId, name, tool.version, context, {
          status: 'failed',
          detail: `output failed the tool's own schema: ${parsedOutput.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ')}`,
          gate: evaluation,
        });
      }
      return this.settle(startedAt, executionId, name, tool.version, context, {
        status: 'succeeded',
        output: parsedOutput.data,
        gate: evaluation,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Record and return. Every invocation leaves exactly one record. */
  private settle(
    startedAt: number,
    executionId: string,
    toolName: string,
    toolVersion: string,
    context: AgentToolContext,
    outcome: Omit<
      AgentToolRunOutcome,
      'executionId' | 'toolName' | 'toolVersion' | 'durationMs' | 'timedOut'
    > & { timedOut?: boolean; gate?: ToolGateEvaluation },
  ): AgentToolRunOutcome {
    const durationMs = Math.max(0, this.now() - startedAt);
    const full: AgentToolRunOutcome = {
      executionId,
      toolName,
      toolVersion,
      durationMs,
      timedOut: outcome.timedOut ?? false,
      status: outcome.status,
      ...(outcome.refusalReason === undefined ? {} : { refusalReason: outcome.refusalReason }),
      ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
      ...(outcome.output === undefined ? {} : { output: outcome.output }),
      ...(outcome.gate === undefined ? {} : { gate: outcome.gate }),
    };
    const record: ToolExecutionRecord = {
      executionId,
      toolName,
      toolVersion,
      userId: context.userId,
      runId: context.runId,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
      status: full.status,
      ...(full.detail === undefined ? {} : { detail: full.detail }),
      durationMs,
      at: new Date(this.now()).toISOString(),
    };
    this.recordLog.push(record);
    while (this.recordLog.length > this.maxRecords) this.recordLog.shift();
    return full;
  }
}

/**
 * Deterministic JSON serialization for tool outcomes: the loop embeds them
 * in a context section, so the text must be stable and must never throw on
 * an odd value a tool produced.
 */
export function serializeToolOutcomes(outcomes: readonly AgentToolRunOutcome[]): string {
  try {
    return JSON.stringify(outcomes, null, 2);
  } catch {
    return JSON.stringify(
      outcomes.map((outcome) => ({
        executionId: outcome.executionId,
        toolName: outcome.toolName,
        status: outcome.status,
        ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
      })),
    );
  }
}
