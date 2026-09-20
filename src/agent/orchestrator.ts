/**
 * Orchestrator — the seam between the Model (LLM) and Tools.
 *
 * Phase 1 ships a deterministic "scripted model" so the whole system runs
 * offline and testably. A real LLM adapter later implements the same
 * ModelAdapter interface; permission checks and provenance do not change.
 */

import { AgentLifecycle } from './lifecycle.js';
import type { ContextSection } from './context.js';
import { section } from './context.js';
import type { AsyncModelAdapter, ToolRequest } from './asyncModel.js';
import { toAppError } from '../../packages/shared/src/core/errors.js';
import type { AnyTool, ToolRegistry } from '../tools/framework.js';
import type { ToolResult } from '../tools/framework.js';
import { checkPermission, PHASE1_PERMISSIONS, type Subject } from '../permissions/model.js';
import type { InstructionSet } from '../instructions/loader.js';
import { renderInstructions } from '../instructions/loader.js';
import type { MemoryStore } from '../memory/store.js';
import type { StructuredSummary } from '../llm/summary.js';
import type {
  EpistemicKind,
  ModelStatement,
  SafetyProfile,
} from '../../packages/shared/src/types.js';

/** The reasoning component. Phase 1: scripted; later: real LLM. */
export interface ModelAdapter {
  /** Produce statements given the rendered instructions and user input. */
  respond(input: string, instructions: string): ModelStatement[];
}

/** Deterministic scripted model for Phase 1 (no network, no API key). */
export const scriptedModelAdapter: ModelAdapter = {
  respond(input: string): ModelStatement[] {
    const wantsRisk = /position size|position sizing|risk per trade|how many (shares|units)/i.test(
      input,
    );
    const wantsExecution = /\b(buy|sell|place an order|execute)\b/i.test(input);

    if (wantsExecution) {
      return [
        {
          kind: 'fact',
          text: 'Trade execution is disabled by design in Master Trade. This system is for training only.',
          sources: [],
        },
      ];
    }
    if (wantsRisk) {
      return [
        {
          kind: 'analysis',
          text: 'To size the position I will request the deterministic risk.positionSize tool with your equity, risk percent, entry and stop. I do not compute risk numbers myself.',
          sources: ['risk.positionSize'],
        },
      ];
    }
    return [
      {
        kind: 'analysis',
        text: `Analysis of your question "${input}" will be based on deterministic tool outputs; I will label facts, analysis, hypotheses and uncertainty separately.`,
        sources: [],
      },
    ];
  },
};

export interface OrchestratorDeps {
  tools: ToolRegistry;
  instructions: InstructionSet;
  memory: MemoryStore;
  safety: SafetyProfile;
  model: ModelAdapter;
  /**
   * Reasoning component for the async path (a real provider behind the LLM
   * gateway). Optional: the sync scripted path stays available offline.
   */
  asyncModel?: AsyncModelAdapter;
  /** Subject on whose behalf the model acts (always 'model' in Phase 1). */
  subject?: Subject;
}

export type RunOutcome =
  | { status: 'completed'; statements: ModelStatement[]; toolResults: unknown[] }
  | { status: 'blocked'; reason: string };

/** One deterministic tool run, with the outcome kept as a value. */
export type ToolExecution = {
  tool: string;
  version: string;
  epistemicKind: EpistemicKind;
} & ({ ok: true; value: unknown } | { ok: false; error: string });

/** The outcome of a turn whose reasoning came from an LLM. */
export type AsyncRunOutcome =
  | {
      status: 'completed';
      provider: string;
      model: string;
      latencyMs: number;
      summary: StructuredSummary;
      statements: ModelStatement[];
      toolExecutions: ToolExecution[];
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        costUsd: number;
      };
    }
  | { status: 'blocked'; reason: string };

type Authorization = { allowed: true; tool: AnyTool } | { allowed: false; reason: string };

