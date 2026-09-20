import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the `@tailwindcss/oxide` "Cannot find native binding" failure.
 *
 * Tailwind CSS v4 runs on a native engine that is published as a set of
 * per-platform packages (`@tailwindcss/oxide-linux-x64-gnu`, `…-darwin-arm64`,
 * `…-win32-x64-msvc`, …) declared by oxide as **optional** dependencies. npm
 * installs the one matching the host and skips the rest.
 *
 * When npm omits optional dependencies, the package that disappears *is the
 * engine*, and the failure surfaces later from inside oxide as
 * `Cannot find native binding` — which blames the wrong thing. The lockfile is
 * already correct (it declares every platform package with its `os`/`cpu`), so
 * the fix is never to edit or delete the lockfile: it is to stop omitting
 * optional dependencies, which the committed `.npmrc` pins.
 *
 * This test makes that failure loud and immediate — during `npm test`, with the
 * remedy in the message — instead of a confusing error from a web build.
 */

const root = process.cwd();
const require = createRequire(import.meta.url);

interface LockPackage {
  version?: string;
  os?: string[];
  cpu?: string[];
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, LockPackage>;
};

/**
 * The engine packages the lockfile declares that could satisfy this host. Both
 * Linux libc variants match `linux`/`x64`; oxide picks between them at load time
 * by detecting musl, so either is a valid declaration.
 */
function declaredEnginePackages(): string[] {
  return Object.keys(lock.packages)
    .filter((path) => /^node_modules\/@tailwindcss\/oxide-[^/]+$/.test(path))
    .filter((path) => {
      const entry = lock.packages[path] as LockPackage;
      const osMatches = !entry.os || entry.os.includes(process.platform);
      const cpuMatches = !entry.cpu || entry.cpu.includes(process.arch);
      return osMatches && cpuMatches;
    })
    .map((path) => path.replace('node_modules/', ''));
}

const declared = declaredEnginePackages();

// A host oxide publishes no package for is not a failure of this repository, so
// the assertion is skipped with the reason recorded rather than reported as a
// defect — the same convention the database suites use for an absent driver.
const withEngine = declared.length === 0 ? it.skip : it;

describe('native engine (Tailwind oxide)', () => {
  it('keeps the lockfile complete for every platform, so a missing binding is never a lockfile problem', () => {
    const allEnginePackages = Object.keys(lock.packages).filter((path) =>
      /^node_modules\/@tailwindcss\/oxide-/.test(path),
    );
    // The engine is shipped for many platforms; a lockfile pruned to one platform
    // is the failure mode this rule exists to catch.
    expect(allEnginePackages.length).toBeGreaterThan(1);
    const linuxGnu = lock.packages['node_modules/@tailwindcss/oxide-linux-x64-gnu'];
    expect(linuxGnu).toBeDefined();
    expect(linuxGnu?.os).toContain('linux');
    expect(linuxGnu?.cpu).toContain('x64');
  });

  it('pins npm to include optional dependencies, and never to omit them', () => {
    const npmrc = readFileSync(join(root, '.npmrc'), 'utf8');
    const directives = npmrc
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && line.includes('='));

    // The positive pin is what keeps the native engine. `omit=` with an empty
    // value does NOT work — npm rejects it as invalid config and ignores it — so
    // `include=optional` is the directive that has to be here.
    expect(directives).toContain('include=optional');

    // And nothing may omit optional dependencies. `include` outranks an inherited
    // `omit` because a project .npmrc has higher precedence, which is the whole
    // defence; an omit line naming `optional` is the regression this catches.
    for (const line of directives) {
      if (/^omit\s*=/i.test(line)) expect(line).not.toMatch(/optional/i);
    }
  });

  withEngine('resolves the native binding for this platform', () => {
    let failure: unknown = null;
    try {
      require('@tailwindcss/oxide');
    } catch (error) {
      failure = error;
    }
    expect(
      failure,
      `@tailwindcss/oxide could not load its native binding, so the platform package (${declared.join(
        ', ',
      )}) was not installed. This is almost always npm omitting optional ` +
        'dependencies, not a broken lockfile: do not delete package-lock.json. ' +
        'Run `rm -rf node_modules && npm ci` (never `--omit=optional`) and the ' +
        'committed .npmrc will keep the engine. See docs/workflow.md.',
    ).toBeNull();
  });
});
