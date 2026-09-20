/**
 * Memory module mock data.
 *
 * This models the *knowledge base*, not a chat log: each entry carries where it
 * came from, how much it may be trusted and how it was verified. The shapes here
 * mirror the backend's `VectorMemoryRecord` / `Provenance` / `TrustLevel`
 * (`src/vector/memory.ts`, `src/core/provenance.ts`) so the interface can be
 * switched to real records without a rewrite.
 *
 * Three rules the mock data is built to make visible, because they are the
 * product's trust guarantees:
 *   1. Model-authored material is always `unverified` — no mock row claims
 *      otherwise, and `isModelTrusted()` would reject one that tried;
 *   2. `verified` and `authoritative` require a non-model verifier (a human or a
 *      deterministic tool), which is recorded per entry;
 *   3. an `authoritative` record is never deleted in place — it is tombstoned,
 *      which the interface shows as `Archived`.
 */

import {
  contextKindForTrust,
  type Provenance,
  type TrustLevel,
} from '../../../src/core/provenance.js';

export type MemoryCategoryId =
  'trading-concepts' | 'market-rules' | 'personal-mistakes' | 'research-notes' | 'agent-learnings';

export interface MemoryCategory {
  id: MemoryCategoryId;
  label: string;
  description: string;
  count: number;
}

export const mockMemoryCategories: readonly MemoryCategory[] = [
  {
    id: 'trading-concepts',
    label: 'Trading Concepts',
    description: 'Mechanics and definitions the curriculum teaches',
    count: 34,
  },
  {
    id: 'market-rules',
    label: 'Market Rules',
    description: 'Session, cost and microstructure constraints',
    count: 21,
  },
  {
    id: 'personal-mistakes',
    label: 'Personal Mistakes',
    description: 'Errors this user actually made, with the lesson they point back to',
    count: 12,
  },
  {
    id: 'research-notes',
    label: 'Research Notes',
    description: 'Findings from experiments, always with a sample size',
    count: 9,
  },
  {
    id: 'agent-learnings',
    label: 'Agent Learnings',
    description: 'What the agent concluded — unverified until a human or tool checks it',
    count: 17,
  },
];

/**
 * Lifecycle is deliberately separate from trust: a record can be `verified` and
 * still be archived, and an `unverified` one can be waiting for review. Trust
 * answers "how much may this be believed"; lifecycle answers "where is it now".
 */
export type MemoryLifecycle = 'active' | 'pending-review' | 'archived';

/** The four states the interface must render. */
export type MemoryStatus = 'verified' | 'pending-review' | 'archived' | 'unverified';

export const MEMORY_STATUS_LABEL: Record<MemoryStatus, string> = {
  verified: 'Verified',
  'pending-review': 'Pending review',
  archived: 'Archived',
  unverified: 'Unverified',
};

export const MEMORY_STATUS_EXPLANATION: Record<MemoryStatus, string> = {
  verified: 'A human or a deterministic tool checked this against its source.',
  'pending-review': 'Written, sourced, and waiting for a non-model verifier to check it.',
  archived: 'Tombstoned. Kept as evidence: history is never silently removed.',
  unverified: 'Not yet checked. It may be retrieved, but it is never presented as fact.',
};

/**
 * Trust + lifecycle collapse into the four states the UI shows. This is a
 * presentation mapping, not a rule: the trust rules themselves live in
 * `src/core/provenance.ts` and are enforced in the backend.
 */
export function memoryStatus(record: {
  trust: TrustLevel;
  lifecycle: MemoryLifecycle;
}): MemoryStatus {
  if (record.lifecycle === 'archived') return 'archived';
  if (record.lifecycle === 'pending-review') return 'pending-review';
  return record.trust === 'unverified' ? 'unverified' : 'verified';
}

/** How the record must be labelled when it reaches the model. */
export function memoryContextKind(record: { trust: TrustLevel }) {
  return contextKindForTrust(record.trust);
}

export interface MemorySource {
  /** `Provenance.ref`: a tool name, lesson id, file id or user note reference. */
  ref: string;
  kind: Provenance['source'];
  label: string;
}

