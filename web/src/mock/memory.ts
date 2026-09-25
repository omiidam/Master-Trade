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

import { contextKindForTrust, type Provenance, type TrustLevel } from '@shared/core/provenance';
import { liveLabels, msg } from '../i18n/index.js';

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
    get label(): string {
      return msg('memory.tradingConcepts');
    },
    get description(): string {
      return msg('memory.mechanicsAndDefinitionsTheCurriculumTeaches');
    },
    count: 34,
  },
  {
    id: 'market-rules',
    get label(): string {
      return msg('memory.marketRules');
    },
    get description(): string {
      return msg('memory.sessionCostAndMicrostructureConstraints');
    },
    count: 21,
  },
  {
    id: 'personal-mistakes',
    get label(): string {
      return msg('memory.personalMistakes');
    },
    get description(): string {
      return msg('memory.errorsThisUserActuallyMadeWithTheLesson');
    },
    count: 12,
  },
  {
    id: 'research-notes',
    get label(): string {
      return msg('memory.researchNotes');
    },
    get description(): string {
      return msg('memory.findingsFromExperimentsAlwaysWithASampleSize');
    },
    count: 9,
  },
  {
    id: 'agent-learnings',
    get label(): string {
      return msg('memory.agentLearnings');
    },
    get description(): string {
      return msg('memory.whatTheAgentConcludedUnverifiedUntilA');
    },
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

export const MEMORY_STATUS_LABEL: Record<MemoryStatus, string> = liveLabels({
  verified: 'memory.memoryStatus.verified',
  'pending-review': 'memory.memoryStatus.pending-review',
  archived: 'memory.memoryStatus.archived',
  unverified: 'memory.memoryStatus.unverified',
});

export const MEMORY_STATUS_EXPLANATION: Record<MemoryStatus, string> = liveLabels({
  verified: 'memory.memoryStatus2.verified',
  'pending-review': 'memory.memoryStatus2.pending-review',
  archived: 'memory.memoryStatus2.archived',
  unverified: 'memory.memoryStatus2.unverified',
});

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
    get title(): string {
      return msg('memory.fixedFractionalSizingBoundsRuinRiskBeforeItBounds');
    },
    get summary(): string {
      return msg('memory.riskPerUnitComesFromTheStopDistance');
    },
    trust: 'verified',
    lifecycle: 'active',
    confidence: 0.94,
    provenance: {
      source: 'tool',
      ref: 'risk.positionSize',
      trust: 'verified',
      recordedAt: iso('2026-09-14T09:20:00Z'),
      get note(): string {
        return msg('memory.deterministicToolOutputReCheckedByTheUserAgainst');
      },
    },
    sources: [
      {
        ref: 'risk.positionSize',
        kind: 'tool',
        get label(): string {
          return msg('memory.deterministicSizingTool');
        },
      },
      {
        ref: 'academy.m2.lesson-risk-02',
        kind: 'document',
        get label(): string {
          return msg('memory.academyLesson22');
        },
      },
    ],
    tags: ['sizing', 'risk-first'],
    version: 3,
    createdAt: iso('2026-09-08T18:10:00Z'),
    updatedAt: iso('2026-09-14T09:20:00Z'),
  },
  {
    id: 'mem_02',
    categoryId: 'personal-mistakes',
    get title(): string {
      return msg('memory.roundingTheUnitCountUpInsteadOfDown');
    },
    get summary(): string {
      return msg('memory.recordedFromThreeConsecutiveSizingAttemptsRoundingUp');
    },
    trust: 'unverified',
    lifecycle: 'active',
    confidence: 0.71,
    provenance: {
      source: 'human',
      ref: 'journal.2026-09-15',
      trust: 'unverified',
      recordedAt: iso('2026-09-15T20:05:00Z'),
      get note(): string {
        return msg('memory.theUserWroteItNoVerifierHasChecked');
      },
    },
    sources: [
      {
        ref: 'journal.2026-09-15',
        kind: 'human',
        get label(): string {
          return msg('memory.journalEntry');
        },
      },
    ],
    tags: ['sizing', 'self-review'],
    version: 1,
    createdAt: iso('2026-09-15T20:05:00Z'),
    updatedAt: iso('2026-09-15T20:05:00Z'),
  },
  {
    id: 'mem_03',
    categoryId: 'agent-learnings',
    get title(): string {
      return msg('memory.proposedARuleChangeWithoutCitingAnEvaluation');
    },
    get summary(): string {
      return msg('memory.theAgentSuggestedTighteningTheSessionFilterAnd');
    },
    trust: 'unverified',
    lifecycle: 'pending-review',
    confidence: 0.42,
    provenance: {
      source: 'model',
      ref: 'model.scripted-local',
      trust: 'unverified',
      recordedAt: iso('2026-09-18T11:02:00Z'),
      get note(): string {
        return msg('memory.modelAuthoredOnlyAHumanOrAToolMay');
      },
    },
    sources: [
      {
        ref: 'conversation.2026-09-18',
        kind: 'model',
        get label(): string {
          return msg('memory.agentConversation');
        },
      },
    ],
    tags: ['rule-proposal', 'needs-evidence'],
    version: 2,
    createdAt: iso('2026-09-18T11:02:00Z'),
    updatedAt: iso('2026-09-18T11:40:00Z'),
  },
  {
    id: 'mem_04',
    categoryId: 'market-rules',
    get title(): string {
      return msg('memory.sessionOverlapChangesTheRealisedSpread');
    },
    get summary(): string {
      return msg('memory.theCostOfEnteringDuringTheOverlapDiffers');
    },
    trust: 'verified',
    lifecycle: 'active',
    confidence: 0.86,
    provenance: {
      source: 'synthetic',
      ref: 'synthetic-generator',
      trust: 'verified',
      recordedAt: iso('2026-09-12T10:00:00Z'),
      get note(): string {
        return msg('memory.syntheticNotRealMarketData');
      },
    },
    sources: [
      {
        ref: 'synthetic-generator',
        kind: 'synthetic',
        get label(): string {
          return msg('memory.syntheticSeries');
        },
      },
      {
        ref: 'academy.m1.lesson-sessions',
        kind: 'document',
        get label(): string {
          return msg('memory.academyLesson13');
        },
      },
    ],
    tags: ['sessions', 'cost'],
    version: 1,
    createdAt: iso('2026-09-12T10:00:00Z'),
    updatedAt: iso('2026-09-12T10:00:00Z'),
  },
  {
    id: 'mem_05',
    categoryId: 'research-notes',
    get title(): string {
      return msg('memory.aTenTradeSampleCannotDistinguishSkillFromNoise');
    },
    get summary(): string {
      return msg('memory.confirmedAsAuthoritativeAfterReviewTheClaimIs');
    },
    trust: 'authoritative',
    lifecycle: 'active',
    confidence: 0.97,
    provenance: {
      source: 'human',
      ref: 'user.omiid',
      trust: 'authoritative',
      recordedAt: iso('2026-09-17T19:45:00Z'),
      get note(): string {
        return msg('memory.verifiedByAHumanReviewerOnlyAHuman');
      },
    },
    sources: [
      {
        ref: 'academy.m5.rubric.sample-size',
        kind: 'document',
        get label(): string {
          return msg('memory.academyRubric51');
        },
      },
      {
        ref: 'user.omiid',
        kind: 'human',
        get label(): string {
          return msg('memory.humanVerification');
        },
      },
    ],
    tags: ['statistics', 'sample-size'],
    version: 4,
    createdAt: iso('2026-09-09T08:00:00Z'),
    updatedAt: iso('2026-09-17T19:45:00Z'),
  },
  {
    id: 'mem_06',
    categoryId: 'trading-concepts',
    get title(): string {
      return msg('memory.rMultiplesMakeTwoDifferentSymbolsComparable');
    },
    get summary(): string {
      return msg('memory.expressingAnOutcomeInRiskUnitsRemovesPosition');
    },
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
      {
        ref: 'risk.rMultiple',
        kind: 'tool',
        get label(): string {
          return msg('memory.deterministicRTool');
        },
      },
      {
        ref: 'academy.m2.lesson-r',
        kind: 'document',
        get label(): string {
          return msg('memory.academyLesson23');
        },
      },
    ],
    tags: ['r-multiples'],
    version: 2,
    createdAt: iso('2026-09-10T07:30:00Z'),
    updatedAt: iso('2026-09-13T18:30:00Z'),
  },
  {
    id: 'mem_07',
    categoryId: 'agent-learnings',
    get title(): string {
      return msg('memory.retrievalSurfacedASupersededExplanation');
    },
    get summary(): string {
      return msg('memory.anOlderExplanationOfRuleActivationWasReturned');
    },
    trust: 'unverified',
    lifecycle: 'archived',
    confidence: 0.28,
    provenance: {
      source: 'model',
      ref: 'model.scripted-local',
      trust: 'unverified',
      recordedAt: iso('2026-09-10T12:15:00Z'),
      get note(): string {
        return msg('memory.archivedTombstonedNeverDeletedTheHistoryIsKept');
      },
    },
    sources: [
      {
        ref: 'conversation.2026-09-10',
        kind: 'model',
        get label(): string {
          return msg('memory.agentConversation');
        },
      },
    ],
    tags: ['stale', 'retrieval-quality'],
    version: 5,
    createdAt: iso('2026-09-10T12:15:00Z'),
    updatedAt: iso('2026-09-16T08:00:00Z'),
  },
  {
    id: 'mem_08',
    categoryId: 'personal-mistakes',
    get title(): string {
      return msg('memory.journalEntryMissingAnExplicitInvalidationLevel');
    },
    get summary(): string {
      return msg('memory.theWrittenReviewDescribedTheSetupButNot');
    },
    trust: 'unverified',
    lifecycle: 'pending-review',
    confidence: 0.66,
    provenance: {
      source: 'human',
      ref: 'journal.2026-09-11',
      trust: 'unverified',
      recordedAt: iso('2026-09-11T19:10:00Z'),
    },
    sources: [
      {
        ref: 'journal.2026-09-11',
        kind: 'human',
        get label(): string {
          return msg('memory.journalEntry');
        },
      },
    ],
    tags: ['process', 'checklist'],
    version: 1,
    createdAt: iso('2026-09-11T19:10:00Z'),
    updatedAt: iso('2026-09-11T19:10:00Z'),
  },
  {
    id: 'mem_09',
    categoryId: 'research-notes',
    get title(): string {
      return msg('memory.statedDrawdownToleranceDidNotMatchBehaviour');
    },
    get summary(): string {
      return msg('memory.abandonedExperimentNoteTheClaimCameFromA');
    },
    trust: 'unverified',
    lifecycle: 'archived',
    confidence: 0.31,
    provenance: {
      source: 'model',
      ref: 'model.scripted-local',
      trust: 'unverified',
      recordedAt: iso('2026-09-07T21:00:00Z'),
      get note(): string {
        return msg('memory.archivedWithTheReasonNotDeleted');
      },
    },
    sources: [
      {
        ref: 'experiment.exp-05',
        kind: 'tool',
        get label(): string {
          return msg('memory.abandonedExperiment');
        },
      },
    ],
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
    get detail(): string {
      return msg('memory.writtenFromTheMonth5ReadingNotes');
    },
    version: 1,
  },
  {
    id: 'tl-02',
    recordId: 'mem_05',
    kind: 'revision',
    at: '2026-09-12T09:30:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('memory.rewordedToSeparateSmallSampleFromNoEdge');
    },
    version: 2,
  },
  {
    id: 'tl-03',
    recordId: 'mem_05',
    kind: 'verification-requested',
    at: '2026-09-17T18:00:00Z',
    actor: 'agent.scripted-local',
    get detail(): string {
      return msg('memory.agentAskedForAHumanCheckItCannot');
    },
    version: 3,
  },
  {
    id: 'tl-04',
    recordId: 'mem_05',
    kind: 'trust-promoted',
    at: '2026-09-17T19:45:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('memory.promotedToAuthoritativeByAHumanVerifier');
    },
    version: 4,
  },
  {
    id: 'tl-05',
    recordId: 'mem_07',
    kind: 'tombstoned',
    at: '2026-09-16T08:00:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('memory.supersededExplanationArchivedTheEntryStaysAsEvidence');
    },
    version: 5,
  },
  {
    id: 'tl-06',
    recordId: 'mem_03',
    kind: 'verification-requested',
    at: '2026-09-18T11:40:00Z',
    actor: 'agent.scripted-local',
    get detail(): string {
      return msg('memory.awaitingReviewNoEvaluationRecordWasCited');
    },
    version: 2,
  },
  {
    id: 'tl-07',
    recordId: 'mem_08',
    kind: 'created',
    at: '2026-09-11T19:10:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('memory.capturedFromTheJournalEntry');
    },
    version: 1,
  },
  {
    id: 'tl-08',
    recordId: 'mem_01',
    kind: 'revision',
    at: '2026-09-14T09:20:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('memory.orderingCorrectedToBudgetStopSize');
    },
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
  {
    get month(): string {
      return msg('memory.apr');
    },
    verified: 4,
    pending: 1,
    unverified: 9,
  },
  {
    get month(): string {
      return msg('memory.may');
    },
    verified: 9,
    pending: 2,
    unverified: 14,
  },
  {
    get month(): string {
      return msg('memory.jun');
    },
    verified: 15,
    pending: 3,
    unverified: 19,
  },
  {
    get month(): string {
      return msg('memory.jul');
    },
    verified: 22,
    pending: 4,
    unverified: 26,
  },
  {
    get month(): string {
      return msg('memory.aug');
    },
    verified: 28,
    pending: 5,
    unverified: 33,
  },
  {
    get month(): string {
      return msg('memory.sep');
    },
    verified: 37,
    pending: 6,
    unverified: 50,
  },
];

