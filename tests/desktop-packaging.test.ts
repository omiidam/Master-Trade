/**
 * The packaging rules, and the one version number.
 *
 * Two halves, both about the same thing: a bundle is a claim about what the product is, and the
 * checks are what make the claim testable on a machine that cannot build one.
 *
 *   1. **The version surfaces.** `package.json` is the source; `tauri.conf.json`, `Cargo.toml` and
 *      `src/core/config.ts` mirror it. Drift is described against an in-memory tree rather than by
 *      writing files, so the interesting cases — a stale mirror, an unparseable mirror, a missing
 *      one — are all reachable without a fixture checkout.
 *   2. **The preflight.** Every check is exercised through an injected filesystem, so a tree that
 *      ships a source map, a `.env` file or a private key is described here rather than trusted to
 *      be absent from the repository.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
  declaresWindowsTarget,
  preflightPackaging,
  resolvePackagingIdentity,
  assertPackagingReady,
  IDENTIFIER_PATTERN,
  type PackagingFs,
} from '../src/desktop/packaging.js';
import {
  APP_VERSION_PATTERN,
  VERSION_SOURCE_PATH,
  VERSION_SURFACES,
  pendingVersionWrites,
  readVersionSurfaces,
  runtimeConfigVersion,
} from '../src/desktop/version.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';

const root = process.cwd();

/** The real files, read from disk — the baseline every in-memory case is a variation of. */
function realFile(path: string): string {
  return readFileSync(path, 'utf8');
}

interface FakeTree {
  files: Record<string, string>;
  /** Directories, as path lists, for the filesystem the preflight walks. */
  dirs?: Record<string, string[]>;
}

/**
 * A filesystem over an in-memory tree.
 *
 * Only the four operations `packaging.ts` uses, so a test states exactly the tree it means and the
 * preflight cannot reach anything a real `fs` would have offered it.
 */
