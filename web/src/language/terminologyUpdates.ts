/**
 * The controlled way a term enters the lexicon — Phase 7.5.2.2.
 *
 * Candidate → validation → source and reason → accepted or rejected → versioned knowledge.
 *
 * That flow is the phase's, and every step of it is already half-built in this project: the language
 * store validates, versions and reviews; the normalization pipeline decides whether Persian text is in
 * canonical form; and the lexicon view reads the result. What this file adds is the *candidate* — the
 * shape a term arrives in, the checks that are specific to terminology, and the decision object a
 * caller acts on. It is a thin layer on purpose. A second store, a second version counter or a second
 * reviewer would be the duplicate terminology system this phase forbids.
 *
 * Three things are worth stating before the code, because they are the reasons it looks the way it does.
 *
 * **A rejection is a value, not an exception.** "This candidate is not acceptable, and here is why" is
 * the ordinary outcome of proposing a word, and a caller that has to catch an exception to learn it is
 * a caller that will forget to. Only a genuine fault — a store that moved under a correct write, a bug
 * in a rule — throws.
 *
 * **A candidate is validated before it is stored, and validated as *Persian*.** A preferred form must
 * contain Persian letters and must already be canonical: storing `كتاب` with an Arabic kaf would put a
 * form into the lexicon that the product's own normalizer would rewrite, and the same string would then
 * be two different words depending on who asked.
 *
 * **A correction must name what it replaces.** When a candidate improves a term the store already holds,
 * the old form has to appear among its alternatives. That is what makes the store's version history
 * useful rather than merely complete: the superseded form keeps being reported by
 * `terminologyFindings`, so the next person to write it is told what the product decided instead of
 * rediscovering it.
 */

import { z } from 'zod';
import { AppError } from '@shared/core/errors';
import { LANGUAGE_ORIGINS, type LanguageKnowledgeEntry, type LanguageOrigin } from './model.js';
import { LanguageMemory } from './memory.js';
import { normalizePersianContent } from './normalize.js';
import {
  TERMINOLOGY_DOMAINS,
  allAlternatives,
  lexiconTerms,
  terminologyKey,
  type LexiconTerm,
  type TerminologyDomain,
} from './terminology.js';

/** A term someone proposes the product should write. */
export interface TermCandidate {
  /** The concept, unique across domains: `max-drawdown`, `nav-journal`. */
  readonly concept: string;
  readonly domain: TerminologyDomain;
  /** The English the product already shows. */
  readonly english: string;
  /** The Persian form being proposed. */
  readonly preferredFa: string;
  readonly alternativesFa?: readonly string[];
  /** One sentence on where it is used. */
  readonly usage: string;
  readonly origin: LanguageOrigin;
  /** Where this came from — a review record, a style guide, a person. Never empty. */
  readonly reference: string;
  readonly recordedAt: string;
  readonly confidence?: number;
  /** The version this candidate believes it is replacing; 0 or absent means "this is new". */
  readonly baseVersion?: number;
}

/** What happened to a candidate. */
export type TermDecision =
  | {
      readonly outcome: 'accepted';
      readonly entry: LanguageKnowledgeEntry;
      readonly term: LexiconTerm;
    }
  | {
      readonly outcome: 'pending';
      readonly entry: LanguageKnowledgeEntry;
      readonly reason: string;
    }
  | { readonly outcome: 'rejected'; readonly reason: string; readonly canonicalFa?: string };

/** A Persian letter, which is what makes a preferred form a Persian form. */
const PERSIAN_LETTER = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF]/u;

const candidateSchema = z.strictObject({
  concept: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'a concept is lower-case words joined by hyphens'),
  domain: z.enum(TERMINOLOGY_DOMAINS),
  english: z.string().min(1).max(120),
  preferredFa: z.string().min(1).max(120),
  alternativesFa: z.array(z.string().min(1).max(120)).max(20).optional(),
  usage: z.string().min(1).max(300),
  origin: z.enum(LANGUAGE_ORIGINS),
  reference: z.string().min(1).max(300),
  recordedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'recordedAt must be an ISO-8601 instant',
  }),
  confidence: z.number().finite().min(0).max(1).optional(),
  baseVersion: z.number().int().nonnegative().optional(),
});

/** A refusal, with the sentence that explains it. */
function refuse(reason: string, canonicalFa?: string): TermDecision {
  return canonicalFa === undefined
    ? { outcome: 'rejected', reason }
    : { outcome: 'rejected', reason, canonicalFa };
}

/**
 * Check a candidate against everything terminology knows, and store it through the ordinary proposal
 * path if it passes.
 *
 * The checks run in the order a person would make them: is this even a candidate, is the Persian
 * Persian, is it the form this project writes, does it collide with a decision already made, and does
 * it say what it replaces.
 */
