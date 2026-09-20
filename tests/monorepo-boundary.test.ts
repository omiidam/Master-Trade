import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARED_SURFACE, sharedAlias } from '../config/sharedSurface.js';

/**
 * Monorepo boundary invariants (Phase 4.1 assessment, Phase 4.2 foundation).
 *
 * ADR-0035 kept Master Trade as one package and made the frontend/backend boundary
 * *explicit* instead of migrating the layout. This suite is what holds that
 * decision in place:
 *
 *   1. the dependency direction is one-way — the backend never imports the UI;
 *   2. the frontend's cross-boundary imports are a **declared contract** (`@shared/*`),
 *      not an accident of path depth;
 *   3. the contract is mirrored in three places (both tsconfigs and the Vite
 *      resolver) and they cannot drift apart;
 *   4. the target `apps/` and `packages/` directories are documentation markers,
 *      not half-built packages — no `package.json`, no npm workspaces.
 *
 * Adding a module to the surface is a deliberate four-file edit (this list, both
 * tsconfigs, the Vite map). That friction is the point: it forces the question
 * "is this a contract, or an implementation detail?" when the import is written.
 */

const root = process.cwd();

/**
 * The declared shared surface, from its single source of truth — the same map the
 * Vite and Vitest configs use. The two tsconfigs mirror it literally and are compared
 * against it below, so there is nothing to keep in sync by hand except the tsconfigs.
 */
const DECLARED_SPECIFIERS: Readonly<Record<string, string>> = SHARED_SURFACE;

/** The same module set, as `src/...` paths without extension (for the internals check). */
const SHARED_ENTRY_MODULES: readonly string[] = Object.values(SHARED_SURFACE).map((file) =>
  file.replace(/\.ts$/, ''),
);

/** Backend modules the frontend must never import: implementation, not contract. */
const INTERNAL_PREFIXES = [
  'src/db/',
  'src/server/',
  'src/auth/',
  'src/jobs/queue',
  'src/jobs/store',
];

function filesUnder(dir: string, extension: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { recursive: true })
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => `${dir}/${entry}`);
}

function frontendFiles(): string[] {
  return [...filesUnder('web/src', '.ts'), ...filesUnder('web/src', '.tsx')];
}

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

/** Distinct `@shared/*` specifiers the frontend actually imports, with an example file. */
function sharedImportsUsed(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of frontendFiles()) {
    for (const specifier of importSpecifiers(readFileSync(join(root, file), 'utf8'))) {
      if (specifier.startsWith('@shared/') && !used.has(specifier)) used.set(specifier, file);
    }
  }
  return used;
}

/** Relative specifiers that escape `web/` into the repository (the old coupling). */
function relativeEscapes(): string[] {
  const escapes: string[] = [];
  for (const file of frontendFiles()) {
    for (const specifier of importSpecifiers(readFileSync(join(root, file), 'utf8'))) {
      if (!specifier.startsWith('.')) continue;
      const target = relative(root, resolve(root, dirname(file), specifier))
        .split(sep)
        .join('/');
      if (!target.startsWith('web/')) escapes.push(`${file} -> ${specifier}`);
    }
  }
  return escapes;
}

/** `paths` from a tsconfig, as specifier -> source module path resolved from the repo root. */
function tsconfigPaths(tsconfig: string, base: string): Map<string, string> {
  const parsed = JSON.parse(readFileSync(join(root, tsconfig), 'utf8')) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  const paths = parsed.compilerOptions?.paths ?? {};
  const mapped = new Map<string, string>();
  for (const [specifier, targets] of Object.entries(paths)) {
    const target = targets[0];
    if (target === undefined) continue;
    // `./src/x.js` (root, NodeNext) and `../src/x.js` (web) both name the TS source.
    const absolute = resolve(root, base, target);
    const asSource = relative(root, absolute.replace(/\.[cm]?js$/, '.ts'))
      .split(sep)
      .join('/');
    mapped.set(specifier, asSource);
  }
  return mapped;
}

