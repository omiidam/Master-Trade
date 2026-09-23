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

/**
 * Validate the *shape* of an instruction set before its text is scanned.
 *
 * The safety scan below reads `module.content`, so a module whose text sits under any other key was
 * invisible to it — the set loaded, `renderInstructions` rendered `undefined`, and the
 * authorization the scan exists to refuse was never seen (VULN-003, end-of-Phase-6 security gate).
 *
 * This is the rule that closes it: a module is `id`, `version` and `content`, all present and
 * non-empty, and a set has at least one module. Validation runs first, so there is no document the
 * scan can skip over: text that is not in `content` is a refusal, not a module the scan overlooked.
 */
function assertWellFormed(set: InstructionSet): void {
  const modules = (set as { modules?: unknown } | null)?.modules;
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error('an instruction set must declare at least one module');
  }
  for (const [index, module] of (modules as readonly unknown[]).entries()) {
    const candidate = module as Partial<InstructionModule> | null;
    for (const field of ['id', 'version', 'content'] as const) {
      const value = candidate?.[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(
          `instruction module at index ${index} has no ${field}; a module is id, version and content, ` +
            'and content is the only text the safety scan can read.',
        );
      }
    }
  }
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

/** Load and validate an instruction set: shape first, then the safety scan over its text. */
export function loadInstructions(set: InstructionSet = CORE_INSTRUCTIONS_V1): InstructionSet {
  assertWellFormed(set);
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
