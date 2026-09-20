import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contextKindForTrust, TRUST_ORDER } from '../src/core/provenance.js';
import { assertNoExecutionControls } from '../src/frontend/viewModels.js';
import { NAV_SECTIONS } from '../web/src/config/navigation.js';
import {
  EXAM_STATE_LABEL,
  mockExamAttempts,
  mockExamCategories,
  mockExamDefinitions,
  mockExamViews,
  mockMistakes,
  mockQuestions,
  mockScoreEvolution,
  summariseExamProgress,
  type ExamRunState,
} from '../web/src/mock/exams.js';
import {
  MEMORY_STATUS_LABEL,
  memoryContextKind,
  memoryStatus,
  mockKnowledge,
  mockKnowledgeGrowth,
  mockMemoryCategories,
  mockMemoryTimeline,
  type MemoryStatus,
} from '../web/src/mock/memory.js';
import {
  EXPERIMENT_STATUS_LABEL,
  mockExperimentTimeline,
  mockExperiments,
  mockReports,
  summariseResearch,
} from '../web/src/mock/research.js';

const root = process.cwd();
const web = join(root, 'web');

function moduleFiles(...segments: string[]): string[] {
  const directory = join(web, 'src', ...segments);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith('.tsx'))
    .sort();
}

/** Interactive control names found in a source file, as in the shell suite. */
function controlNames(source: string): string[] {
  const names: string[] = [];
  const tagPattern = /<(Button|IconButton|button|a)\b([^>]*)>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(source)) !== null) {
    const attributes = tag[2] ?? '';
    const attributePattern = /(?:aria-label|label)=["']([^"']+)["']/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributes)) !== null) {
      if (attribute[1] !== undefined) names.push(attribute[1]);
    }
  }
  return names;
}

function readPage(name: string): string {
  return readFileSync(join(web, 'src', 'pages', name), 'utf8');
}

/**
 * Prototype module invariants.
 *
 * These guard the properties that make a *preview* honest rather than
 * impressive: an assessment cannot leak its answer key, a knowledge record cannot
 * be trusted because a model wrote it, research cannot present a synthetic number
 * as a measured result, and no module may offer an execution affordance.
 */
