import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Monorepo boundary invariants (Phase 4.1).
 *
 * The monorepo assessment (docs/monorepo-assessment.md, ADR-0035) decided not to
 * migrate to `apps/` + `packages/`. Its justification rests on three facts about
 * the current layout, and this suite is what keeps them true:
 *
 *   1. the dependency direction is one-way — the backend never imports the UI;
 *   2. the frontend's cross-boundary imports are a *declared contract* (the shared
 *      surface), not an accident of path depth;
 *   3. a frontend file cannot reach into backend internals (the database driver,
 *      the HTTP server, sessions, the queue engine).
 *
 * If a genuinely new shared module is needed, add it to `SHARED_ENTRY_MODULES`.
 * That is the intended friction: it forces the question "is this part of the
 * contract, or an implementation detail?" at the moment the import is written.
 */

const root = process.cwd();

/** POSIX paths relative to the repo root for every file under `dir`. */
function filesUnder(dir: string, extension = '.ts'): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { recursive: true })
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => `${dir}/${entry}`);
}

/**
 * The declared shared surface: the backend modules the frontend is allowed to
 * import. Every one of these is consumed by `web/` today, and each is a contract
 * (types, view models, wire protocol) rather than an implementation.
 */
const SHARED_ENTRY_MODULES = [
  'src/api/contracts',
  'src/core/errors',
  'src/core/headers',
  'src/core/ids',
  'src/core/provenance',
  'src/desktop/ipc',
  'src/frontend/viewModels',
  'src/jobs/service',
  'src/marketdata/provider',
  'src/realtime/contracts',
  'src/realtime/events',
  'src/realtime/protocol',
  'src/types',
] as const;

const declared = new Set<string>(SHARED_ENTRY_MODULES);

/** Import specifiers in a source file, including bare `import '…'` statements. */
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

interface BoundaryImport {
  from: string;
  specifier: string;
  /** Repo-relative target without its extension, or null when it leaves the repo. */
  target: string | null;
}

/** Every cross-boundary import in the frontend: specifiers that leave `web/`. */
function frontendBoundaryImports(): BoundaryImport[] {
  const found: BoundaryImport[] = [];
  for (const file of filesUnder('web/src', '.ts').concat(filesUnder('web/src', '.tsx'))) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const absolute = resolve(root, dirname(file), specifier);
      const target = relative(root, absolute).split(sep).join('/');
      // Inside web/ (a normal sibling import) is not a boundary crossing.
      if (target.startsWith('web/')) continue;
      found.push({
        from: file,
        specifier,
        target: target.replace(/\.[cm]?[jt]sx?$/, ''),
      });
    }
  }
  return found;
}

describe('monorepo boundary (Phase 4.1)', () => {
  it('keeps the dependency direction one-way: nothing in src/ imports the frontend', () => {
    const violations: string[] = [];
    for (const file of filesUnder('src')) {
      const source = readFileSync(join(root, file), 'utf8');
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith('.')) continue;
        const target = relative(root, resolve(root, dirname(file), specifier))
          .split(sep)
          .join('/');
        if (target.startsWith('web/')) violations.push(`${file} -> ${specifier}`);
      }
    }
    expect(violations, `backend importing the frontend reverses the boundary`).toEqual([]);
  });

  it('declares every module on the shared surface, and each one exists', () => {
    for (const module of SHARED_ENTRY_MODULES) {
      expect(
        existsSync(join(root, `${module}.ts`)),
        `declared shared module ${module}.ts does not exist`,
      ).toBe(true);
    }
  });

  it('confines every frontend cross-boundary import to the declared surface', () => {
    const imports = frontendBoundaryImports();
    // The surface is real: the UI genuinely imports the backend contract today.
    expect(imports.length).toBeGreaterThan(0);

    const undeclared = imports
      .filter((entry) => entry.target === null || !declared.has(entry.target))
      .map((entry) => `${entry.from} -> ${entry.specifier}`);

    expect(
      undeclared,
      'a frontend import reaches outside the declared shared surface; add the module to ' +
        'SHARED_ENTRY_MODULES and document it, or import the contract instead',
    ).toEqual([]);
  });

  it('refuses frontend imports that reach into backend internals', () => {
    // Internals: implementation, not contract. A UI bundle must not pull these in.
    const internals = ['src/db/', 'src/server/', 'src/auth/', 'src/jobs/queue', 'src/jobs/store'];
    const violations: string[] = [];
    for (const entry of frontendBoundaryImports()) {
      const target = entry.target;
      if (target === null) continue;
      if (internals.some((prefix) => target.startsWith(prefix))) {
        violations.push(`${entry.from} -> ${entry.specifier}`);
      }
    }

    expect(violations, 'frontend imported a backend implementation module').toEqual([]);
  });

  it('records the decision: the assessment and its ADR exist and are indexed', () => {
    expect(existsSync(join(root, 'docs', 'monorepo-assessment.md'))).toBe(true);
    const adr = 'ADR-0035-monorepo-migration-staged-boundary-first.md';
    expect(existsSync(join(root, 'docs', 'adr', adr))).toBe(true);

    const index = readFileSync(join(root, 'docs', 'adr', 'README.md'), 'utf8');
    expect(index, 'ADR-0035 is not listed in the ADR index').toContain('0035');

    const assessment = readFileSync(join(root, 'docs', 'monorepo-assessment.md'), 'utf8');
    expect(assessment).toContain(adr);
  });

  it('documents the deferred migration with explicit triggers', () => {
    const assessment = readFileSync(join(root, 'docs', 'monorepo-assessment.md'), 'utf8');
    // The decision is a deferral with named trigger conditions, not silence.
    expect(assessment).toMatch(/do not migrate/i);
    expect(assessment).toMatch(/Trigger conditions/i);
    // And it must state the concrete risk that motivated deferral.
    expect(assessment).toContain('oxide');
  });

  it('keeps the migration out of package.json (planning only, no dependencies added)', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      workspaces?: unknown;
    };
    // Phase 4.1 is analysis: the layout on disk still matches what the assessment
    // describes. Introducing workspaces is the migration, and it must be a
    // deliberate, separately reviewed change (ADR-0035).
    expect(
      pkg.workspaces,
      'workspaces were introduced without a reviewed migration',
    ).toBeUndefined();
  });
});