export interface KnowledgeSearchFacet {
  id: string;
  label: string;
  /** How many records the facet would match in the illustrative set. */
  matches: number;
}

export const mockTrustFacets: readonly KnowledgeSearchFacet[] = [
  {
    id: 'verified',
    get label(): string {
      return msg('memory.memoryStatus.verified');
    },
    matches: 3,
  },
  {
    id: 'pending-review',
    get label(): string {
      return msg('memory.memoryStatus.pending-review');
    },
    matches: 2,
  },
  {
    id: 'unverified',
    get label(): string {
      return msg('memory.memoryStatus.unverified');
    },
    matches: 2,
  },
  {
    id: 'archived',
    get label(): string {
      return msg('journal.status.archived');
    },
    matches: 2,
  },
];

export const mockSourceFacets: readonly KnowledgeSearchFacet[] = [
  {
    id: 'tool',
    get label(): string {
      return msg('memory.toolOutput');
    },
    matches: 2,
  },
  {
    id: 'human',
    get label(): string {
      return msg('memory.humanNoteOrVerification');
    },
    matches: 4,
  },
  {
    id: 'model',
    get label(): string {
      return msg('memory.kind.model');
    },
    matches: 3,
  },
  {
    id: 'document',
    get label(): string {
      return msg('memory.curriculumDocument');
    },
    matches: 5,
  },
  {
    id: 'synthetic',
    get label(): string {
      return msg('memory.syntheticData');
    },
    matches: 1,
  },
];

export function previewNotice(): string {
  return msg('memory.previewNotice');
}

export function trustPolicy(): string {
  return msg('memory.trustPolicy');
}
