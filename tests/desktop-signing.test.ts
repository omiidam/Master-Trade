/**
 * The signing boundary, and the one rule it exists for.
 *
 * A build carrying a placeholder update key still starts, still checks, still downloads — and then
 * refuses every genuine update with a signature error, forever, on every machine. The user sees an
 * app that reports "up to date" while being permanently un-updatable. That failure is quiet enough
 * that it has to be caught before the bundle exists, which is what these tests hold down:
 *
 *   - in production, absent, placeholder or malformed material is an *error*;
 *   - in development the identical fact is reported and not fatal, because a development tree is
 *     expected to carry one and a release must not;
 *   - the key value is never echoed, because a diagnostic that prints a key is a leak.
 *
 * No real key exists here and none may. The "valid" fixture below is a syntactically well-formed
 * minisign public key and nothing more — it signs nothing, and the tests that use it assert
 * classification and policy rather than cryptography. What proves a *signature* is Tauri's updater
 * against the key compiled into the binary, which is recorded in the verifier's `unverifiable` set.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PLACEHOLDER_MARKERS,
  RESERVED_UPDATE_HOSTS,
  assertReleaseSignable,
  classifyUpdateEndpoints,
  classifyUpdatePublicKey,
  describesSignedProductionRelease,
  readUpdateSigningMaterial,
  reviewSigning,
} from '../src/desktop/signing.js';
import { DESKTOP_ENVIRONMENTS } from '../src/desktop/environment.js';

/** Shape only: a well-formed minisign public key that signs nothing and exists nowhere else. */
const SHAPE_VALID_KEY =
  'untrusted comment: minisign public key 7C3A1B2D4E5F6071\n' +
  'RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n';

const GOOD_ENDPOINT = 'https://updates.mastertrade.com/{{target}}/{{arch}}/{{current_version}}';

function confWith(pubkey: unknown, endpoints: unknown = [GOOD_ENDPOINT]): unknown {
  return {
    productName: 'Master Trade',
    identifier: 'app.mastertrade.desktop',
    version: '1.2.3',
    plugins: { updater: { pubkey, endpoints } },
  };
}

describe('the updater public key', () => {
  it('accepts a minisign public key and never echoes it', () => {
    const aspect = classifyUpdatePublicKey(SHAPE_VALID_KEY);
    expect(aspect.state).toBe('valid');
    expect(aspect.blocksRelease).toBe(false);
    // The base64 blob must not appear in anything a log or a screen could render.
    expect(aspect.detail).not.toContain('RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3');
    expect(aspect.detail).toMatch(/never read or echoed/);
  });

  it('treats absent, blank and whitespace as absent rather than as a value', () => {
    for (const value of [null, '', '   ', '\n']) {
      const aspect = classifyUpdatePublicKey(value);
      expect(aspect.state, `"${String(value)}" was not absent`).toBe('absent');
      expect(aspect.blocksRelease).toBe(true);
    }
  });

  it('refuses every placeholder marker, including one that is nearly right', () => {
    for (const marker of PLACEHOLDER_MARKERS) {
      const aspect = classifyUpdatePublicKey(`untrusted comment: ${marker}\nRWQf6LRCGA9i53ml\n`);
      expect(aspect.state, `${marker} was accepted`).toBe('placeholder');
      expect(aspect.blocksRelease).toBe(true);
    }
    // The committed value, which is the one that must never reach a release.
    expect(
      classifyUpdatePublicKey('REPLACE_WITH_RELEASE_PUBLIC_KEY_BEFORE_FIRST_RELEASE').state,
    ).toBe('placeholder');
  });

  it('refuses a key-shaped string that is not a minisign key, because a truncated paste still looks configured', () => {
    const cases: [string, string][] = [
      ['a bare base64 blob', 'RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3'],
      ['a comment with no blob', 'untrusted comment: minisign public key ABCDEF\n'],
      ['a blob that is too short', 'untrusted comment: x\nRWQf6LRC\n'],
      [
        'a PEM instead of minisign',
        '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQ==\n-----END PUBLIC KEY-----',
      ],
    ];
    for (const [what, value] of cases) {
      const aspect = classifyUpdatePublicKey(value);
      expect(aspect.state, `${what} was accepted`).toBe('malformed');
      expect(aspect.blocksRelease).toBe(true);
    }
  });
});

