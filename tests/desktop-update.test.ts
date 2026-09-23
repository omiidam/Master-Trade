/**
 * The update lifecycle, against a scripted port.
 *
 * Four claims are held down here, and each is one an auto-updater gets wrong in a way a user
 * notices:
 *
 *   1. nothing without a signature is ever downloaded (`parseUpdateMetadata` refuses first);
 *   2. a target older than what is installed is refused, and a cross-major one is refused unless a
 *      caller opts in;
 *   3. `updated` is reached only after re-reading the installed version and finding it equals the
 *      target — "the installer returned without throwing" is not evidence;
 *   4. a failure leaves the current version in place and says so.
 *
 * The port is scripted rather than mocked: every step is a real function that can be made to hang,
 * throw or lie, so the state machine is exercised through its actual control flow. The one thing
 * these tests cannot show is a cryptographic signature being verified — that is Tauri's updater
 * against the compiled-in key, recorded in the verifier's `unverifiable` set.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CHECKABLE_STATES,
  DEFAULT_UPDATE_POLICY,
  INSTALLABLE_STATES,
  UPDATE_STATES,
  UpdateService,
  compareVersions,
  decideUpdate,
  isMajorChange,
  normalizeVersion,
  parseUpdateMetadata,
  parseVersion,
  unavailableUpdatePort,
  updatesAllowed,
  type UpdateMetadata,
  type UpdatePort,
  type UpdateStatus,
} from '../src/desktop/update.js';

/** A syntactically valid minisign signature blob that verifies nothing. */
const SIGNATURE =
  'untrusted comment: signature from minisign secret key\n' +
  'RWTf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3GvLmZ1Jk0n4bXq8+';

function metadataFor(version: string, overrides: Record<string, unknown> = {}): unknown {
  return { version, signature: SIGNATURE, notes: `release ${version}`, ...overrides };
}

interface ScriptedPortOptions {
  current?: string;
  installed?: string;
  metadata?: unknown;
  failAt?: 'check' | 'fetch' | 'download' | 'install' | 'installed';
  hangAt?: 'fetch' | 'download';
}

/** A port that behaves exactly as a script says, including badly. */
function scriptedPort(options: ScriptedPortOptions = {}): UpdatePort & {
  calls: string[];
  /** Resolves a port hung at `fetch` or `download`. */
  release(): void;
} {
  const calls: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const maybeFail = (step: string): void => {
    if (options.failAt === step) throw new Error(`${step} failed`);
  };

  return {
    calls,
    release: () => release(),
    available: () => true,
    async currentVersion() {
      calls.push('currentVersion');
      maybeFail('check');
      return options.current ?? '1.0.0';
    },
    async fetchMetadata() {
      calls.push('fetchMetadata');
      if (options.hangAt === 'fetch') await gate;
      maybeFail('fetch');
      return options.metadata ?? metadataFor('1.1.0');
    },
    async download(metadata: UpdateMetadata) {
      calls.push(`download:${metadata.version}`);
      if (options.hangAt === 'download') await gate;
      maybeFail('download');
      return { artifactId: `artifact-${metadata.version}` };
    },
    async install(artifactId: string) {
      calls.push(`install:${artifactId}`);
      maybeFail('install');
    },
    async installedVersion() {
      calls.push('installedVersion');
      maybeFail('installed');
      // `?? ` and not `||`: an empty string is a version the shell could not read, which is a
      // different fact from "no answer was scripted" and has its own assertion below.
      return options.installed ?? '1.1.0';
    },
  };
}

function service(port: UpdatePort, policy = DEFAULT_UPDATE_POLICY) {
  return new UpdateService({ port, environment: 'production', policy });
}

