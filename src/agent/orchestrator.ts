/**
 * Orchestrator — the seam between the Model (LLM) and Tools.
 *
 * Phase 1 ships a deterministic "scripted model" so the whole system runs
 * offline and testably. A real LLM adapter later implements the same
 * ModelAdapter interface; permission checks and provenance do not change.
 */

import { AgentLifecycle } from './lifecycle.js';
import type { AnyTool, ToolCapability, ToolRegistry } from '../tools/framework.js';
import { checkPermission, PHASE1_PERMISSIONS, type Subject } from '../permissions/model.js';
import type { InstructionSet } from '../instructions/loader.js';
import { renderInstructions } from '../instructions/loader.js';
import type { MemoryStore } from '../memory/store.js';
import type { ModelStatement, SafetyProfile } from '../types.js';

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
  /** Subject on whose behalf the model acts (always 'model' in Phase 1). */
  subject?: Subject;
}

export type RunOutcome =
  | { status: 'completed'; statements: ModelStatement[]; toolResults: unknown[] }
  | { status: 'blocked'; reason: string };

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
          const tool: AnyTool | undefined = this.deps.tools.get(source);
          if (!tool) {
            return this.block(`Model referenced unknown tool: ${source}`);
          }
          const capability: ToolCapability = tool.descriptor.capabilities[0]!;
          const decision = checkPermission(
            PHASE1_PERMISSIONS,
            this.deps.subject ?? 'model',
            capability,
          );
          if (!decision.allowed) {
            return this.block(`Permission denied for ${tool.descriptor.name}: ${decision.reason}`);
          }
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

  private block(reason: string): RunOutcome {
    this.lifecycle.transitionTo('BLOCKED');
    this.lifecycle.transitionTo('IDLE');
    return { status: 'blocked', reason };
  }

  state(): string {
    return this.lifecycle.current();
  }
}
