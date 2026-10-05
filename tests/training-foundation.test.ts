import { describe, expect, it } from 'vitest';
import {
  CONTINUOUS_LEARNING,
  DATASET_SCHEMA_VERSION,
  DEFAULT_QUALITY_RULES,
  DEFAULT_SPLIT_RULES,
  type PreferencePair,
  type SupervisedExample,
  type TrainingDataset,
  type TrainingOrigin,
  type TrainingStage,
  splitDataset,
  validateDataset,
} from '../src/training/index.js';
import { LlmGateway } from '../src/llm/provider.js';
import { readFileSync } from 'node:fs';

function msg(role: 'user' | 'assistant', content: string) {
  return { role, content };
}

let seq = 0;
function example(overrides: Partial<SupervisedExample> = {}): SupervisedExample {
  seq += 1;
  const id = overrides.id ?? `ex-${String(seq).padStart(3, '0')}`;
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    id,
    messages: [msg('user', `question ${id}`)],
    expected: [msg('assistant', `answer ${id}`)],
    meta: {
      origin: { kind: 'authored', author: 'team' },
      stages: ['instruction-tuning'],
      tags: ['unit-test'],
    },
    ...overrides,
  };
}

function dataset(
  examples: SupervisedExample[],
  overrides: Partial<TrainingDataset> = {},
): TrainingDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    id: 'ds-test',
    provenance: {
      createdBy: 'test',
      createdAt: '2026-10-05T00:00:00Z',
      origins: [
        {
          origin: { kind: 'authored', author: 'team' } as TrainingOrigin,
          examples: examples.length,
        },
      ],
      approvedBy: 'maintainer',
      approvedAt: '2026-10-05T00:00:00Z',
      approvedUses: ['SFT', 'evaluation'],
    },
    examples,
    ...overrides,
  };
}

describe('training foundation', () => {
  it('accepts a valid curated dataset and fingerprints it deterministically', () => {
    const ds = dataset([
      example(),
      example(),
      example(),
      example(),
      example(),
      example(),
      example(),
      example(),
    ]);
    const a = validateDataset(ds);
    const b = validateDataset(structuredClone(ds));
    expect(a.ok).toBe(true);
    expect(a.issues).toEqual([]);
    expect(a.fingerprint?.contentHash).toBe(b.fingerprint?.contentHash);
    expect(a.fingerprint?.exampleCount).toBe(8);
  });

  it('refuses a dataset without recorded approval', () => {
    const ds = dataset(
      [example(), example(), example(), example(), example(), example(), example(), example()],
      {
        provenance: {
          createdBy: 'test',
          createdAt: '2026-10-05T00:00:00Z',
          origins: [{ origin: { kind: 'authored', author: 'team' }, examples: 8 }],
          approvedBy: '',
          approvedAt: '2026-10-05T00:00:00Z',
          approvedUses: ['SFT'],
        },
      },
    );
    const result = validateDataset(ds);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('no-approval');
  });

  it('refuses reviewed-conversation origin under the default rules (no approved pipeline yet)', () => {
    const ex = example({
      meta: {
        origin: { kind: 'reviewed-conversation', pipeline: 'none-yet', approvedBy: 'nobody' },
        stages: ['domain'],
      },
    });
    const result = validateDataset(
      dataset([ex, example(), example(), example(), example(), example(), example(), example()]),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain('disallowed-origin');
  });

  it('refuses exact duplicates with onDuplicate: error and drops them with drop', () => {
    const a = example({ id: 'a' });
    const dupe = { ...example({ id: 'b' }), messages: a.messages, expected: a.expected };
    const rest = [
      example(),
      example(),
      example(),
      example(),
      example(),
      example(),
      example(),
      example(),
    ];
    const withDupes = dataset([a, dupe, ...rest]);

    const strict = validateDataset(withDupes);
    expect(strict.ok).toBe(false);
    expect(strict.issues.map((i) => i.code)).toContain('duplicate-content');

    const lenient = validateDataset(withDupes, {
      ...DEFAULT_QUALITY_RULES,
      onDuplicate: 'drop',
      minExamples: 8,
    });
    expect(lenient.ok).toBe(true);
    expect(lenient.duplicates).toHaveLength(1);
    expect(lenient.deduplicated?.examples.map((e) => e.id)).not.toContain('b');
  });

  it('refuses the reserved continuous-learning stage and unknown schema versions', () => {
    const badStage = example({
      id: 'bad-stage',
      meta: {
        origin: { kind: 'authored', author: 'team' },
        // The validator must catch the reserved stage even though the
        // type system forbids it — data arrives untyped at the boundary.
        stages: ['domain', CONTINUOUS_LEARNING] as unknown as SupervisedExample['meta']['stages'],
      },
    });
    const result = validateDataset(
      dataset([badStage, ...Array.from({ length: 7 }, () => example())]),
    );
    expect(result.issues.map((i) => i.code)).toContain('reserved-stage');

    const oldVersion = dataset(
      Array.from({ length: 8 }, () => example()),
      {
        schemaVersion: 'dataset/0' as TrainingDataset['schemaVersion'],
      },
    );
    expect(validateDataset(oldVersion).issues.map((i) => i.code)).toContain('schema-version');
  });

  it('derives a deterministic train/evaluation split from the fingerprint', () => {
    const ds = dataset(Array.from({ length: 20 }, () => example()));
    const fp = validateDataset(ds).fingerprint!;
    const a = splitDataset(ds, fp, DEFAULT_SPLIT_RULES);
    const b = splitDataset(ds, fp, DEFAULT_SPLIT_RULES);
    expect(a.train.map((e) => e.id)).toEqual(b.train.map((e) => e.id));
    expect(a.evaluation.map((e) => e.id)).toEqual(b.evaluation.map((e) => e.id));
    expect(a.train.length + a.evaluation.length).toBe(20);
    expect(a.evaluation.length).toBeGreaterThanOrEqual(1);
    expect(a.evaluation.length).toBeLessThan(20);
    expect(new Set([...a.train, ...a.evaluation]).size).toBe(20);
  });

  it('keeps preference pairs as versioned, curated schema only (no optimizer yet)', () => {
    const pair: PreferencePair = {
      schemaVersion: DATASET_SCHEMA_VERSION,
      id: 'pref-1',
      prompt: [msg('user', 'Should I risk 10% on one trade?')],
      chosen: [msg('assistant', 'No — position sizing rules cap risk per trade.')],
      rejected: [msg('assistant', 'Sure, YOLO.')],
      meta: { origin: { kind: 'authored', author: 'team' }, stages: ['domain'] },
    };
    const ds = dataset(
      Array.from({ length: 8 }, () => example()),
      { preferences: [pair] },
    );
    const result = validateDataset(ds);
    expect(result.ok).toBe(true);
    expect(ds.preferences?.[0]?.schemaVersion).toBe(DATASET_SCHEMA_VERSION);
  });

  it('separates training from the runtime gateway: the gateway holds no training surface', () => {
    const gatewayKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(LlmGateway.prototype));
    expect(gatewayKeys).not.toContain('train');
    expect(gatewayKeys).not.toContain('submitTrainingJob');

    // And the runtime never imports the training module.
    // The seam registry names the Trainer contract (types only), but the
    // runtime files never import or reference the training module.
    const runtimeSources = [
      'src/llm/provider.ts',
      'src/llm/registry.ts',
      'src/llm/index.ts',
      'src/agent/asyncModel.ts',
    ];
    for (const file of runtimeSources) {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(text.includes('training'), `${file} must not reference training`).toBe(false);
    }
  });
});