function sorted(entries: Iterable<string>): string[] {
  return [...entries].sort();
}

describe('monorepo boundary: direction', () => {
  it('keeps the dependency direction one-way: nothing in src/ imports the frontend', () => {
    const violations: string[] = [];
    for (const file of filesUnder('src', '.ts')) {
      for (const specifier of importSpecifiers(readFileSync(join(root, file), 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const target = relative(root, resolve(root, dirname(file), specifier))
          .split(sep)
          .join('/');
        if (target.startsWith('web/')) violations.push(`${file} -> ${specifier}`);
      }
    }
    expect(violations, 'backend importing the frontend reverses the boundary').toEqual([]);
  });

  it('allows no frontend file to reach into src/ by relative path', () => {
    expect(
      relativeEscapes(),
      'the boundary is @shared/*; a relative path into src/ bypasses the declared contract',
    ).toEqual([]);
  });
});

describe('monorepo boundary: the declared surface', () => {
  it('declares every module, and each one exists', () => {
    for (const [specifier, file] of Object.entries(DECLARED_SPECIFIERS)) {
      expect(existsSync(join(root, file)), `${specifier} points at missing ${file}`).toBe(true);
    }
  });

  it('lets the frontend import only declared modules', () => {
    const used = sharedImportsUsed();
    expect(used.size, 'the frontend imports nothing from the shared surface').toBeGreaterThan(0);
    const undeclared = [...used.entries()]
      .filter(([specifier]) => !(specifier in DECLARED_SPECIFIERS))
      .map(([specifier, file]) => `${file} -> ${specifier}`);
    expect(undeclared, 'an undeclared import crossed the boundary').toEqual([]);
  });

  it('keeps no dead entries: every declared module is actually consumed', () => {
    const used = new Set(sharedImportsUsed().keys());
    const unused = [...Object.keys(DECLARED_SPECIFIERS)].filter(
      (specifier) => !used.has(specifier),
    );
    expect(unused, 'declared but unused; remove it from the surface').toEqual([]);
  });

  it('refuses backend internals on the surface', () => {
    const leaked = SHARED_ENTRY_MODULES.filter((module) =>
      INTERNAL_PREFIXES.some((prefix) => module.startsWith(prefix)),
    );
    expect(leaked, 'an implementation module must not be part of the contract').toEqual([]);
  });

  it('makes an internal or unknown module unresolvable, not merely discouraged', () => {
    const alias = sharedAlias(root);
    const resolvable = new Set(alias.map((entry) => entry.find));
    // Exact-match entries: nothing outside the surface has a resolver entry, so a deep
    // import fails to build rather than quietly succeeding.
    for (const forbidden of [
      '@shared/db/sqlite',
      '@shared/server/app',
      '@shared/auth/sessions',
      '@shared',
    ]) {
      expect(resolvable.has(forbidden), `${forbidden} must not resolve`).toBe(false);
    }
    expect(alias.every((entry) => entry.replacement.endsWith('.ts'))).toBe(true);
  });
});

describe('monorepo boundary: the three mirrors cannot drift', () => {
  it('mirrors the surface in the root tsconfig', () => {
    expect(sorted(tsconfigPaths('tsconfig.json', '.').keys())).toEqual(
      sorted(Object.keys(DECLARED_SPECIFIERS)),
    );
  });

  it('mirrors the surface in the frontend tsconfig', () => {
    expect(sorted(tsconfigPaths('web/tsconfig.json', 'web').keys())).toEqual(
      sorted(Object.keys(DECLARED_SPECIFIERS)),
    );
  });

  it('has exactly one list: both bundler configs import the shared map', () => {
    // Vite and Vitest must resolve the boundary identically. Both read
    // config/sharedSurface.ts, and neither is allowed to inline its own copy.
    for (const config of ['vite.config.ts', 'vitest.config.ts']) {
      const source = readFileSync(join(root, config), 'utf8');
      expect(source, `${config} does not import the shared surface map`).toContain(
        "from './config/sharedSurface.js'",
      );
      expect(source, `${config} inlines its own alias literals`).not.toMatch(/'@shared\/[^']+':/);
    }
  });

  it('points every mirror at the same source file', () => {
    const mirrors = [
      ['tsconfig.json', tsconfigPaths('tsconfig.json', '.')],
      ['web/tsconfig.json', tsconfigPaths('web/tsconfig.json', 'web')],
    ] as const;

    for (const [specifier, file] of Object.entries(DECLARED_SPECIFIERS)) {
      for (const [name, mapping] of mirrors) {
        const target = mapping.get(specifier)?.replace(/^\.\//, '');
        expect(target, `${name} maps ${specifier} elsewhere`).toBe(file);
      }
    }
  });
});

describe('monorepo boundary: the target structure is inert', () => {
  const TARGET_DIRECTORIES = [
    'apps/desktop',
    'apps/web',
    'apps/api',
    'packages/ui',
    'packages/database',
    'packages/ai',
    'packages/market-data',
    'packages/trading-engine',
    'packages/shared',
  ];

  it('keeps the placeholder READMEs that say what each directory is', () => {
    for (const directory of TARGET_DIRECTORIES) {
      const readme = join(root, directory, 'README.md');
      expect(existsSync(readme), `${directory}/README.md is missing`).toBe(true);
      const text = readFileSync(readme, 'utf8');
      expect(text, `${directory}/README.md does not say it is a placeholder`).toMatch(
        /placeholder|not a package/i,
      );
      expect(text, `${directory}/README.md does not say nothing lives there yet`).toMatch(
        /nothing lives here yet|nothing has been moved/i,
      );
    }
  });

  it('contains no package.json in the target directories (no half-built packages)', () => {
    const strays = TARGET_DIRECTORIES.filter((directory) =>
      existsSync(join(root, directory, 'package.json')),
    );
    expect(
      strays,
      'a package.json appeared without a reviewed migration; ADR-0035 stages the extraction',
    ).toEqual([]);
  });

  it('declares no npm workspaces (the layout is unchanged)', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      workspaces?: unknown;
      dependencies?: Record<string, string>;
    };
    expect(
      pkg.workspaces,
      'workspaces were introduced without a reviewed migration',
    ).toBeUndefined();
    // The boundary added no dependency: it is a resolver map, not a plugin.
    expect(pkg.dependencies?.['vite-tsconfig-paths']).toBeUndefined();
  });
});

describe('monorepo boundary: the decision is recorded', () => {
  it('keeps the assessment, the ADR, the foundation doc and the index linked', () => {
    const adr = 'ADR-0035-monorepo-migration-staged-boundary-first.md';
    for (const file of ['docs/monorepo-assessment.md', 'docs/monorepo.md', `docs/adr/${adr}`]) {
      expect(existsSync(join(root, file)), `${file} is missing`).toBe(true);
    }

    const index = readFileSync(join(root, 'docs', 'adr', 'README.md'), 'utf8');
    expect(index, 'ADR-0035 is not listed in the ADR index').toContain('0035');

    const assessment = readFileSync(join(root, 'docs', 'monorepo-assessment.md'), 'utf8');
    expect(assessment).toContain(adr);
    expect(assessment, 'the assessment must name the deferral, not imply migration').toMatch(
      /do not migrate/i,
    );
    expect(assessment).toMatch(/Trigger conditions/i);
    // The concrete mechanism that motivated deferral.
    expect(assessment).toContain('oxide');

    const foundation = readFileSync(join(root, 'docs', 'monorepo.md'), 'utf8');
    expect(foundation).toContain(adr);
    expect(foundation, 'the foundation doc must state the layout did not change').toMatch(
      /has \*\*not\*\* changed|nothing was\s+moved/i,
    );
  });
});