export function reviewTermCandidate(candidate: unknown, memory: LanguageMemory): TermDecision {
  const parsed = candidateSchema.safeParse(candidate);
  if (!parsed.success) {
    return refuse(
      `the candidate is not usable: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'candidate'} ${issue.message}`)
        .join('; ')}`,
    );
  }
  const asked = parsed.data;
  const key = terminologyKey(asked.domain, asked.concept);
  const canonical = normalizePersianContent(asked.preferredFa).text;

  if (!PERSIAN_LETTER.test(asked.preferredFa)) {
    return refuse(
      `\`${asked.preferredFa}\` carries no Persian letter, so it is not a Persian form.`,
    );
  }
  if (canonical !== asked.preferredFa) {
    return refuse(
      `\`${asked.preferredFa}\` is not in canonical form — this product normalizes Persian before it uses it.`,
      canonical,
    );
  }

  const alternatives = [...new Set(asked.alternativesFa ?? [])];
  if (alternatives.includes(asked.preferredFa)) {
    return refuse('a preferred form cannot also be one of its alternatives.');
  }
  for (const alternative of alternatives) {
    if (!PERSIAN_LETTER.test(alternative)) {
      return refuse(`the alternative \`${alternative}\` carries no Persian letter.`);
    }
    const existing = lexiconTerms(memory).find(
      (term) => term.id !== asked.concept && term.preferredFa === alternative,
    );
    if (existing !== undefined) {
      return refuse(
        `\`${alternative}\` is already the preferred form of \`${existing.id}\`, so it cannot be an alternative here.`,
      );
    }
  }

  const conflict = lexiconTerms(memory).find(
    (term) => term.id !== asked.concept && term.preferredFa === asked.preferredFa,
  );
  if (conflict !== undefined) {
    return refuse(
      `\`${asked.preferredFa}\` is already the preferred form of \`${conflict.id}\`; one form cannot mean two concepts.`,
    );
  }
  for (const term of lexiconTerms(memory)) {
    if (term.id === asked.concept) continue;
    if (allAlternatives(term).includes(asked.preferredFa)) {
      return refuse(
        `\`${asked.preferredFa}\` is a form this product explicitly does not write for \`${term.id}\`.`,
      );
    }
  }

  const current = memory.get(key);
  const baseVersion = asked.baseVersion ?? current?.version ?? 0;
  if (
    current !== undefined &&
    current.status === 'trusted' &&
    current.value !== asked.preferredFa
  ) {
    if (!alternatives.includes(current.value)) {
      return refuse(
        `a correction must say what it replaces: add \`${current.value}\` to the alternatives, so the form this product wrote until version ${current.version} stays reported.`,
      );
    }
  }

  let result;
  try {
    result = memory.propose({
      key,
      kind: 'terminology',
      value: asked.preferredFa,
      origin: asked.origin,
      reference: asked.reference,
      recordedAt: asked.recordedAt,
      baseVersion,
      confidence: asked.confidence ?? 0.8,
      examples: [asked.english, ...alternatives],
      mapping: null,
      notes: [
        `English: ${asked.english}.`,
        `Used for: ${asked.usage}.`,
        `Forms this product does not write: ${alternatives.join('، ')}.`,
      ].join(' '),
    });
  } catch (error) {
    if (error instanceof AppError && error.code === 'CONFLICT') {
      return refuse(
        `\`${key}\` has moved since this candidate was written (expected version ${baseVersion}).`,
      );
    }
    throw error;
  }

  const term = lexiconTerms(memory).find((candidate_) => candidate_.id === asked.concept);
  if (result.outcome === 'pending') {
    return {
      outcome: 'pending',
      entry: result.entry,
      reason:
        'the candidate came from `agent-proposal`, so it is recorded and is not knowledge; a review with a trusted origin is what accepts it.',
    };
  }
  if (term === undefined) throw new Error(`${key} was accepted but the lexicon does not show it`);
  return { outcome: 'accepted', entry: result.entry, term };
}

/** Accept a candidate that is waiting for a review. The reviewer's provenance becomes the term's. */
export function acceptTermCandidate(
  key: string,
  memory: LanguageMemory,
  review: { origin: LanguageOrigin; reference: string; at: string; expectedVersion: number },
): TermDecision {
  const entry = memory.review(key, { decision: 'accept', ...review });
  if (entry === undefined) return refuse(`\`${key}\` was not accepted`);
  const concept = key.split('.').slice(2).join('.');
  const term = lexiconTerms(memory).find((candidate) => candidate.id === concept);
  return term === undefined
    ? refuse(`\`${key}\` was accepted but the lexicon does not show it`)
    : { outcome: 'accepted', entry, term };
}

/**
 * Reject a waiting candidate, with the reviewer's reason.
 *
 * The reason is not stored as an entry — the store's log records the decision, its origin and its
 * reference — so the sentence a reviewer writes belongs in that `reference`, which is where the
 * history will be read from later.
 */
export function rejectTermCandidate(
  key: string,
  memory: LanguageMemory,
  review: { origin: LanguageOrigin; reference: string; at: string; expectedVersion: number },
): TermDecision {
  memory.review(key, { decision: 'reject', ...review });
  return refuse(`reviewed and rejected: ${review.reference}`);
}