export interface KnowledgeRecord {
  id: string;
  categoryId: MemoryCategoryId;
  title: string;
  summary: string;
  trust: TrustLevel;
  lifecycle: MemoryLifecycle;
  /** 0..1 retrieval-confidence of this record against its own evidence. */
  confidence: number;
  provenance: Provenance;
  sources: readonly MemorySource[];
  tags: readonly string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

const iso = (value: string) => value;

export const mockKnowledge: readonly KnowledgeRecord[] = [
  {
    id: 'mem_01',
    categoryId: 'trading-concepts',
    title: 'Fixed-fractional sizing bounds ruin risk before it bounds return',
    summary:
      'Risk per unit comes from the stop distance, so the size follows from the budget. The order matters: budget, stop, size — never size first.',
    trust: 'verified',
    lifecycle: 'active',
    confidence: 0.94,
    provenance: {
      source: 'tool',
      ref: 'risk.positionSize',
      trust: 'verified',
      recordedAt: iso('2026-09-14T09:20:00Z'),
      note: 'Deterministic tool output, re-checked by the user against the lesson worked example.',
    },
    sources: [
      { ref: 'risk.positionSize', kind: 'tool', label: 'Deterministic sizing tool' },
      { ref: 'academy.m2.lesson-risk-02', kind: 'document', label: 'Academy lesson 2.2' },
    ],
    tags: ['sizing', 'risk-first'],
    version: 3,
    createdAt: iso('2026-09-08T18:10:00Z'),
    updatedAt: iso('2026-09-14T09:20:00Z'),
  },
  {
    id: 'mem_02',
    categoryId: 'personal-mistakes',
    title: 'Rounding the unit count up instead of down',
    summary:
      'Recorded from three consecutive sizing attempts. Rounding up exceeds the stated budget, so the stated risk becomes a wish rather than a limit.',
    trust: 'unverified',
    lifecycle: 'active',
    confidence: 0.71,
    provenance: {
      source: 'human',
      ref: 'journal.2026-09-15',
      trust: 'unverified',
      recordedAt: iso('2026-09-15T20:05:00Z'),
      note: 'The user wrote it; no verifier has checked the pattern yet.',
    },
    sources: [{ ref: 'journal.2026-09-15', kind: 'human', label: 'Journal entry' }],
    tags: ['sizing', 'self-review'],
    version: 1,
    createdAt: iso('2026-09-15T20:05:00Z'),
    updatedAt: iso('2026-09-15T20:05:00Z'),
  },
  {
    id: 'mem_03',
    categoryId: 'agent-learnings',
    title: 'Proposed a rule change without citing an evaluation',
    summary:
      'The agent suggested tightening the session filter and referenced no evaluation record. It is kept unverified and cannot become trusted knowledge on its own.',
    trust: 'unverified',
    lifecycle: 'pending-review',
    confidence: 0.42,
    provenance: {
      source: 'model',
      ref: 'model.scripted-local',
      trust: 'unverified',
      recordedAt: iso('2026-09-18T11:02:00Z'),
      note: 'Model-authored; only a human or a tool may raise its trust.',
    },
    sources: [{ ref: 'conversation.2026-09-18', kind: 'model', label: 'Agent conversation' }],
    tags: ['rule-proposal', 'needs-evidence'],
    version: 2,
    createdAt: iso('2026-09-18T11:02:00Z'),
    updatedAt: iso('2026-09-18T11:40:00Z'),
  },
  {
    id: 'mem_04',
    categoryId: 'market-rules',
    title: 'Session overlap changes the realised spread',
    summary:
      'The cost of entering during the overlap differs from the thin session either side of it, so a simulated fill must carry the session it was taken in.',
    trust: 'verified',
    lifecycle: 'active',
    confidence: 0.86,
    provenance: {
      source: 'synthetic',
      ref: 'synthetic-generator',
      trust: 'verified',
      recordedAt: iso('2026-09-12T10:00:00Z'),
      note: 'synthetic — not real market data',
    },
    sources: [
      { ref: 'synthetic-generator', kind: 'synthetic', label: 'Synthetic series' },
      { ref: 'academy.m1.lesson-sessions', kind: 'document', label: 'Academy lesson 1.3' },
    ],
    tags: ['sessions', 'cost'],
    version: 1,
    createdAt: iso('2026-09-12T10:00:00Z'),
    updatedAt: iso('2026-09-12T10:00:00Z'),
  },
  {
    id: 'mem_05',
    categoryId: 'research-notes',
    title: 'A ten-trade sample cannot distinguish skill from noise',
    summary:
      'Confirmed as authoritative after review: the claim is a statement about inference, not about markets, and it constrains how every other finding may be read.',
    trust: 'authoritative',
    lifecycle: 'active',
    confidence: 0.97,
    provenance: {
      source: 'human',
      ref: 'user.omiid',
      trust: 'authoritative',
      recordedAt: iso('2026-09-17T19:45:00Z'),
      note: 'Verified by a human reviewer; only a human may grant authoritative trust.',
    },
    sources: [
      { ref: 'academy.m5.rubric.sample-size', kind: 'document', label: 'Academy rubric 5.1' },
      { ref: 'user.omiid', kind: 'human', label: 'Human verification' },
    ],
    tags: ['statistics', 'sample-size'],
    version: 4,
    createdAt: iso('2026-09-09T08:00:00Z'),
    updatedAt: iso('2026-09-17T19:45:00Z'),
  },
  {
    id: 'mem_06',
    categoryId: 'trading-concepts',
    title: 'R-multiples make two different symbols comparable',
    summary:
      'Expressing an outcome in risk units removes position size from the comparison, which is what lets a review across instruments mean anything.',
    trust: 'verified',
    lifecycle: 'active',
    confidence: 0.9,
    provenance: {
      source: 'tool',
      ref: 'risk.rMultiple',
      trust: 'verified',
      recordedAt: iso('2026-09-13T18:30:00Z'),
    },
    sources: [
      { ref: 'risk.rMultiple', kind: 'tool', label: 'Deterministic R tool' },
      { ref: 'academy.m2.lesson-r', kind: 'document', label: 'Academy lesson 2.3' },
    ],
    tags: ['r-multiples'],
    version: 2,
    createdAt: iso('2026-09-10T07:30:00Z'),
    updatedAt: iso('2026-09-13T18:30:00Z'),
  },
  {
    id: 'mem_07',
    categoryId: 'agent-learnings',
    title: 'Retrieval surfaced a superseded explanation',
    summary:
      'An older explanation of rule activation was returned after the workflow changed. Tombstoned rather than edited, so the mistake stays visible.',
    trust: 'unverified',
    lifecycle: 'archived',
    confidence: 0.28,
    provenance: {
      source: 'model',
      ref: 'model.scripted-local',
      trust: 'unverified',
      recordedAt: iso('2026-09-10T12:15:00Z'),
      note: 'Archived: tombstoned, never deleted; the history is kept as evidence.',
    },
    sources: [{ ref: 'conversation.2026-09-10', kind: 'model', label: 'Agent conversation' }],
    tags: ['stale', 'retrieval-quality'],
    version: 5,
    createdAt: iso('2026-09-10T12:15:00Z'),
    updatedAt: iso('2026-09-16T08:00:00Z'),
  },
  {
    id: 'mem_08',
    categoryId: 'personal-mistakes',
    title: 'Journal entry missing an explicit invalidation level',
    summary:
      'The written review described the setup but not the level that would have made it wrong, so the trade could not be reviewed honestly afterwards.',
    trust: 'unverified',
    lifecycle: 'pending-review',
    confidence: 0.66,
    provenance: {
      source: 'human',
      ref: 'journal.2026-09-11',
      trust: 'unverified',
      recordedAt: iso('2026-09-11T19:10:00Z'),
    },
    sources: [{ ref: 'journal.2026-09-11', kind: 'human', label: 'Journal entry' }],
    tags: ['process', 'checklist'],
    version: 1,
    createdAt: iso('2026-09-11T19:10:00Z'),
    updatedAt: iso('2026-09-11T19:10:00Z'),
  },
  {
    id: 'mem_09',
    categoryId: 'research-notes',
    title: 'Stated drawdown tolerance did not match behaviour',
    summary:
      'Abandoned experiment note: the claim came from a sample of eleven trades, which is too small to support it. Kept archived so it is not re-derived.',
    trust: 'unverified',
    lifecycle: 'archived',
    confidence: 0.31,
    provenance: {
      source: 'model',
      ref: 'model.scripted-local',
      trust: 'unverified',
      recordedAt: iso('2026-09-07T21:00:00Z'),
      note: 'Archived with the reason, not deleted.',
    },
    sources: [{ ref: 'experiment.exp-05', kind: 'tool', label: 'Abandoned experiment' }],
    tags: ['drawdown', 'insufficient-sample'],
    version: 3,
    createdAt: iso('2026-09-07T21:00:00Z'),
    updatedAt: iso('2026-09-15T09:00:00Z'),
  },
];

export type MemoryEventKind =
  'created' | 'revision' | 'verification-requested' | 'trust-promoted' | 'tombstoned';

export interface MemoryTimelineEntry {
  id: string;
  recordId: string;
  kind: MemoryEventKind;
  at: string;
  actor: string;
  detail: string;
  /** Version produced by this event, when it changed the record. */
  version: number;
}

export const mockMemoryTimeline: readonly MemoryTimelineEntry[] = [
  {
    id: 'tl-01',
    recordId: 'mem_05',
    kind: 'created',
    at: '2026-09-09T08:00:00Z',
    actor: 'user.omiid',
    detail: 'Written from the month 5 reading notes.',
    version: 1,
  },
  {
    id: 'tl-02',
    recordId: 'mem_05',
    kind: 'revision',
    at: '2026-09-12T09:30:00Z',
    actor: 'user.omiid',
    detail: 'Reworded to separate "small sample" from "no edge".',
    version: 2,
  },
  {
    id: 'tl-03',
    recordId: 'mem_05',
    kind: 'verification-requested',
    at: '2026-09-17T18:00:00Z',
    actor: 'agent.scripted-local',
    detail: 'Agent asked for a human check; it cannot promote the record itself.',
    version: 3,
  },
  {
    id: 'tl-04',
    recordId: 'mem_05',
    kind: 'trust-promoted',
    at: '2026-09-17T19:45:00Z',
    actor: 'user.omiid',
    detail: 'Promoted to authoritative by a human verifier.',
    version: 4,
  },
  {
    id: 'tl-05',
    recordId: 'mem_07',
    kind: 'tombstoned',
    at: '2026-09-16T08:00:00Z',
    actor: 'user.omiid',
    detail: 'Superseded explanation archived; the entry stays as evidence.',
    version: 5,
  },
  {
    id: 'tl-06',
    recordId: 'mem_03',
    kind: 'verification-requested',
    at: '2026-09-18T11:40:00Z',
    actor: 'agent.scripted-local',
    detail: 'Awaiting review: no evaluation record was cited.',
    version: 2,
  },
  {
    id: 'tl-07',
    recordId: 'mem_08',
    kind: 'created',
    at: '2026-09-11T19:10:00Z',
    actor: 'user.omiid',
    detail: 'Captured from the journal entry.',
    version: 1,
  },
  {
    id: 'tl-08',
    recordId: 'mem_01',
    kind: 'revision',
    at: '2026-09-14T09:20:00Z',
    actor: 'user.omiid',
    detail: 'Ordering corrected to budget → stop → size.',
    version: 3,
  },
];

export interface KnowledgeGrowthPoint {
  month: string;
  verified: number;
  pending: number;
  unverified: number;
}

/** Illustrative monthly growth of the knowledge base, six months of study. */
export const mockKnowledgeGrowth: readonly KnowledgeGrowthPoint[] = [
  { month: 'Apr', verified: 4, pending: 1, unverified: 9 },
  { month: 'May', verified: 9, pending: 2, unverified: 14 },
  { month: 'Jun', verified: 15, pending: 3, unverified: 19 },
  { month: 'Jul', verified: 22, pending: 4, unverified: 26 },
  { month: 'Aug', verified: 28, pending: 5, unverified: 33 },
  { month: 'Sep', verified: 37, pending: 6, unverified: 50 },
];

export interface KnowledgeSearchFacet {
  id: string;
  label: string;
  /** How many records the facet would match in the illustrative set. */
  matches: number;
}

export const mockTrustFacets: readonly KnowledgeSearchFacet[] = [
  { id: 'verified', label: 'Verified', matches: 3 },
  { id: 'pending-review', label: 'Pending review', matches: 2 },
  { id: 'unverified', label: 'Unverified', matches: 2 },
  { id: 'archived', label: 'Archived', matches: 2 },
];

export const mockSourceFacets: readonly KnowledgeSearchFacet[] = [
  { id: 'tool', label: 'Tool output', matches: 2 },
  { id: 'human', label: 'Human note or verification', matches: 4 },
  { id: 'model', label: 'Model-authored', matches: 3 },
  { id: 'document', label: 'Curriculum document', matches: 5 },
  { id: 'synthetic', label: 'Synthetic data', matches: 1 },
];

export const MEMORY_PREVIEW_NOTICE =
  'Illustrative knowledge base. Retrieval, embeddings and persistence are implemented in the backend but are not connected to this preview: nothing here was retrieved or ranked.';

export const MEMORY_TRUST_POLICY =
  'A model write starts unverified and stays unverified until a human or a deterministic tool verifies it. Verification is recorded, never inferred.';
