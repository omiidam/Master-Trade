/**
 * What the deployment depends on — the Phase 5.9 production and public-demo regression layer.
 *
 * The other suites prove the product is correct. This one proves it is *deployable* to the stated
 * target (a small Linux VPS behind a reverse proxy, serving a static bundle beside a loopback API),
 * and that the safety posture survives that deployment. Nothing here reaches the network or the
 * real host: every claim is about configuration and files on disk, which is exactly the part a
 * deploy can silently change.
 *
 * The properties, and why each one would fail in production rather than in review:
 *
 *   1. **The safety posture is not a setting.** Live trading and broker execution are literal
 *      `false` in the type and the default profile, no operating mode is live, and no operation
 *      could be mistaken for an execution. A regression here is the one thing this project must
 *      never ship.
 *   2. **The listener is loopback, so exposure is a deliberate act.** The default host is the local
 *      interface and every default origin is loopback; a public bind is something an operator
 *      writes down, not something that happens by omission.
 *   3. **The frontend is static, so no server-side route is load-bearing.** There is no client
 *      router and no history API use anywhere in the UI, which is why the Nginx config needs no
 *      `try_files` fallback and cannot 404 on a deep link — because no deep link exists.
 *   4. **Every asset reference is same-origin and present.** Each `/…` reference in the HTML and the
 *      manifest resolves to a file that ships, with no `http://` anywhere to trigger mixed content.
 *   5. **Readiness tells the truth under load.** Liveness answers without authentication and
 *      without a database, and neither endpoint leaks a credential.
 */

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import {
  ALL_OPERATION_IDS,
  HARDLINE_OPERATION_PATTERN,
  assertNoHardlineOperations,
} from '../packages/shared/src/auth/model.js';
import { DEFAULT_SAFETY_PROFILE, type OperatingMode } from '../packages/shared/src/types.js';
import {
  CAPABILITY_CATALOGUE,
  assertCapabilityCatalogue,
} from '../packages/shared/src/capabilities/registry.js';
import { SOCKET_ROUTES } from '../packages/shared/src/api/contracts.js';
import { resolveConfig } from '../src/core/config.js';
import { createServer } from '../src/server/index.js';
import type { ServerDeps } from '../src/server/index.js';

const read = (path: string): string => readFileSync(path, 'utf8');

const OPERATING_MODES: readonly OperatingMode[] = ['training', 'sandbox', 'shadow'];

/**
 * The bundle guard, on the same convention the database suites use for the native driver.
 *
 * `build:web` runs *after* the tests inside `npm run validate`, so on a clean checkout there is
 * no bundle to inspect. `it.skip` rather than an early return on purpose: a skipped test is
 * reported as skipped, so the gap is visible in the output instead of passing quietly.
 */
const withBundle = existsSync('web/dist/index.html') ? it : it.skip;

/** The shapes a leaked credential would take, so a response body can be checked for them. */
const SECRET_SHAPE = /sk-[A-Za-z0-9]|Bearer\s|mt_s_|BEGIN [A-Z ]*PRIVATE KEY|password\s*[:=]/i;

function serverFor(mode: OperatingMode = 'training') {
  const sink = new MemoryLogSink();
  const deps: ServerDeps = {
    config: resolveConfig({ mode }),
    sink,
    now: () => Date.now(),
  };
  return createServer(deps);
}

/** Every `/…` value of an `href` or `src` attribute in a fragment of HTML. */
function assetReferences(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((match) => match[1] ?? '');
}

/* ------------------------------------------------------------------ */
/* The safety posture                                                  */
/* ------------------------------------------------------------------ */

