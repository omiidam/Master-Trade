import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_LOCK_DOC,
  FORBIDDEN_PROVIDER_SDK_PATTERNS,
  LOCK_AREAS,
  LOCKED_DECISIONS,
  PROVIDER_SDK_SCOPE,
  assertArchitectureLock,
  decisionsByArea,
  validateArchitectureLock,
} from '../src/core/architectureLock.js';
import { PolicyViolationError } from '../src/core/errors.js';

const root = process.cwd();
const adrDir = join(root, 'docs', 'adr');

/** Every .ts file under src/, as POSIX-style paths relative to the repo root. */
function sourceFiles(): string[] {
  return readdirSync(join(root, 'src'), { recursive: true })
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => `src/${entry}`);
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const pattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const spec = match[1];
    if (spec !== undefined) specs.push(spec);
  }
  return specs;
}

describe('architecture lock (Phase 3.1)', () => {
  it('answers every required decision area', () => {
    expect(() => assertArchitectureLock()).not.toThrow();
    const byArea = decisionsByArea();
    for (const area of LOCK_AREAS) {
      expect(byArea[area].length, `area ${area} has no decision`).toBeGreaterThan(0);
    }
  });

  it('reports a missing area as an incomplete lock', () => {
    const partial = LOCKED_DECISIONS.filter((decision) => decision.area !== 'frontend.framework');
    const issues = validateArchitectureLock(partial);
    expect(issues.map((issue) => issue.code)).toContain('MISSING_AREA');
    expect(issues.some((issue) => issue.detail === 'frontend.framework')).toBe(true);
    expect(() => assertArchitectureLock(partial)).toThrow(PolicyViolationError);
  });

  it('rejects experimental technology or opaque agent frameworks as core dependencies', () => {
    for (const forbidden of ['Menai for deterministic compute', 'LangChain agent framework']) {
      const issues = validateArchitectureLock([
        ...LOCKED_DECISIONS,
        {
          id: 'DEC-TEST-FORBIDDEN',
          area: 'ai.abstraction',
          choice: forbidden,
          status: 'locked',
          adr: ['ADR-0008-no-experimental-core-dependencies.md'],
        },
      ]);
      expect(issues.map((issue) => issue.code)).toContain('FORBIDDEN_TECHNOLOGY');
    }
  });

  it('cites an existing ADR for every decision', () => {
    for (const decision of LOCKED_DECISIONS) {
      expect(decision.adr.length, `${decision.id} cites no ADR`).toBeGreaterThan(0);
      for (const adr of decision.adr) {
        expect(existsSync(join(adrDir, adr)), `${decision.id} cites missing ${adr}`).toBe(true);
      }
    }
  });

  it('keeps the lock document in sync with the decision set', () => {
    const doc = readFileSync(join(root, ARCHITECTURE_LOCK_DOC), 'utf8');
    for (const decision of LOCKED_DECISIONS) {
      expect(doc.includes(decision.id), `${ARCHITECTURE_LOCK_DOC} is missing ${decision.id}`).toBe(
        true,
      );
    }
    for (const adr of new Set(LOCKED_DECISIONS.flatMap((decision) => decision.adr))) {
      expect(doc.includes(adr), `${ARCHITECTURE_LOCK_DOC} does not reference ${adr}`).toBe(true);
    }
  });

  it('confines provider SDK imports to the provider adapter directory', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file.startsWith(`${PROVIDER_SDK_SCOPE}/`)) continue;
      const source = readFileSync(join(root, file), 'utf8');
      for (const spec of importSpecifiers(source)) {
        if (FORBIDDEN_PROVIDER_SDK_PATTERNS.some((pattern) => pattern.test(spec))) {
          offenders.push(`${file} imports ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