describe('version comparison', () => {
  it('normalizes what a release tool might emit and refuses what is not a version', () => {
    expect(normalizeVersion('1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    expect(normalizeVersion(' 1.2.3 ')).toBe('1.2.3');
    // `1.2` is padded rather than refused: semantic versioning allows it.
    expect(normalizeVersion('1.2')).toBe('1.2.0');
    expect(normalizeVersion('1.2.3-rc.1')).toBe('1.2.3-rc.1');
    expect(normalizeVersion('1.2.3+build.7')).toBe('1.2.3');

    for (const bad of ['', 'latest', '2026-09-23', '1.x.3', '^1.2.3', '1.2.3.4', null, 7]) {
      expect(normalizeVersion(bad), `${String(bad)} was accepted`).toBeNull();
    }
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    expect(parseVersion('nope')).toBeNull();
  });

  it('orders releases, and sorts a pre-release below the release it precedes', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-rc1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-rc1')).toBe(1);
    expect(compareVersions('1.0.0-rc1', '1.0.0-rc2')).toBe(-1);
    // A malformed side is not an ordering, and must not silently become one.
    expect(compareVersions('nonsense', '1.0.0')).toBeNull();
  });

  it('detects a major change, which is the boundary a release decides explicitly', () => {
    expect(isMajorChange('1.4.0', '2.0.0')).toBe(true);
    expect(isMajorChange('1.4.0', '1.9.0')).toBe(false);
    expect(isMajorChange('nonsense', '1.0.0')).toBe(false);
  });
});

describe('update metadata', () => {
  it('accepts well-formed metadata and normalizes its fields', () => {
    const result = parseUpdateMetadata(
      metadataFor('v1.2.0', { pub_date: '2026-09-01T10:00:00Z', url: 'https://x.test/a' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.version).toBe('1.2.0');
    expect(result.metadata.pubDate).toBe('2026-09-01T10:00:00.000Z');
    expect(result.metadata.notes).toBe('release v1.2.0');
  });

  it('refuses metadata without a signature, before anything could be downloaded', () => {
    // `undefined` genuinely removes the key, which is what an endpoint that forgot to sign
    // returns — as opposed to an empty or wrongly-typed one, which must be refused identically.
    for (const overrides of [
      { signature: undefined },
      { signature: '' },
      { signature: '   ' },
      { signature: 42 },
    ]) {
      const result = parseUpdateMetadata(metadataFor('1.2.0', overrides));
      expect(result.ok, JSON.stringify(overrides)).toBe(false);
      if (result.ok) return;
      expect(result.problem).toMatch(/no signature/);
    }
  });

  it('refuses a malformed signature rather than passing it to the installer', () => {
    const result = parseUpdateMetadata(metadataFor('1.2.0', { signature: 'not-a-signature' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toMatch(/malformed signature/);
  });

  it('refuses a version it cannot read, an unparseable date, a plaintext url and oversized notes', () => {
    const cases: [unknown, RegExp][] = [
      [metadataFor('latest'), /no usable version/],
      [metadataFor('1.2.0', { pub_date: 'last tuesday' }), /unparseable pub_date/],
      [metadataFor('1.2.0', { url: 'http://x.test/a' }), /non-https url/],
      [
        metadataFor('1.2.0', { notes: 'x'.repeat(DEFAULT_UPDATE_POLICY.maxNotesLength + 1) }),
        /the limit is/,
      ],
      // An object without a version is refused for the version, not for its shape: the two are
      // different problems and a caller reading the log needs to be told which one it has.
      [{}, /no usable version/],
      ['a string', /not a JSON object/],
      [null, /not a JSON object/],
      [[], /not a JSON object/],
    ];
    for (const [raw, expected] of cases) {
      const result = parseUpdateMetadata(raw);
      expect(result.ok, JSON.stringify(raw)).toBe(false);
      if (result.ok) return;
      expect(result.problem).toMatch(expected);
    }
  });
});

describe('the decision, as a pure function', () => {
  const decide = (current: string, raw: unknown, policy = DEFAULT_UPDATE_POLICY) =>
    decideUpdate({ current, metadata: parseUpdateMetadata(raw, policy), policy, available: true });

  it('reports up_to_date when the endpoint offers what is installed', () => {
    expect(decide('1.0.0', metadataFor('1.0.0')).state).toBe('up_to_date');
    // A `v` prefix is the same version, not a newer one.
    expect(decide('1.0.0', metadataFor('v1.0.0')).state).toBe('up_to_date');
  });

  it('reports update_available for a newer version', () => {
    const decision = decide('1.0.0', metadataFor('1.4.2'));
    expect(decision.state).toBe('update_available');
    expect(decision.target?.version).toBe('1.4.2');
    expect(decision.reason).toMatch(/1\.4\.2 is available/);
  });

  it('refuses a downgrade, which is how a stale endpoint reverts a fixed build', () => {
    const decision = decide('2.0.0', metadataFor('1.9.0'));
    expect(decision.state).toBe('failed');
    expect(decision.refused).toBe(true);
    expect(decision.reason).toMatch(/older than the installed/);
  });

  it('refuses a cross-major upgrade unless a caller opts in', () => {
    const refused = decide('1.9.0', metadataFor('2.0.0'));
    expect(refused.state).toBe('failed');
    expect(refused.refused).toBe(true);
    expect(refused.reason).toMatch(/major version/);

    const allowed = decide('1.9.0', metadataFor('2.0.0'), {
      ...DEFAULT_UPDATE_POLICY,
      allowMajorUpgrade: true,
    });
    expect(allowed.state).toBe('update_available');
  });

  it('fails safely when the installed version cannot be read', () => {
    const decision = decide('not-a-version', metadataFor('1.1.0'));
    expect(decision.state).toBe('failed');
    expect(decision.refused).toBe(true);
    expect(decision.reason).toMatch(/could not be read/);
  });

  it('reports unavailable rather than failed when there is no updater at all', () => {
    const decision = decideUpdate({
      current: '1.0.0',
      metadata: parseUpdateMetadata(metadataFor('1.1.0')),
      available: false,
    });
    // "This build has no updater" is a capability statement, not something that went wrong.
    expect(decision.state).toBe('unavailable');
    expect(decision.refused).toBe(false);
  });

  it('is total over its state list, so no combination falls through', () => {
    expect(UPDATE_STATES).toContain(decide('1.0.0', metadataFor('1.0.0')).state);
    expect(UPDATE_STATES).toContain(decide('1.0.0', {}).state);
    // The two lists are the transition guards, and both are subsets of the states themselves.
    for (const state of [...CHECKABLE_STATES, ...INSTALLABLE_STATES]) {
      expect(UPDATE_STATES).toContain(state);
    }
  });
});

describe('the service', () => {
  it('checks, finds a target and installs only after the version actually changes', async () => {
    const port = scriptedPort({
      current: '1.0.0',
      metadata: metadataFor('1.1.0'),
      installed: '1.1.0',
    });
    const updates = service(port);

    const seen: string[] = [];
    updates.subscribe((status) => seen.push(status.state));

    await updates.check();
    expect(updates.status().state).toBe('update_available');
    expect(updates.status().targetVersion).toBe('1.1.0');

    await updates.install();
    expect(updates.status().state).toBe('updated');
    expect(updates.status().currentVersion).toBe('1.1.0');
    // The progress states were reported, not skipped: a UI that never sees `downloading` cannot
    // show a download.
    expect(seen).toEqual(['checking', 'update_available', 'downloading', 'installing', 'updated']);
    expect(port.calls).toEqual([
      'currentVersion',
      'fetchMetadata',
      'download:1.1.0',
      'install:artifact-1.1.0',
      'installedVersion',
    ]);
  });

  it('never claims updated when the installed version did not change', async () => {
    // The lie this state machine exists to prevent: an installer that returned without throwing
    // and did not actually replace the binary.
    const port = scriptedPort({
      current: '1.0.0',
      metadata: metadataFor('1.1.0'),
      installed: '1.0.0',
    });
    const updates = service(port);
    await updates.check();
    await updates.install();

    expect(updates.status().state).toBe('failed');
    expect(updates.status().reason).toMatch(/the installed version is 1\.0\.0, not 1\.1\.0/);
    expect(updates.status().reason).toMatch(/nothing is claimed/);
  });

  it('fails when the installed version cannot be read after installing', async () => {
    const port = scriptedPort({ current: '1.0.0', metadata: metadataFor('1.1.0'), installed: '' });
    const updates = service(port);
    await updates.check();
    await updates.install();
    expect(updates.status().state).toBe('failed');
    expect(updates.status().reason).toMatch(/not confirmed/);
  });

  it('leaves the current version in place when a download fails', async () => {
    const port = scriptedPort({
      current: '1.0.0',
      metadata: metadataFor('1.1.0'),
      failAt: 'download',
    });
    const updates = service(port);
    await updates.check();
    await updates.install();

    expect(updates.status().state).toBe('failed');
    expect(updates.status().currentVersion).toBe('1.0.0');
    // Nothing reached the installer, so nothing changed and there is nothing to roll back.
    expect(port.calls).not.toContain('install:artifact-1.1.0');
  });

  it('leaves the current version in place when an install fails', async () => {
    const port = scriptedPort({
      current: '1.0.0',
      metadata: metadataFor('1.1.0'),
      failAt: 'install',
    });
    const updates = service(port);
    await updates.check();
    await updates.install();
    expect(updates.status().state).toBe('failed');
    expect(updates.status().reason).toMatch(/installing 1\.1\.0/);
    expect(updates.status().currentVersion).toBe('1.0.0');
    expect(port.calls).not.toContain('installedVersion');
  });

  it('reports refusals as failed with a reason, and does not download anything', async () => {
    for (const [current, raw, expected] of [
      ['1.0.0', metadataFor('0.9.0'), /older than the installed/],
      ['1.0.0', metadataFor('2.0.0'), /major version/],
      ['1.0.0', { version: '2.0.0' }, /no signature/],
    ] as const) {
      const port = scriptedPort({ current, metadata: raw });
      const updates = service(port);
      await updates.check();
      expect(updates.status().state, String(expected)).toBe('failed');
      expect(updates.status().reason).toMatch(expected);
      expect(port.calls).toEqual(['currentVersion', 'fetchMetadata']);
    }
  });

  it('reports a failed check rather than throwing when the endpoint is unreachable', async () => {
    const port = scriptedPort({ failAt: 'fetch' });
    const updates = service(port);
    await expect(updates.check()).resolves.toMatchObject({ state: 'failed' });
    expect(updates.status().reason).toMatch(/failed checking for an update/);
  });

  it('reduces an unexpected error to its class rather than leaking a system message', async () => {
    const port: UpdatePort = {
      ...scriptedPort({}),
      async fetchMetadata(): Promise<unknown> {
        throw new TypeError('cannot read properties of undefined (reading /home/user/.tauri/key)');
      },
    };
    const updates = service(port);
    await updates.check();
    expect(updates.status().reason).toBe('failed checking for an update (TypeError)');
    expect(updates.status().reason).not.toMatch(/\/home\/user/);
  });

  it('refuses a second check while one is running, and refuses install without a target', async () => {
    const port = scriptedPort({ hangAt: 'fetch' });
    const updates = service(port);
    const pending = updates.check();
    expect(updates.status().state).toBe('checking');

    // A second check while the first is in flight would open two requests.
    await updates.check();
    expect(port.calls.filter((call) => call === 'fetchMetadata')).toHaveLength(1);
    // And an install with no target would install whatever the port last saw.
    await updates.install();
    expect(port.calls.some((call) => call.startsWith('install:'))).toBe(false);

    port.release();
    await pending;
    expect(updates.status().state).toBe('update_available');
    expect(updates.status().checks).toBe(1);
  });

  it('cancels a download back to a retryable state, and keeps the target', async () => {
    const port = scriptedPort({
      current: '1.0.0',
      metadata: metadataFor('1.1.0'),
      hangAt: 'download',
    });
    const cancel = vi.fn(async () => undefined);
    const updates = service({ ...port, cancel });

    await updates.check();
    const installing = updates.install();
    expect(updates.status().state).toBe('downloading');

    await updates.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    // A cancelled download is not a broken updater: the target stays available.
    expect(updates.status().state).toBe('update_available');
    expect(updates.status().targetVersion).toBe('1.1.0');

    port.release();
    await installing;
  });

  it('counts completed checks, so "never checked" is distinguishable from "checked and current"', async () => {
    const port = scriptedPort({ current: '1.0.0', metadata: metadataFor('1.0.0') });
    const updates = service(port);
    expect(updates.status().checks).toBe(0);
    await updates.check();
    expect(updates.status()).toMatchObject({ state: 'up_to_date', checks: 1 });
    await updates.check();
    expect(updates.status().checks).toBe(2);
  });

  it('unsubscribes a listener, and keeps serving the others', async () => {
    const port = scriptedPort({ current: '1.0.0', metadata: metadataFor('1.1.0') });
    const updates = service(port);
    const first: UpdateStatus[] = [];
    const second: UpdateStatus[] = [];
    const unsubscribe = updates.subscribe((status) => first.push(status));
    updates.subscribe((status) => second.push(status));

    await updates.check();
    expect(first.length).toBeGreaterThan(0);
    unsubscribe();
    const before = first.length;
    await updates.check();

    expect(first).toHaveLength(before);
    expect(second.length).toBeGreaterThan(before);
  });
});

describe('the browser', () => {
  it('reports unavailable and never reaches a native call', async () => {
    const port = unavailableUpdatePort();
    expect(port.available()).toBe(false);

    const updates = service(port);
    expect(updates.status().state).toBe('unavailable');
    expect(updates.status().currentVersion).toBeNull();

    // A check in a browser resolves to `unavailable` — it does not throw and it does not pretend
    // to have looked.
    await updates.check();
    expect(updates.status().state).toBe('unavailable');
    expect(updates.status().checks).toBe(0);
    expect(updates.status().reason).toMatch(/no updater/);

    // And every write refuses, so no page can reach an install path even by accident.
    await expect(port.fetchMetadata()).rejects.toThrow(/only available in the desktop shell/);
    await expect(port.download({} as UpdateMetadata)).rejects.toThrow(/only available/);
    await expect(port.install('artifact')).rejects.toThrow(/only available/);
  });

  it('never installs a target in an environment that may not offer updates', () => {
    // Updates are offered by a release and by nothing else: a development tree has no key to
    // verify against, and installing over it would replace the tree being worked on.
    expect(updatesAllowed('production')).toBe(true);
    expect(updatesAllowed('development')).toBe(false);
    expect(updatesAllowed('test')).toBe(false);
  });
});
