/**
 * Versioned instructions.
 *
 * Instructions are immutable, versioned documents loaded at runtime and
 * attached to every agent run so behavior is reproducible and auditable.
 * Changing instructions = new version, never an in-place edit.
 */

import { DEFAULT_SAFETY_PROFILE, type SafetyProfile } from '../../packages/shared/src/types.js';

export interface InstructionModule {
  id: string;
  version: string; // semver
  /** Pure-text instruction body (rules, constraints, tone, policies). */
  content: string;
}

export interface InstructionSet {
  /** Ordered modules; first has highest precedence. */
  modules: InstructionModule[];
}

/** Validates that an instruction set does not weaken the safety profile. */
function assertSafetyCompliant(set: InstructionSet): void {
  // Detects *authorization* language, not mere mention (prohibitions are fine).
  const forbidden = [
    /\bmay\s+(place|execute|submit)\b/i,
    /\b(allowed|permitted)\s+to\s+(trade|place|execute|connect)/i,
    /\bconnect\s+to\s+(a\s+)?broker/i,
    /\b(authorize|enable|activate)\s+(live\s+trading|order\s+placement|execution)/i,
  ];
  for (const module of set.modules) {
    for (const pattern of forbidden) {
      if (pattern.test(module.content)) {
        throw new Error(
          `Instruction module ${module.id}@${module.version} violates safety policy (matched /${pattern.source}/). ` +
            'Instructions may not authorize live trading or execution.',
        );
      }
    }
  }
}

/** Built-in, immutable Phase 1 instruction set. */
export const CORE_INSTRUCTIONS_V1: InstructionSet = {
  modules: [
    {
      id: 'core.behavior',
      version: '1.0.0',
      content: [
        'You are Master Trade, a trading TRAINING agent. You teach and explain; you never trade.',
        'Distinguish clearly between facts (tool outputs), analysis (interpretation),',
        'hypotheses (testable ideas) and uncertainty (unknowns).',
        'All numeric risk results must come from deterministic tools; never invent them.',
        'Never present synthetic data as real market data.',
        'If asked to trade or execute, refuse and explain that execution is disabled by design.',
      ].join(' '),
    },
    {
      id: 'core.safety',
      version: '1.0.0',
      content: [
        'No live trading. No broker connections. No order placement.',
        'New trading rules require explicit human approval before activation.',
        'When uncertain, say so explicitly and label the statement as uncertainty.',
      ].join(' '),
    },
  ],
};

/** Load and validate an instruction set. */
export function loadInstructions(set: InstructionSet = CORE_INSTRUCTIONS_V1): InstructionSet {
  assertSafetyCompliant(set);
  return set;
}

/** Render instructions as a single prompt-ready string with version stamps. */
export function renderInstructions(set: InstructionSet): string {
  return set.modules.map((m) => `## ${m.id} @ ${m.version}\n${m.content}`).join('\n\n');
}

/** The safety profile instructions are always paired with. */
export function safetyProfile(): SafetyProfile {
  return DEFAULT_SAFETY_PROFILE;
}