describe('the update endpoints', () => {
  it('requires at least one endpoint, because a build that cannot check can never update', () => {
    const [aspect] = classifyUpdateEndpoints([]);
    expect(aspect?.state).toBe('absent');
    expect(aspect?.blocksRelease).toBe(true);
  });

  it('refuses a non-https endpoint in every mode', () => {
    const aspects = classifyUpdateEndpoints(['http://updates.mastertrade.com/x']);
    const https = aspects.find((aspect) => aspect.id === 'signing.update-endpoints-https');
    expect(https?.state).toBe('insecure');
    // Blocking in development too: a plaintext channel is a defect to fix, not something to rely
    // on the signature check to cover.
    expect(https?.blocksRelease).toBe(true);
  });

  it('refuses a reserved host, which is a debug endpoint that can never resolve', () => {
    for (const host of RESERVED_UPDATE_HOSTS) {
      const aspects = classifyUpdateEndpoints([`https://updates.mastertrade${host}/x`]);
      const reachable = aspects.find(
        (aspect) => aspect.id === 'signing.update-endpoints-reachable',
      );
      expect(reachable?.state, `${host} was accepted`).toBe('placeholder');
      expect(reachable?.blocksRelease).toBe(true);
    }
  });

  it('accepts a real https endpoint', () => {
    const aspects = classifyUpdateEndpoints([GOOD_ENDPOINT]);
    expect(aspects.every((aspect) => !aspect.blocksRelease)).toBe(true);
    expect(aspects.every((aspect) => aspect.state === 'valid')).toBe(true);
  });
});

describe('reading the material out of the config', () => {
  it('reads the updater block, and reports a missing one as absent rather than throwing', () => {
    expect(readUpdateSigningMaterial(confWith('k'))).toEqual({
      pubkey: 'k',
      endpoints: [GOOD_ENDPOINT],
    });
    for (const nothing of [null, {}, { plugins: {} }, { plugins: { updater: {} } }, 'nonsense']) {
      const material = readUpdateSigningMaterial(nothing);
      expect(material.pubkey).toBeNull();
      expect(material.endpoints).toEqual([]);
    }
  });

  it('ignores a non-string pubkey and non-string endpoints instead of coercing them', () => {
    const material = readUpdateSigningMaterial(confWith(42, [GOOD_ENDPOINT, 7, null]));
    expect(material.pubkey).toBeNull();
    expect(material.endpoints).toEqual([GOOD_ENDPOINT]);
  });
});

describe('development versus production', () => {
  it('refuses a production release built from the committed tree', () => {
    const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as unknown;
    const report = reviewSigning(conf, 'production');
    expect(report.environment).toBe('production');
    expect(report.relaxed).toBe(false);
    expect(report.releasable).toBe(false);
    // Two blockers: the placeholder key and the reserved endpoint host.
    expect(report.blockers).toHaveLength(2);
    expect(report.blockers.join(' ')).toMatch(/placeholder/);
    expect(report.blockers.join(' ')).toMatch(/invalid/);
  });

  it('reports the identical facts in development without failing on them', () => {
    const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as unknown;
    const report = reviewSigning(conf, 'development');
    expect(report.relaxed).toBe(true);
    expect(report.releasable).toBe(false);
    // The aspects are the same; only the verdict differs. That is the whole point of the mode.
    expect(report.aspects.map((aspect) => aspect.state).sort()).toEqual(
      reviewSigning(conf, 'production')
        .aspects.map((aspect) => aspect.state)
        .sort(),
    );
    expect(report.blockers).toEqual([]);
  });

  it('refuses a production release for every environment that is not development', () => {
    for (const environment of DESKTOP_ENVIRONMENTS) {
      const report = reviewSigning(confWith(null), environment);
      if (environment === 'production') {
        expect(report.releasable).toBe(false);
        expect(() => assertReleaseSignable(confWith(null), environment)).toThrow(
          /refusing to produce a release/,
        );
      } else {
        // `test` is not a deployment, so it is not a release either: missing material is reported
        // and not fatal, exactly as in development.
        expect(() => assertReleaseSignable(confWith(null), environment)).not.toThrow();
      }
    }
  });

  it('passes, and stays silent, when the material is genuinely usable', () => {
    const conf = confWith(SHAPE_VALID_KEY);
    const report = reviewSigning(conf, 'production');
    expect(report.releasable).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(() => assertReleaseSignable(conf, 'production')).not.toThrow();
    expect(describesSignedProductionRelease(conf, 'production')).toBe(true);
  });

  it('never calls a development build a signed release, however good its key looks', () => {
    // The second half of the same rule: "signed" is a claim about a *release*, and a development
    // build is not one — so the flag cannot be true without the environment as well as the key.
    expect(describesSignedProductionRelease(confWith(SHAPE_VALID_KEY), 'development')).toBe(false);
    expect(describesSignedProductionRelease(confWith(SHAPE_VALID_KEY), 'test')).toBe(false);
    expect(describesSignedProductionRelease(confWith('REPLACE_WITH'), 'production')).toBe(false);
  });

  it('refuses a plaintext endpoint in production even when the key is valid', () => {
    const conf = confWith(SHAPE_VALID_KEY, ['http://updates.mastertrade.com/x']);
    const report = reviewSigning(conf, 'production');
    expect(report.releasable).toBe(false);
    expect(report.blockers.join(' ')).toMatch(/not https/);
  });
});
