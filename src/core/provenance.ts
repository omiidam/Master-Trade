/**
 * Provenance and trust.
 *
 * Every piece of knowledge the agent can use carries provenance: where it came
 * from and how much it should be trusted. This is the foundation of the audit
 * trail and of the rule "unverified information must never become trusted
 * knowledge".
 */

import type { EpistemicKind } from '../types.js';
import { PolicyViolationError } from './errors.js';

/** Ordered by increasing trust. */
export type TrustLevel = 'unverified' | 'verified' | 'authoritative';

export const TRUST_ORDER: Record<TrustLevel, number> = {
  unverified: 0,
  verified: 1,
  authoritative: 2,
};

export type ProvenanceSource =
  'tool' | 'human' | 'model' | 'market-data' | 'document' | 'synthetic';

export interface Provenance {
  source: ProvenanceSource;
  /** Stable reference (tool name, file id, provider id, user id, ...). */
  ref: string;
  trust: TrustLevel;
  recordedAt: string; // ISO timestamp
  note?: string;
}

/**
 * Who is allowed to raise a trust level. `model` is deliberately absent:
 * an LLM can never promote its own output to verified/authoritative.
 */
export type TrustVerifier = { kind: 'human'; id: string } | { kind: 'tool'; id: string };

export function provenance(input: {
  source: ProvenanceSource;
  ref: string;
  trust: TrustLevel;
  recordedAt?: string;
  note?: string;
}): Provenance {
  const base: Provenance = {
    source: input.source,
    ref: input.ref,
    trust: input.trust,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  return input.note === undefined ? base : { ...base, note: input.note };
}

/** Provenance for model-authored text. Always unverified. */
export function modelProvenance(ref: string, note?: string): Provenance {
  return provenance({ source: 'model', ref, trust: 'unverified', note });
}

/** Provenance for deterministic tool output; trusted as fact. */
export function toolProvenance(ref: string): Provenance {
  return provenance({ source: 'tool', ref, trust: 'authoritative' });
}

/** Provenance for clearly-labeled synthetic data (never treated as real). */
export function syntheticProvenance(ref: string): Provenance {
  return provenance({
    source: 'synthetic',
    ref,
    trust: 'verified',
    note: 'synthetic — not real market data',
  });
}

/**
 * Raise (or keep) a trust level. Lowering is always allowed; raising requires
 * a non-model verifier, so automated reasoning cannot launder unverified text
 * into trusted knowledge.
 */
export function promoteTrust(
  from: TrustLevel,
  to: TrustLevel,
  verifier: TrustVerifier,
): TrustLevel {
  if (TRUST_ORDER[to] <= TRUST_ORDER[from]) return from;
  if (to === 'authoritative' && verifier.kind !== 'human') {
    throw new PolicyViolationError(
      'Only a human verifier may grant authoritative trust to a memory record.',
      { from, to, verifier: verifier.id },
    );
  }
  return to;
}

/**
 * How a record of the given trust level must be labelled when it reaches the
 * model. Unverified material is never presented as fact.
 */
export function contextKindForTrust(trust: TrustLevel): EpistemicKind {
  switch (trust) {
    case 'unverified':
      return 'uncertainty';
    case 'verified':
      return 'analysis';
    case 'authoritative':
      return 'fact';
  }
}