export class Orchestrator {
  private readonly lifecycle = new AgentLifecycle();
  private readonly deps: OrchestratorDeps;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
    if (deps.safety.liveTradingEnabled || deps.safety.brokerExecutionEnabled) {
      throw new Error('Refusing to start: live trading / broker execution must be disabled.');
    }
  }

  /** Run one full agent turn. Throws if lifecycle is misused. */
  run(userInput: string): RunOutcome {
    this.lifecycle.start(); // IDLE -> LOADING -> READY

    try {
      // 1. Model reasons (no tool access of its own).
      this.lifecycle.transitionTo('RUNNING');
      const instructions = renderInstructions(this.deps.instructions);
      const statements = this.deps.model.respond(userInput, instructions);

      // 2. Requested tool calls are permission-checked and executed here.
      this.lifecycle.transitionTo('RESPONDING');
      const toolResults: unknown[] = [];
      for (const statement of statements) {
        for (const source of statement.sources) {
          const authorization = this.authorizeTool(source);
          if (!authorization.allowed) {
            return this.block(authorization.reason);
          }
          const tool = authorization.tool;
          // Phase 1 tools are side-effect free; record provenance.
          this.deps.memory.append({
            origin: { type: 'tool', descriptor: tool.descriptor },
            epistemicKind: tool.descriptor.semantics.epistemicKind,
            content: `tool invoked: ${tool.descriptor.name} v${tool.descriptor.version}`,
          });
          toolResults.push({ tool: tool.descriptor.name });
        }
      }

      this.lifecycle.transitionTo('IDLE');
      return { status: 'completed', statements, toolResults };
    } catch (e) {
      return this.block(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * One turn whose reasoning came from an LLM provider.
   *
   * The order is the safety property: the model speaks, then every requested tool
   * is authorized and run **here**. A single unknown or denied tool blocks the
   * whole turn — a model that asks for something it may not have does not get a
   * partial run, and the attempt is visible rather than silently dropped.
   */
  async runAsync(
    userInput: string,
    options: {
      correlationId?: string;
      context?: readonly ContextSection[];
      subject?: Subject;
    } = {},
  ): Promise<AsyncRunOutcome> {
    const adapter = this.deps.asyncModel;
    if (!adapter) {
      return this.blockAsync('No async model adapter is registered on this orchestrator');
    }

    this.lifecycle.start(); // IDLE -> LOADING -> READY
    try {
      this.lifecycle.transitionTo('RUNNING');
      const instructions = renderInstructions(this.deps.instructions);
      const turn = await adapter.completeTurn({
        correlationId: options.correlationId ?? 'run-async',
        userInput,
        instructions,
        context: options.context ?? [instructionsSection(instructions)],
      });

      this.lifecycle.transitionTo('RESPONDING');
      const toolExecutions: ToolExecution[] = [];
      for (const request of turn.toolRequests) {
        const authorization = this.authorizeTool(request.toolName, options.subject);
        if (!authorization.allowed) return this.blockAsync(authorization.reason);
        toolExecutions.push(this.executeTool(authorization.tool, request));
      }

      this.lifecycle.transitionTo('IDLE');
      return {
        status: 'completed',
        provider: turn.provider,
        model: turn.model,
        latencyMs: turn.latencyMs,
        summary: turn.summary,
        statements: turn.statements,
        toolExecutions,
        usage: {
          promptTokens: turn.usage.promptTokens,
          completionTokens: turn.usage.completionTokens,
          totalTokens: turn.usage.totalTokens,
          costUsd: turn.usage.costUsd,
        },
      };
    } catch (error) {
      return this.blockAsync(toAppError(error).message);
    }
  }

  /**
   * The one place a tool is authorized. Deny-by-default: no rule means no run,
   * and a tool that declares no capability can never be authorized.
   */
  private authorizeTool(name: string, subject?: Subject): Authorization {
    const tool = this.deps.tools.get(name);
    if (!tool) {
      return { allowed: false, reason: `Model referenced unknown tool: ${name}` };
    }
    const capability = tool.descriptor.capabilities[0];
    if (!capability) {
      return {
        allowed: false,
        reason: `Tool ${name} declares no capability and is denied by default`,
      };
    }
    const decision = checkPermission(
      PHASE1_PERMISSIONS,
      subject ?? this.deps.subject ?? 'model',
      capability,
    );
    if (!decision.allowed) {
      return {
        allowed: false,
        reason: `Permission denied for ${tool.descriptor.name}: ${decision.reason}`,
      };
    }
    return { allowed: true, tool };
  }

  /** Run an authorized, side-effect-free tool and record its provenance. */
  private executeTool(tool: AnyTool, request: ToolRequest): ToolExecution {
    this.deps.memory.append({
      origin: { type: 'tool', descriptor: tool.descriptor },
      epistemicKind: tool.descriptor.semantics.epistemicKind,
      content: `tool invoked: ${tool.descriptor.name} v${tool.descriptor.version}`,
    });
    const result = tool.run(request.arguments) as ToolResult<unknown>;
    const base = {
      tool: tool.descriptor.name,
      version: tool.descriptor.version,
      epistemicKind: tool.descriptor.semantics.epistemicKind,
    };
    return result.ok
      ? { ...base, ok: true, value: result.value }
      : { ...base, ok: false, error: result.error };
  }

  private block(reason: string): RunOutcome {
    this.lifecycle.transitionTo('BLOCKED');
    this.lifecycle.transitionTo('IDLE');
    return { status: 'blocked', reason };
  }

  /**
   * Record a blocked turn from whatever state the run reached. BLOCKED is only
   * reachable from RUNNING and RESPONDING, so a turn refused before it started
   * (e.g. no async model registered) simply reports blocked from IDLE.
   */
  private blockAsync(reason: string): AsyncRunOutcome {
    const state = this.lifecycle.current();
    if (state === 'RUNNING' || state === 'RESPONDING' || state === 'BLOCKED') {
      if (state !== 'BLOCKED') this.lifecycle.transitionTo('BLOCKED');
      this.lifecycle.transitionTo('IDLE');
    }
    return { status: 'blocked', reason };
  }

  state(): string {
    return this.lifecycle.current();
  }
}

/** The minimum context a turn may have: the instruction set itself. */
function instructionsSection(instructions: string): ContextSection {
  return section({
    id: 'instructions',
    source: 'instructions',
    priority: 100,
    content: instructions,
  });
}