function fakeFs(tree: FakeTree): PackagingFs {
  const directories = tree.dirs ?? {};
  // `join(dir, '')` rather than a hard-coded `/`: this repository is developed on Windows and
  // tested on Linux, and a prefix that assumed the separator silently matched nothing on one of
  // them — which made three of these cases pass for the wrong reason before it was fixed.
  const under = (dir: string): string[] =>
    Object.keys(tree.files).filter((path) => path.startsWith(join(dir, '')));
  return {
    exists: (path) => path in tree.files || path in directories,
    readFile: (path) => {
      const value = tree.files[path];
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    listDir: (dir) => {
      const listed = directories[dir];
      if (listed) return listed.map((path) => path.slice(dir.length + 1));
      return under(dir).map((path) => path.slice(dir.length + 1).split(sep)[0] ?? '');
    },
    listFiles: (dir) => directories[dir] ?? under(dir),
  };
}

/**
 * A tree that passes every rule.
 *
 * Built from the real version files and a plausible icon/sidecar set, so each case changes exactly
 * the one thing it is about — a fixture that fails for an unrelated reason proves nothing about
 * the rule under test, which is how this file's first version was wrong.
 */
function cleanTree(treeRoot: string): FakeTree {
  const files: Record<string, string> = {};
  for (const surface of VERSION_SURFACES) {
    files[join(treeRoot, surface.id)] = realFile(join(root, surface.id));
  }
  const distDir = join(treeRoot, 'web/dist');
  files[join(distDir, 'index.html')] = '<html></html>';
  for (const icon of [
    'icons/32x32.png',
    'icons/128x128.png',
    'icons/128x128@2x.png',
    'icons/icon.ico',
  ]) {
    files[join(treeRoot, 'src-tauri', icon)] = 'png';
  }
  files[join(treeRoot, 'src-tauri/binaries/master-trade-api-x86_64-pc-windows-msvc.exe')] = 'bin';
  return { files };
}

/** The tree with extra frontend files added under `web/dist`. */
function withBundleFiles(treeRoot: string, extra: Record<string, string>): FakeTree {
  const tree = cleanTree(treeRoot);
  for (const [name, contents] of Object.entries(extra)) {
    tree.files[join(treeRoot, 'web/dist', name)] = contents;
  }
  return tree;
}

/** A minimal config the preflight accepts, as a shape rather than a copy of the real data. */
function conf(overrides: Record<string, unknown> = {}): unknown {
  return {
    productName: 'Master Trade',
    identifier: 'app.mastertrade.desktop',
    version: '1.2.3',
    bundle: {
      category: 'Education',
      shortDescription: 'Trading training workstation',
      longDescription: 'A trading training workstation.',
      targets: 'all',
      externalBin: ['binaries/master-trade-api'],
      icon: ['icons/32x32.png', 'icons/128x128.png', 'icons/icon.icns', 'icons/icon.ico'],
    },
    plugins: {
      updater: {
        endpoints: ['https://updates.example.com/{{target}}/{{arch}}/{{current_version}}'],
        pubkey:
          'untrusted comment: minisign public key ABCDEF\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n',
      },
    },
    ...overrides,
  };
}

describe('one version number, four places it is written down', () => {
  it('agrees on the committed tree, and reads every surface from a file rather than an assumption', () => {
    const report = readVersionSurfaces({ root });
    expect(report.ok).toBe(true);
    expect(report.drift).toEqual([]);
    expect(report.readings.map((entry) => entry.id)).toEqual(
      VERSION_SURFACES.map((surface) => surface.id),
    );
    // The source is the file a human edits, and every mirror is present rather than skipped.
    expect(report.readings[0]?.id).toBe(VERSION_SOURCE_PATH);
    expect(report.readings.filter((entry) => entry.role === 'mirror')).toHaveLength(3);
    for (const entry of report.readings) {
      expect(entry.version, `${entry.id} has no version`).toMatch(APP_VERSION_PATTERN);
    }
  });

  it('finds the version inside DEFAULT_CONFIG, which also contains api.version = "v1"', () => {
    // The reason the locator is anchored to the block: a bare `version:` search finds `v1`.
    // This is the assertion that the anchor works, stated as the fact it protects.
    const config = VERSION_SURFACES.find((surface) => surface.id === 'src/core/config.ts');
    expect(config?.read(realFile(join(root, 'src/core/config.ts')))).toBe(DEFAULT_CONFIG.version);
    expect(DEFAULT_CONFIG.api.version).toBe('v1');
    expect(DEFAULT_CONFIG.api.version).not.toBe(DEFAULT_CONFIG.version);
  });

  it('reads the same value TypeScript compiled, so a stale build cannot pass unnoticed', () => {
    expect(runtimeConfigVersion()).toBe(DEFAULT_CONFIG.version);
  });

  it('reports a stale mirror by name, and marks the tree not ok', () => {
    const files = Object.fromEntries(
      VERSION_SURFACES.map((surface) => [join(root, surface.id), realFile(join(root, surface.id))]),
    );
    // Cargo.toml, specifically: the version the compiled binary and the uninstall entry carry.
    files[join(root, 'src-tauri/Cargo.toml')] = files[join(root, 'src-tauri/Cargo.toml')]!.replace(
      'version = "0.6.0"',
      'version = "0.5.0"',
    );
    const report = readVersionSurfaces({ root, readFile: (path) => files[path] ?? '' });
    expect(report.ok).toBe(false);
    expect(report.drift.map((entry) => entry.id)).toEqual(['src-tauri/Cargo.toml']);
    expect(report.drift[0]?.version).toBe('0.5.0');
  });

  it('treats an unreadable or unparseable surface as drift rather than as a skip', () => {
    for (const [mutate, expected] of [
      [(text: string) => `{ not json`, /unparseable/],
      [
        (text: string) => JSON.stringify({ name: 'no version here' }),
        /no version could be located/,
      ],
    ] as const) {
      const files = Object.fromEntries(
        VERSION_SURFACES.map((surface) => [
          join(root, surface.id),
          realFile(join(root, surface.id)),
        ]),
      );
      files[join(root, 'src-tauri/tauri.conf.json')] = mutate(
        files[join(root, 'src-tauri/tauri.conf.json')]!,
      );
      const report = readVersionSurfaces({ root, readFile: (path) => files[path] ?? '' });
      expect(report.ok).toBe(false);
      expect(report.drift[0]?.problem).toMatch(expected);
    }
  });

  it('rewrites only the mirrors, and only the drifted ones', () => {
    const files = Object.fromEntries(
      VERSION_SURFACES.map((surface) => [join(root, surface.id), realFile(join(root, surface.id))]),
    );
    files[join(root, 'src-tauri/Cargo.toml')] = files[join(root, 'src-tauri/Cargo.toml')]!.replace(
      'version = "0.6.0"',
      'version = "0.5.0"',
    );

    const { version, writes } = pendingVersionWrites({
      root,
      readFile: (path) => files[path] ?? '',
    });
    expect(version).toBe(DEFAULT_CONFIG.version);
    // Only Cargo.toml drifted, so only Cargo.toml is rewritten — a sync that rewrites an agreeing
    // file is a sync that can change something nobody asked it to.
    expect(writes.map((write) => write.id)).toEqual(['src-tauri/Cargo.toml']);
    expect(writes[0]?.text).toContain(`version = "${version}"`);
    expect(writes[0]?.text).not.toContain('0.5.0');

    // And the rewrite is verified by re-reading it, not by trusting the replacement.
    const after = readVersionSurfaces({
      root,
      readFile: (path) => (path === writes[0]?.path ? writes[0].text : (files[path] ?? '')),
    });
    expect(after.ok).toBe(true);
  });

  it('refuses to sync when the source itself is not a semantic version', () => {
    const files = Object.fromEntries(
      VERSION_SURFACES.map((surface) => [join(root, surface.id), realFile(join(root, surface.id))]),
    );
    const packagePath = join(root, 'package.json');
    files[packagePath] = JSON.stringify({ ...JSON.parse(files[packagePath]!), version: 'today' });
    expect(() => pendingVersionWrites({ root, readFile: (path) => files[path] ?? '' })).toThrow(
      /semantic version/,
    );
  });
});

describe('bundle identity', () => {
  it('reads the identity from the config rather than duplicating it', () => {
    const identity = resolvePackagingIdentity(conf());
    expect(identity).toMatchObject({
      productName: 'Master Trade',
      identifier: 'app.mastertrade.desktop',
      version: '1.2.3',
    });
  });

  it('refuses an identity that is not lowercase reverse-DNS, because the keychain uses it too', () => {
    expect(IDENTIFIER_PATTERN.test('app.mastertrade.desktop')).toBe(true);
    expect(IDENTIFIER_PATTERN.test('App.MasterTrade')).toBe(false);
    expect(IDENTIFIER_PATTERN.test('mastertrade')).toBe(false);
    expect(IDENTIFIER_PATTERN.test('app.master_trade.desktop')).toBe(false);

    const report = preflightPackaging({
      root,
      mode: 'release',
      conf: conf({ identifier: 'MasterTrade' }),
      fs: fakeFs({ files: {} }),
    });
    expect(report.checks.find((check) => check.id === 'package.identifier-shape')?.ok).toBe(false);
  });

  it('requires a Windows bundle target', () => {
    expect(declaresWindowsTarget(['all'])).toBe(true);
    expect(declaresWindowsTarget(['nsis'])).toBe(true);
    expect(declaresWindowsTarget(['msi', 'dmg'])).toBe(true);
    expect(declaresWindowsTarget(['dmg', 'deb'])).toBe(false);

    const report = preflightPackaging({
      root,
      mode: 'release',
      conf: conf({
        bundle: { ...(conf() as { bundle: object }).bundle, targets: ['dmg'] },
      }),
      fs: fakeFs({ files: {} }),
    });
    expect(report.checks.find((check) => check.id === 'package.windows-targets')?.ok).toBe(false);
  });

  it('requires exactly one .ico, because a Windows bundle cannot be built without one', () => {
    const treeRoot = join(root, 'fixture');
    const report = preflightPackaging({
      root: treeRoot,
      mode: 'release',
      conf: conf(),
      fs: fakeFs(cleanTree(treeRoot)),
    });
    expect(report.checks.find((entry) => entry.id === 'package.icon-windows')?.ok).toBe(true);
    expect(report.checks.find((entry) => entry.id === 'bundle.icons-present')?.ok).toBe(true);

    const noIco = preflightPackaging({
      root: treeRoot,
      mode: 'release',
      conf: conf({
        bundle: {
          ...(conf() as { bundle: object }).bundle,
          icon: ['icons/32x32.png', 'icons/128x128.png'],
        },
      }),
      fs: fakeFs(cleanTree(treeRoot)),
    });
    expect(noIco.checks.find((entry) => entry.id === 'package.icon-windows')?.ok).toBe(false);
  });
});

describe('what a bundle may contain', () => {
  const treeRoot = join(root, 'fixture');

  function preflight(extra: Record<string, string>, mode: 'development' | 'release' = 'release') {
    return preflightPackaging({
      root: treeRoot,
      mode,
      conf: conf(),
      fs: fakeFs(withBundleFiles(treeRoot, extra)),
    });
  }

  function find(report: ReturnType<typeof preflightPackaging>, id: string) {
    return report.checks.find((check) => check.id === id);
  }

  it('passes a clean frontend, with nothing failing for an unrelated reason', () => {
    const report = preflight({});
    expect(report.errors).toBe(0);
    expect(find(report, 'package.no-source-maps')?.ok).toBe(true);
    expect(find(report, 'package.no-dev-artifacts')?.ok).toBe(true);
    expect(find(report, 'package.no-secret-material')?.ok).toBe(true);
  });

  it('refuses a source map, which is what this repository used to ship', () => {
    // `vite.config.ts` had `sourcemap: true`, so `web/dist` carried a map of the entire frontend
    // into the installer. A release artefact cannot be unreleased, which is why this is an error
    // in both modes rather than a release-only warning.
    const report = preflight({ 'assets/index.js.map': '{"version":3}' });
    const check = find(report, 'package.no-source-maps');
    expect(check?.ok).toBe(false);
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/MASTER_TRADE_SOURCEMAPS/);

    const development = preflight({ 'assets/index.js.map': '{"version":3}' }, 'development');
    expect(find(development, 'package.no-source-maps')?.severity).toBe('error');
  });

  it('refuses a development artefact in the bundle', () => {
    for (const name of [
      '.env',
      '.env.production',
      '.git/config',
      'node_modules/x/index.js',
      'build.log',
      'data/master.db',
    ]) {
      const report = preflight({ [name]: 'x' });
      expect(find(report, 'package.no-dev-artifacts')?.ok, `${name} was allowed`).toBe(false);
    }
  });

  it('catches private key material and hard-coded credentials in the built frontend', () => {
    const pem = preflight({
      'assets/index.js': 'const k = `-----BEGIN RSA PRIVATE KEY-----\nMIIE`;',
    });
    expect(find(pem, 'package.no-secret-material')?.ok).toBe(false);
    expect(find(pem, 'package.no-secret-material')?.detail).toMatch(/PEM private key/);

    const minisign = preflight({ 'assets/index.js': '"minisign encrypted secret key"' });
    expect(find(minisign, 'package.no-secret-material')?.ok).toBe(false);

    const credential = preflight({
      'assets/index.js': 'const x = MASTER_TRADE_API_TOKEN = "abcdef12345"',
    });
    expect(find(credential, 'package.no-secret-material')?.ok).toBe(false);
  });

  it('does not scan binaries, so a font or an icon cannot be a false positive', () => {
    // The bytes are irrelevant: the extension is what decides, so a real font that happens to
    // contain the marker bytes is not reported as a key.
    const report = preflight({ 'assets/font.woff2': '-----BEGIN RSA PRIVATE KEY-----' });
    expect(find(report, 'package.no-secret-material')?.ok).toBe(true);
  });

  it('refuses signing material anywhere in the tree, which is the strongest form of the rule', () => {
    const tree = cleanTree(treeRoot);
    tree.files[join(treeRoot, 'release.key')] = 'secret';
    tree.files[join(treeRoot, 'updater.sig')] = 'sig';
    const report = preflightPackaging({
      root: treeRoot,
      mode: 'release',
      conf: conf(),
      fs: fakeFs(tree),
    });
    const check = report.checks.find((entry) => entry.id === 'package.no-signing-material');
    expect(check?.ok).toBe(false);
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/release\.key/);
  });

  it('reports a missing sidecar binary as a release blocker and only a warning in development', () => {
    const build = (mode: 'development' | 'release') => {
      const tree = cleanTree(treeRoot);
      delete tree.files[
        join(treeRoot, 'src-tauri/binaries/master-trade-api-x86_64-pc-windows-msvc.exe')
      ];
      return preflightPackaging({ root: treeRoot, mode, conf: conf(), fs: fakeFs(tree) });
    };
    const release = build('release');
    const releaseCheck = release.checks.find((c) => c.id === 'package.sidecar-built');
    expect(releaseCheck?.ok).toBe(false);
    expect(releaseCheck?.severity).toBe('error');
    expect(releaseCheck?.releaseOnly).toBe(true);

    const development = build('development');
    const developmentCheck = development.checks.find((c) => c.id === 'package.sidecar-built');
    expect(developmentCheck?.ok).toBe(false);
    // The same fact at a different severity: nobody has run `build:sidecar` in a development tree,
    // and a release cannot exist from one. Nothing is skipped — only weighted.
    expect(developmentCheck?.severity).toBe('warning');
    expect(development.errors).toBe(0);
    expect(development.warnings).toBeGreaterThan(0);
  });

  it('refuses to package with every failure listed at once, not one per run', () => {
    const tree = withBundleFiles(treeRoot, { 'assets/index.js.map': '{}', '.env': 'X=1' });
    delete tree.files[
      join(treeRoot, 'src-tauri/binaries/master-trade-api-x86_64-pc-windows-msvc.exe')
    ];
    const fs = fakeFs(tree);

    let message = '';
    try {
      assertPackagingReady(treeRoot, conf(), fs);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    // All four failures named in one refusal, because fixing a release one error per run is how a
    // build machine gets a reputation.
    expect(message).toMatch(/package\.sidecar-built/);
    expect(message).toMatch(/package\.no-source-maps/);
    expect(message).toMatch(/package\.no-dev-artifacts/);
    expect(message).toMatch(/3 release check\(s\) failed/);
  });

  it('names exactly which rules refuse the committed tree in release mode', () => {
    // The real `tauri.conf.json` against the real filesystem, in release mode. This is the
    // assertion that the release gate is *earned* rather than assumed: the tree is not releasable
    // on this machine, and the failing set is stated so a change that silently fixes or breaks one
    // of them is visible in a diff.
    const report = preflightPackaging({
      root,
      mode: 'release',
      conf: JSON.parse(realFile(join(root, 'src-tauri/tauri.conf.json'))) as unknown,
    });
    const failed = report.checks.filter((check) => !check.ok && check.severity === 'error');
    // Anything that fails here must be a known release-only or hygiene rule: a rule that starts
    // failing on the committed tree for some *other* reason is a change somebody needs to see.
    for (const check of failed) {
      expect(
        [
          'package.sidecar-built',
          'package.frontend-dist',
          'package.no-source-maps',
          'package.no-dev-artifacts',
          'package.no-secret-material',
        ],
        `${check.id} failed unexpectedly: ${check.detail}`,
      ).toContain(check.id);
    }

    // The rules that hold on the committed tree, asserted positively so a regression in the
    // checks themselves cannot look like a clean release.
    for (const id of [
      'version.agreement',
      'bundle.externalBin',
      'package.identity',
      'package.no-signing-material',
    ]) {
      expect(report.checks.find((check) => check.id === id)?.ok, `${id} should pass`).toBe(true);
    }
    // Signing is deliberately *not* in here: it is a rule about whether a release can exist, and
    // `signing.ts` reports it — `tests/desktop-signing.test.ts` is where it is refused.
  });
});