describe('the trading boundary cannot be configured away', () => {
  it('keeps live trading and broker execution literal false in the type and the default', () => {
    // `false` rather than `boolean`: a value that cannot be true is stronger than a value that
    // is currently false, because there is no expression that could set it.
    const types = read('packages/shared/src/types.ts');
    expect(types).toMatch(/liveTradingEnabled:\s*false/);
    expect(types).toMatch(/brokerExecutionEnabled:\s*false/);
    expect(DEFAULT_SAFETY_PROFILE.liveTradingEnabled).toBe(false);
    expect(DEFAULT_SAFETY_PROFILE.brokerExecutionEnabled).toBe(false);
  });

  it('resolves every operating mode with both flags false, and offers no live mode', () => {
    for (const mode of OPERATING_MODES) {
      const config = resolveConfig({ mode });
      expect(config.safety.liveTradingEnabled, mode).toBe(false);
      expect(config.safety.brokerExecutionEnabled, mode).toBe(false);
    }
    // There is no mode a deployment could select into that trades.
    expect(OPERATING_MODES as readonly string[]).not.toContain('live');
    expect(DEFAULT_SAFETY_PROFILE.mode).toBe('training');
  });

  it('defines no operation that could place an order or reach a broker', () => {
    // The pattern is the project's own hardline definition, so this asserts the rule and its
    // enforcement agree rather than restating the words.
    expect(ALL_OPERATION_IDS.filter((id) => HARDLINE_OPERATION_PATTERN.test(id))).toEqual([]);
    expect(() => assertNoHardlineOperations()).not.toThrow();
  });

  it('passes the capability catalogue’s own boot check', () => {
    // A capability naming an unknown feature, cost or operation fails here — so this is the
    // assertion that the deployed catalogue is internally consistent, not merely non-empty.
    expect(() => assertCapabilityCatalogue()).not.toThrow();
    expect(CAPABILITY_CATALOGUE.length).toBeGreaterThan(0);

    // And no declared capability offers an execution of any kind.
    const declared = JSON.stringify(
      CAPABILITY_CATALOGUE.map((entry) => ({
        id: entry.id,
        operation: entry.operation,
        feature: entry.feature,
        outputs: entry.outputs,
      })),
    );
    expect(declared).not.toMatch(/"order|place-order|broker|execute-order/i);
  });
});

/* ------------------------------------------------------------------ */
/* The listener and the origin policy                                  */
/* ------------------------------------------------------------------ */

describe('a public bind is a deliberate act, not an omission', () => {
  it('defaults to the loopback interface', () => {
    const config = resolveConfig({});
    expect(config.api.host).toBe('127.0.0.1');
    expect(config.api.port).toBeGreaterThan(1023);
  });

  it('allows only loopback origins by default, and enforces the loopback rule', () => {
    const config = resolveConfig({});
    expect(config.api.enforceLoopback).toBe(true);
    expect(config.api.corsAllowedOrigins.length).toBeGreaterThan(0);
    for (const origin of config.api.corsAllowedOrigins) {
      const { hostname } = new URL(origin);
      expect(['127.0.0.1', 'localhost', '::1'], origin).toContain(hostname);
    }
  });

  it('serves the event stream on a fixed relative path a proxy can forward', () => {
    // A path rather than a host and port, so the reverse proxy decides the public name and the
    // client never needs to know the internal one.
    expect(SOCKET_ROUTES).toHaveLength(1);
    const route = SOCKET_ROUTES[0];
    expect(route?.path).toBe('/ws');
    expect(route?.path.startsWith('/')).toBe(true);
    expect(route?.operation).toBe('realtime.connect');
  });
});

/* ------------------------------------------------------------------ */
/* Health and readiness                                                */
/* ------------------------------------------------------------------ */

describe('health answers honestly in the deployed shape', () => {
  it('reports liveness without authentication and without a database', async () => {
    const server = serverFor();
    try {
      const response = await server.app.inject({ method: 'GET', url: '/v1/health' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe('ok');
      expect(body.correlationId).toMatch(/\S+/);
      // The API version travels as a header, so a proxy can pin a client to it.
      expect(response.headers['x-api-version']).toMatch(/\S+/);
      expect(response.headers['x-correlation-id']).toBe(body.correlationId);
      // A load balancer must not cache a liveness answer.
      expect(response.headers['cache-control']).toContain('no-store');
    } finally {
      await server.close();
    }
  });

  it('reports readiness as degraded rather than ready, and withholds detail from a stranger', async () => {
    const server = serverFor();
    try {
      const response = await server.app.inject({ method: 'GET', url: '/v1/health/ready' });
      expect(response.statusCode).toBe(200);
      const data = response.json().data;

      // No database and no hosted provider is the honest state of a local-first deployment, and
      // claiming readiness for it would make the endpoint useless during a real incident.
      expect(data.overall).toBe('degraded');
      expect(data.checks.length).toBeGreaterThan(0);
      for (const check of data.checks) {
        expect(check.detail, check.name).toBeUndefined();
        expect(check.critical, check.name).toBeUndefined();
      }
      expect(data.config).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it('never puts a credential shape in a health response', async () => {
    const server = serverFor();
    try {
      for (const url of ['/v1/health', '/v1/health/ready']) {
        const response = await server.app.inject({ method: 'GET', url });
        expect(response.body, url).not.toMatch(SECRET_SHAPE);
      }
    } finally {
      await server.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Static hosting                                                      */
/* ------------------------------------------------------------------ */

describe('the frontend is static, so no server route is load-bearing', () => {
  it('mounts the application at one element and never navigates by path', () => {
    const html = read('web/index.html');
    expect(html).toMatch(/<div id="root">/);
    expect(html).toMatch(/<script type="module" src="\/src\/main\.tsx">/);

    // No router and no history API anywhere in the UI: the shell selects a page from its own
    // store, so there is no deep link for a static host to fail to resolve.
    for (const path of ['web/src/App.tsx', 'web/src/app/AppShell.tsx', 'web/src/store/ui.ts']) {
      const source = read(path);
      expect(source, path).not.toMatch(/history\.pushState|history\.replaceState|useNavigate/);
      expect(source, path).not.toMatch(/BrowserRouter|createBrowserRouter|<Route\b/);
    }
  });

  it('builds for a root mount and binds its own dev servers to loopback', () => {
    const vite = read('vite.config.ts');
    // A root `base` is what a reverse proxy at `/` serves. A subpath deployment would set it,
    // and this assertion is what would force that decision to be made deliberately.
    expect(vite).not.toMatch(/\bbase:\s*['"]/);
    expect(vite).toMatch(/outDir:\s*'dist'/);
    expect(vite).toMatch(/host:\s*'127\.0\.0\.1'/);
    expect(vite).toMatch(/strictPort:\s*true/);
  });

  it('points the desktop shell at the same built bundle', () => {
    const tauri = read('src-tauri/tauri.conf.json');
    expect(tauri).toMatch(/"frontendDist":\s*"\.\.\/web\/dist"/);
    // The dev URL is loopback, so a desktop build never reaches a public host in development.
    expect(tauri).toMatch(/"devUrl":\s*"http:\/\/127\.0\.0\.1:\d+"/);
  });

  it('exposes a verification command the deploy can run', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['desktop:verify']).toBeDefined();
    expect(pkg.scripts['build:web']).toBeDefined();
    expect(pkg.scripts['api']).toBeDefined();
    // And the API starts from the compiled output, not from a source loader.
    expect(pkg.scripts['api']).toMatch(/^node dist\//);
  });
});

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

describe('every asset a browser is told to fetch is one that ships', () => {
  it('resolves each shipped reference in the document', () => {
    const html = read('web/index.html');
    // `/src/…` is the dev entry module, which the bundler replaces with a hashed asset at build
    // time; everything else is a file the document expects the static host to serve as-is.
    const references = assetReferences(html).filter((reference) => !reference.startsWith('/src/'));

    // The favicon, the manifest, the touch icon, the Open Graph image and the boot mark: five
    // distinct surfaces, and a missing one is a broken tab icon or a blank first paint.
    expect(references.length).toBeGreaterThanOrEqual(5);
    for (const reference of references) {
      expect(existsSync(`web/public${reference}`), `missing asset ${reference}`).toBe(true);
    }
  });

  it('carries no mixed content', () => {
    // An `http://` asset reference on an `https://` page is blocked by the browser, so a logo
    // that resolves in development would simply not appear in production.
    for (const path of ['web/index.html', 'web/public/site.webmanifest']) {
      expect(read(path), path).not.toMatch(/["(]http:\/\//);
    }
  });

  it('describes the installed application completely enough to install', () => {
    const manifest = JSON.parse(read('web/public/site.webmanifest')) as {
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };

    expect(manifest.name).toMatch(/Master Trade/);
    expect(manifest.short_name).toBe('Master Trade');
    // A root scope and start URL, so the installed app opens where the site does.
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    // The browser chrome colour must match the first paint, or the splash flashes a lighter frame.
    expect(manifest.theme_color).toBe('#05070b');
    expect(manifest.background_color).toBe(manifest.theme_color);

    const purposes = manifest.icons.map((icon) => icon.purpose ?? 'any');
    expect(purposes).toContain('any');
    // A maskable icon is what stops the mark being cropped by an Android launcher's mask.
    expect(purposes).toContain('maskable');

    for (const icon of manifest.icons) {
      expect(icon.type, icon.src).toBe('image/png');
      expect(existsSync(`web/public${icon.src}`), `missing icon ${icon.src}`).toBe(true);
      // The declared size must agree with the file name, because that name is generated from it.
      const [width] = icon.sizes.split('x');
      expect(icon.src, icon.src).toContain(width ?? '');
    }
  });

  it('declares the high-DPI and maskable sizes the platforms ask for', () => {
    const { icons } = JSON.parse(read('web/public/site.webmanifest')) as {
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    const sizes = icons.map((icon) => icon.sizes);
    // 192 and 512 `any` for the install prompt, 512 `maskable` for the launcher mask.
    expect(sizes).toContain('192x192');
    expect(sizes.filter((size) => size === '512x512').length).toBeGreaterThanOrEqual(2);
    expect(icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(
      true,
    );
  });

  withBundle('resolves every asset the built bundle references', () => {
    const built = read('web/dist/index.html');
    expect(built).not.toMatch(/["(]http:\/\//);
    // A built document references its hashed assets and nothing from `/src/`, which is the
    // property that makes it safe to serve as a static file.
    expect(built).not.toMatch(/["']\/src\//);
    const references = assetReferences(built).filter((reference) =>
      reference.startsWith('/assets/'),
    );
    expect(references.length, 'the bundle references no hashed asset').toBeGreaterThan(0);
    for (const reference of references) {
      expect(existsSync(`web/dist${reference}`), `missing bundle asset ${reference}`).toBe(true);
    }
  });
});