describe('frontend product modules', () => {
  it('ships the module components through the shared barrel', () => {
    const barrel = readFileSync(join(web, 'src', 'components', 'index.ts'), 'utf8');
    const required = [
      'ExamCard',
      'QuestionPanel',
      'AnswerOption',
      'ProgressIndicator',
      'ScoreCard',
      'MistakeAnalysisCard',
      'MemoryCard',
      'KnowledgeSearch',
      'TrustBadge',
      'SourceIndicator',
      'MemoryTimeline',
      'ResearchCard',
      'ExperimentTimeline',
      'MetricsPanel',
      'ReportViewer',
    ];
    for (const component of required) {
      expect(barrel, `${component} is missing from the component barrel`).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
    }
  });

  it('keeps every module component and page on disk', () => {
    const components = [
      'components/exams/ExamCard.tsx',
      'components/exams/QuestionPanel.tsx',
      'components/exams/AnswerOption.tsx',
      'components/exams/ProgressIndicator.tsx',
      'components/exams/ScoreCard.tsx',
      'components/exams/MistakeAnalysisCard.tsx',
      'components/memory/MemoryCard.tsx',
      'components/memory/KnowledgeSearch.tsx',
      'components/memory/TrustBadge.tsx',
      'components/memory/SourceIndicator.tsx',
      'components/memory/MemoryTimeline.tsx',
      'components/research/ResearchCard.tsx',
      'components/research/ExperimentTimeline.tsx',
      'components/research/MetricsPanel.tsx',
      'components/research/ReportViewer.tsx',
    ];
    for (const file of components) {
      expect(existsSync(join(web, 'src', file)), `${file} is missing`).toBe(true);
    }
    expect(moduleFiles('components', 'exams')).toHaveLength(6);
    expect(moduleFiles('components', 'memory')).toHaveLength(5);
    expect(moduleFiles('components', 'research')).toHaveLength(4);

    for (const page of ['ExamsPage.tsx', 'MemoryPage.tsx', 'ResearchPage.tsx']) {
      expect(existsSync(join(web, 'src', 'pages', page)), `${page} is missing`).toBe(true);
    }
  });

  it('exposes the three new modules in the navigation, without an execution affordance', () => {
    const ids = NAV_SECTIONS.map((section) => section.id);
    for (const id of ['exams', 'memory', 'research']) {
      expect(ids).toContain(id);
    }
    for (const section of NAV_SECTIONS) {
      expect(() => assertNoExecutionControls([section.label, section.description])).not.toThrow();
    }
  });

  it('never labels a module control with an execution affordance', () => {
    const offenders: string[] = [];
    const files = [
      ...moduleFiles('components', 'exams').map((file) => `components/exams/${file}`),
      ...moduleFiles('components', 'memory').map((file) => `components/memory/${file}`),
      ...moduleFiles('components', 'research').map((file) => `components/research/${file}`),
      'pages/ExamsPage.tsx',
      'pages/MemoryPage.tsx',
      'pages/ResearchPage.tsx',
    ];
    for (const file of files) {
      for (const name of controlNames(readFileSync(join(web, 'src', file), 'utf8'))) {
        try {
          assertNoExecutionControls([name]);
        } catch {
          offenders.push(`${file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('renders the shared notice on every new page rather than a local rewording', () => {
    for (const [page, noticeConstant] of [
      ['ExamsPage.tsx', 'EXAM_PREVIEW_NOTICE'],
      ['MemoryPage.tsx', 'MEMORY_PREVIEW_NOTICE'],
      ['ResearchPage.tsx', 'RESEARCH_PREVIEW_NOTICE'],
    ] as const) {
      const source = readPage(page);
      expect(source, `${page} does not use ${noticeConstant}`).toMatch(
        new RegExp(`\\b${noticeConstant}\\b`),
      );
      expect(source, `${page} does not say it is a preview`).toMatch(/preview/i);
    }
  });

  describe('assessments', () => {
    it('covers every declared state across the sample', () => {
      const states = new Set<ExamRunState>(mockExamDefinitions.map((exam) => exam.state));
      for (const state of Object.keys(EXAM_STATE_LABEL) as ExamRunState[]) {
        expect(states.has(state), `no exam exercises the "${state}" state`).toBe(true);
      }
    });

    it('withholds the answer key on every question', () => {
      expect(mockQuestions.length).toBeGreaterThan(0);
      for (const question of mockQuestions) {
        expect(question.answerKeyWithheld).toBe(true);
        expect(question.rubricRef).toMatch(/^academy\./);
      }
    });

    it('keeps score evolution to graded attempts only, and voids unscored', () => {
      const graded = mockExamAttempts.filter((attempt) => attempt.outcome !== 'void');
      expect(mockScoreEvolution).toHaveLength(graded.length);
      for (const point of mockScoreEvolution) {
        expect(point.score).toBeGreaterThan(0);
        expect(point.score).toBeLessThanOrEqual(100);
      }
      const voids = mockExamAttempts.filter((attempt) => attempt.outcome === 'void');
      expect(voids.length).toBeGreaterThan(0);
      for (const attempt of voids) {
        expect(mockScoreEvolution.some((point) => point.attemptId === attempt.id)).toBe(false);
      }
    });

    it('agrees with the backend exam view shape', () => {
      expect(mockExamViews).toHaveLength(mockExamDefinitions.length);
      mockExamViews.forEach((view, index) => {
        const definition = mockExamDefinitions[index];
        expect(definition).toBeDefined();
        expect(view.id).toBe(definition?.id);
        expect(view.questionCount).toBe(definition?.questionCount);
        expect(view.bestScore).toBe(definition?.bestScore ?? null);
      });
    });

    it('derives the progress summary from the definitions', () => {
      const summary = summariseExamProgress();
      expect(summary.attempted).toBe(
        mockExamDefinitions.filter((exam) => exam.attempts > 0).length,
      );
      expect(summary.passed).toBe(
        mockExamDefinitions.filter((exam) => exam.state === 'completed').length,
      );
      expect(summary.attempts).toBe(
        mockExamDefinitions.reduce((sum, exam) => sum + exam.attempts, 0),
      );
      const countOf = (state: ExamRunState) =>
        mockExamDefinitions.filter((exam) => exam.state === state).length;
      expect(summary.locked).toBe(countOf('locked'));
      expect(summary.available).toBe(countOf('available'));
      expect(summary.inProgress).toBe(countOf('in-progress'));
      expect(summary.passed).toBe(countOf('completed'));
      // Every exam is accounted for by exactly one state, failed included.
      expect(
        summary.locked +
          summary.available +
          summary.inProgress +
          summary.passed +
          countOf('failed'),
      ).toBe(mockExamDefinitions.length);
    });

    it('keeps mistake shares bounded and traceable to a lesson', () => {
      const totalShare = mockMistakes.reduce((sum, pattern) => sum + pattern.share, 0);
      expect(totalShare).toBeLessThanOrEqual(1.0001);
      for (const pattern of mockMistakes) {
        expect(pattern.lessonId.length).toBeGreaterThan(0);
        expect(pattern.occurrences).toBeGreaterThan(0);
      }
    });

    it('names every category an exam belongs to', () => {
      const known = new Set(mockExamCategories.map((category) => category.id));
      for (const exam of mockExamDefinitions) {
        expect(known.has(exam.categoryId), `unknown category ${exam.categoryId}`).toBe(true);
      }
    });
  });

  describe('knowledge memory', () => {
    it('renders each of the four trust states', () => {
      const states = new Set<MemoryStatus>(mockKnowledge.map((record) => memoryStatus(record)));
      for (const status of Object.keys(MEMORY_STATUS_LABEL) as MemoryStatus[]) {
        expect(states.has(status), `no record exercises the "${status}" state`).toBe(true);
      }
    });

    it('never trusts model-authored material', () => {
      for (const record of mockKnowledge) {
        if (record.provenance.source === 'model') {
          expect(record.trust, `${record.id} trusts a model write`).toBe('unverified');
          expect(record.provenance.trust).toBe('unverified');
        }
      }
    });

    it('requires a human verifier for authoritative records', () => {
      const authoritative = mockKnowledge.filter((record) => record.trust === 'authoritative');
      expect(authoritative.length).toBeGreaterThan(0);
      for (const record of authoritative) {
        expect(record.provenance.source).toBe('human');
        expect(record.sources.some((source) => source.kind === 'human')).toBe(true);
        // Authoritative knowledge is never deleted in place, only tombstoned.
        expect(memoryStatus(record)).toBe('verified');
      }
    });

    it('derives the epistemic label from the trust level, not from the card', () => {
      expect(contextKindForTrust('unverified')).toBe('uncertainty');
      expect(contextKindForTrust('verified')).toBe('analysis');
      expect(contextKindForTrust('authoritative')).toBe('fact');
      for (const record of mockKnowledge) {
        expect(memoryContextKind(record)).toBe(contextKindForTrust(record.trust));
        if (record.trust === 'unverified') {
          expect(memoryContextKind(record)).not.toBe('fact');
        }
      }
    });

    it('keeps trust and lifecycle independent', () => {
      const archived = mockKnowledge.filter((record) => record.lifecycle === 'archived');
      expect(archived.length).toBeGreaterThan(0);
      for (const record of archived) {
        expect(memoryStatus(record)).toBe('archived');
        expect(TRUST_ORDER[record.trust]).toBeGreaterThanOrEqual(0);
      }
      const pending = mockKnowledge.filter((record) => record.lifecycle === 'pending-review');
      expect(pending.length).toBeGreaterThan(0);
      for (const record of pending) {
        expect(memoryStatus(record)).toBe('pending-review');
      }
    });

    it('gives every record a source and a bounded confidence', () => {
      for (const record of mockKnowledge) {
        expect(record.sources.length, `${record.id} has no source`).toBeGreaterThan(0);
        expect(record.provenance.ref.length).toBeGreaterThan(0);
        expect(record.confidence).toBeGreaterThanOrEqual(0);
        expect(record.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('files every record under a category and references real records in history', () => {
      const categories = new Set(mockMemoryCategories.map((category) => category.id));
      const ids = new Set(mockKnowledge.map((record) => record.id));
      for (const record of mockKnowledge) {
        expect(categories.has(record.categoryId)).toBe(true);
      }
      for (const entry of mockMemoryTimeline) {
        expect(ids.has(entry.recordId), `${entry.id} references an unknown record`).toBe(true);
        expect(entry.version).toBeGreaterThan(0);
      }
    });

    it('shows growth as a growing series', () => {
      expect(mockKnowledgeGrowth.length).toBeGreaterThan(1);
      for (let index = 1; index < mockKnowledgeGrowth.length; index += 1) {
        const previous = mockKnowledgeGrowth[index - 1];
        const current = mockKnowledgeGrowth[index];
        expect(previous).toBeDefined();
        expect(current).toBeDefined();
        expect((current?.verified ?? 0) >= (previous?.verified ?? 0)).toBe(true);
      }
    });
  });

  describe('research', () => {
    it('attaches metrics only where they are labelled synthetic, and none where there are none', () => {
      for (const experiment of mockExperiments) {
        if (experiment.metrics === null) {
          expect(experiment.metricsSource).toBe('none');
        } else {
          expect(experiment.metricsSource).toBe('synthetic');
          expect(experiment.metrics.sampleSize).toBeGreaterThan(0);
          expect(experiment.metrics.confidencePct).toBeGreaterThanOrEqual(0);
          expect(experiment.metrics.confidencePct).toBeLessThanOrEqual(100);
          expect(experiment.metrics.maxDrawdownR).toBeLessThanOrEqual(0);
        }
      }
    });

    it('never presents a rule as active', () => {
      for (const label of Object.values(EXPERIMENT_STATUS_LABEL)) {
        expect(label).not.toMatch(/active/i);
      }
      for (const label of Object.values(EXPERIMENT_STATUS_LABEL)) {
        expect(() => assertNoExecutionControls([label])).not.toThrow();
      }
    });

    it('requires an approval reference when a decision is pending', () => {
      const awaiting = mockExperiments.filter(
        (experiment) => experiment.status === 'awaiting-approval',
      );
      expect(awaiting.length).toBeGreaterThan(0);
      for (const experiment of awaiting) {
        expect(experiment.approvalRef).not.toBeNull();
      }
      for (const experiment of mockExperiments) {
        if (experiment.status !== 'awaiting-approval') {
          expect(experiment.approvalRef).toBeNull();
        }
      }
    });

    it('records every experiment with a hypothesis, a method and a verdict', () => {
      for (const experiment of mockExperiments) {
        expect(experiment.hypothesis.length).toBeGreaterThan(20);
        expect(experiment.method.length).toBeGreaterThan(20);
        expect(experiment.ruleRef.length).toBeGreaterThan(0);
        expect(experiment.provenance.ref.length).toBeGreaterThan(0);
        expect(experiment.findings.length).toBeGreaterThan(0);
      }
    });

    it('keeps the derived summary consistent with the rows', () => {
      const summary = summariseResearch();
      expect(summary.evaluatedTrades).toBe(
        mockExperiments.reduce((sum, experiment) => sum + (experiment.metrics?.sampleSize ?? 0), 0),
      );
      expect(
        summary.active +
          summary.awaitingApproval +
          summary.complete +
          summary.planned +
          summary.abandoned,
      ).toBe(mockExperiments.length);
    });

    it('references real experiments from the timeline and reports', () => {
      const ids = new Set(mockExperiments.map((experiment) => experiment.id));
      for (const entry of mockExperimentTimeline) {
        expect(ids.has(entry.experimentId), `${entry.id} references an unknown experiment`).toBe(
          true,
        );
      }
      for (const report of mockReports) {
        expect(ids.has(report.experimentId)).toBe(true);
        expect(report.sections.length).toBeGreaterThan(0);
        expect(report.limitation.length).toBeGreaterThan(20);
      }
    });
  });
});
