/**
 * A browser, driven over the DevTools Protocol — with no new dependency.
 *
 * Why this file exists
 * --------------------
 * Phase 5.9 closed almost every gap in the Product Foundation and left one open on
 * purpose: every responsive and interface-state rule was asserted against the shipped
 * `.tsx` **as text**. A source-text assertion can prove that `md:grid-cols-2` is
 * present; it cannot prove the page never scrolls sideways on a 390 px phone, because
 * horizontal overflow is decided by a layout engine, not by a string.
 *
 * Closing that gap needs a real browser — and a real browser is the one thing this
 * repository has refused to buy. Phases 5.1–5.9 kept the dependency surface minimal on
 * purpose (there is a `tests/dependency-graph.test.ts` whose whole job is to fail if a
 * second, vulnerable toolchain reappears), so adding Playwright and a ~150 MB Chromium
 * download to assert `scrollWidth` would trade a real invariant for a heavy one.
 *
 * It is also unnecessary. Two facts make a driver this small possible:
 *
 *   1. **Chrome speaks a documented JSON protocol over a WebSocket.** Launch it with
 *      `--remote-debugging-port`, ask `/json/list` for a page target, and drive it with
 *      `Page.navigate`, `Runtime.evaluate`, `Emulation.setDeviceMetricsOverride` and
 *      `Page.captureScreenshot`. No library is involved.
 *   2. **Node 22+ has a built-in `WebSocket` client.** So the transport is a global, not
 *      a package.
 *
 * The cost is ~250 lines here; the cost of the alternative is a dependency tree in a
 * project that has spent five phases keeping one out. The browser itself is found, not
 * downloaded: whatever Chrome, Chromium or Edge the host already has. When none exists
 * the suite says so and skips, which is the one shape this repository allows a skip to
 * take (see `tests/test-hygiene.test.ts`).
 *
 * Determinism rules this file follows
 * -----------------------------------
 * Nothing here waits a fixed number of milliseconds to synchronise. Every wait is a
 * **bounded poll against a condition** (`waitFor`), so a slow two-core VPS makes the
 * suite slower rather than making it lie. That is the same rule the rest of `tests/`
 * is held to, applied to the browser.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The slice of `WebSocket` this driver uses.
 *
 * Declared structurally rather than importing a DOM lib: the repository's `tsconfig`
 * sets `types: ["node"]`, and the whole point of this module is that the only "browser"
 * surface it needs is a socket.
 */
interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(
    type: string,
    listener: (event: { data: unknown }) => void,
    options?: { once?: boolean },
  ): void;
}

const Socket = (globalThis as unknown as { WebSocket: new (url: string) => SocketLike }).WebSocket;

interface CdpError {
  code?: number;
  message?: string;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: CdpError;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/* -------------------------------------------------------------------------- */
/* Static server                                                               */
/* -------------------------------------------------------------------------- */

export interface StaticServer {
  readonly origin: string;
  readonly requests: number;
  close(): Promise<void>;
}

/**
 * Serve a built directory over HTTP on an ephemeral loopback port.
 *
 * Serving the **build output** rather than the dev server is deliberate: it is what
 * production ships, so the suite exercises the hashed asset names, the manifest and the
 * favicon exactly as a browser would receive them. It also removes `vite` from the
 * test's dependency on time — no watcher, no HMR, no cold transform on first request.
 *
 * Resolution is confined to the root: a request that escapes it is refused rather than
 * served. This is a test fixture and not product code, but a fixture that can read
 * `../../etc/passwd` is a bad example to leave lying around.
 */
export async function startStaticServer(rootDir: string): Promise<StaticServer> {
  const root = resolve(rootDir);
  let requests = 0;

  const server = createServer(async (request, response) => {
    requests += 1;
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const candidate = resolve(root, `.${normalize(pathname)}`);
    const inside = candidate === root || candidate.startsWith(root + sep);
    const target = inside && existsSync(candidate) ? candidate : join(root, 'index.html');

    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });

  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the static server did not report a port');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    get requests() {
      return requests;
    },
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

/* -------------------------------------------------------------------------- */
/* Locating a browser                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Find a Chromium-family browser the host already has.
 *
 * An explicit `MASTER_TRADE_E2E_BROWSER` wins, so CI can point at a pinned binary. Edge
 * is an acceptable answer on Windows because it speaks the same protocol.
 */
export function findBrowser(): string | null {
  const override = process.env['MASTER_TRADE_E2E_BROWSER'];
  if (override) return existsSync(override) ? override : null;

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/usr/bin/microsoft-edge',
          ];

  return candidates.find((path) => existsSync(path)) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Page session                                                                */
/* -------------------------------------------------------------------------- */

export interface OverflowFinding {
  tag: string;
  detail: string;
  right: number;
  width: number;
}

export interface PageSession {
  setViewport(width: number, height: number): Promise<void>;
  goto(url: string): Promise<void>;
  /** Poll a boolean expression until it is true, or fail naming what never happened. */
  waitFor(expression: string, description: string, timeoutMs?: number): Promise<void>;
  evaluate<T>(expression: string): Promise<T>;
  /**
   * Evaluate an expression that returns JSON **text** and hand back the parsed value.
   *
   * The probes above are written as `JSON.stringify(...)` because a CDP result is
   * returned by value and a DOM object does not survive that journey. Parsing here rather
   * than at each call site keeps the difference between "the page returned a string" and
   * "the page returned a measurement" in exactly one place.
   */
  evaluateJson<T>(expression: string): Promise<T>;
  clickNav(label: string): Promise<void>;
  /** Press a real key, so `:focus-visible` and default actions behave as they do for a user. */
  pressKey(key: 'Tab' | 'Enter' | 'Escape' | 'Shift+Tab'): Promise<void>;
  screenshot(): Promise<string>;
  /** Console errors and uncaught exceptions seen since the last `clearDiagnostics`. */
  readonly diagnostics: readonly string[];
  clearDiagnostics(): void;
  close(): Promise<void>;
}

const LAYOUT_SETTLE_MS = 8_000;

/**
 * Launch a browser, open one page target, and hand back a session that drives it.
 *
 * The caller owns the session and must `close()` it; `close()` kills the process, waits
 * for it to actually exit, and only then removes the throwaway profile. Deleting the
 * profile first is how you get `EBUSY: resource busy or locked, unlink ...lockfile` on
 * Windows — a cleanup race that turns a green suite red.
 */
export async function openSession(executablePath: string): Promise<PageSession> {
  const profile = await mkdtemp(join(tmpdir(), 'master-trade-e2e-'));
  const debugPort = 9000 + Math.floor(Math.random() * 900);

  const browser = spawn(
    executablePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-features=Translate,MediaRouter',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debugPort}`,
      // A container or VPS smoke test often runs as root, where the sandbox cannot
      // start. Narrow and explicit rather than always on.
      ...(typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const socketUrl = await findPageTarget(debugPort, browser);
  const socket = new Socket(socketUrl);

  await new Promise<void>((ready, failed) => {
    socket.addEventListener('open', () => ready(), { once: true });
    socket.addEventListener(
      'error',
      () => failed(new Error('the browser refused the DevTools connection')),
      { once: true },
    );
  });

  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const diagnostics: string[] = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;

    if (typeof message.id === 'number') {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message ?? 'CDP error'));
      else waiter.resolve(message.result);
      return;
    }

    // Diagnostics are what makes "no fatal runtime errors" a checkable claim rather
    // than a hope. React logs a thrown render error here; the app logs a failed fetch.
    if (message.method === 'Runtime.exceptionThrown') {
      const params = message.params as { exceptionDetails?: { text?: string } } | undefined;
      diagnostics.push(`exception: ${params?.exceptionDetails?.text ?? 'unknown'}`);
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const params = message.params as
        { type?: string; args?: { value?: unknown; description?: string }[] } | undefined;
      if (params?.type === 'error') {
        const text = (params.args ?? [])
          .map((arg) => String(arg.value ?? arg.description ?? ''))
          .join(' ');
        diagnostics.push(`console.error: ${text}`);
      }
    }
  });

  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> =>
    new Promise((resolveMessage, rejectMessage) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const evaluate = async <T>(expression: string): Promise<T> => {
    const outcome = (await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as {
      result?: { value?: unknown };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };

    if (outcome.exceptionDetails) {
      throw new Error(
        `the page threw while evaluating: ${
          outcome.exceptionDetails.exception?.description ?? outcome.exceptionDetails.text ?? '?'
        }`,
      );
    }
    return outcome.result?.value as T;
  };

  /**
   * The width the next document must lay out at.
   *
   * The ordering here is the whole subtlety of mobile emulation. A page reads its
   * `<meta name="viewport">` **at load**, so switching to a narrow width on an
   * already-loaded document can leave the layout viewport wider than the emulated one —
   * the page has no reason to re-evaluate the meta tag. Asserting the width on the next
   * freshly loaded document is what makes the mobile measurement real, so the override
   * is applied here and *asserted* in `goto`, after the new document has rendered.
   */
  let expectedWidth: number | null = null;
  let emulatingMobile = false;

  const session: PageSession = {
    async setViewport(width, height) {
      expectedWidth = width;
      const mobile = width < 768;

      // Crossing the desktop/mobile emulation boundary needs a blank document first.
      // A loaded page has already resolved its `<meta name="viewport">`, and flipping
      // `mobile` under it is not reliably re-applied: the same request succeeds from a
      // blank document and silently keeps the previous layout viewport otherwise, which
      // shows up as a desktop-width page measured at a phone width.
      if (mobile !== emulatingMobile) {
        await send('Page.navigate', { url: 'about:blank' });
        await session.waitFor(`document.readyState === 'complete'`, 'a blank document');
        emulatingMobile = mobile;
      }

      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
        // Supplied explicitly: left to default, Chrome derives the layout viewport from
        // screen metrics that otherwise keep the previous override's values.
        screenWidth: width,
        screenHeight: height,
        positionX: 0,
        positionY: 0,
      });
    },

    async goto(url) {
      await send('Page.navigate', { url });
      await session.waitFor(
        `document.readyState === 'complete' && !!document.getElementById('workspace-main')`,
        `the application to render at ${url}`,
      );
      if (expectedWidth !== null) {
        // Reported rather than merely asserted: "the viewport is 980 when 430 was asked
        // for" says what went wrong, while a timeout on the same condition says nothing.
        const observed = await evaluate<number>('window.innerWidth');
        if (observed !== expectedWidth) {
          throw new Error(
            `the layout viewport is ${observed}px but ${expectedWidth}px was requested`,
          );
        }
      }
    },

    async waitFor(expression, description, timeoutMs = LAYOUT_SETTLE_MS) {
      const deadline = Date.now() + timeoutMs;
      let lastError = '';
      while (Date.now() < deadline) {
        try {
          if ((await evaluate<boolean>(`!!(${expression})`)) === true) return;
        } catch (error) {
          lastError = error instanceof Error ? ` (${error.message})` : '';
        }
        await poll();
      }
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${description}${lastError}`);
    },

    evaluate,

    async evaluateJson<T>(expression: string): Promise<T> {
      const raw = await evaluate<string>(expression);
      if (typeof raw !== 'string') {
        throw new Error(`expected JSON text from the page, received ${typeof raw}`);
      }
      return JSON.parse(raw) as T;
    },

    async clickNav(label) {
      // Found by shape rather than by the landmark's own name: since the interface is translatable, that name
      // is in whichever language is chosen, and a driver that matched the English one would stop being able
      // to navigate the moment the switch worked.
      const clicked = await evaluate<boolean>(`
        (() => {
          const wanted = ${JSON.stringify(label)};
          for (const nav of document.querySelectorAll('nav')) {
            const button = [...nav.querySelectorAll('button')].find(
              (item) => (item.getAttribute('aria-label') ?? item.textContent ?? '').trim() === wanted,
            );
            if (button) {
              button.click();
              return true;
            }
          }
          return false;
        })()
      `);
      if (!clicked) throw new Error(`no navigation button is named ${JSON.stringify(label)}`);
    },

    async pressKey(key) {
      // Named keys only. Scancodes and text keys are deliberately out of scope: this
      // exists so a keyboard navigation check is a real key event rather than a
      // synthetic `.focus()`, which would not trigger `:focus-visible` and would
      // therefore "verify" a focus ring that a keyboard user never gets.
      const KEYS: Record<string, { key: string; code: string; vk: number; shift?: boolean }> = {
        Tab: { key: 'Tab', code: 'Tab', vk: 9 },
        Enter: { key: 'Enter', code: 'Enter', vk: 13 },
        Escape: { key: 'Escape', code: 'Escape', vk: 27 },
        'Shift+Tab': { key: 'Tab', code: 'Tab', vk: 9, shift: true },
      };
      const spec = KEYS[key];
      if (!spec) throw new Error(`unsupported key: ${key}`);

      const event = {
        key: spec.key,
        code: spec.code,
        windowsVirtualKeyCode: spec.vk,
        nativeVirtualKeyCode: spec.vk,
        modifiers: spec.shift ? 8 : 0,
      };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    },

    async screenshot() {
      const capture = (await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })) as { data?: string };
      return capture.data ?? '';
    },

    get diagnostics() {
      return diagnostics;
    },
    clearDiagnostics() {
      diagnostics.length = 0;
    },

    async close() {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      browser.kill();
      await new Promise<void>((exited) => {
        if (browser.exitCode !== null) return exited();
        browser.once('exit', () => exited());
        // If the process refuses to die, continue anyway rather than hanging the suite.
        setTimeout(() => exited(), 5_000);
      });
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
    },
  };

  return session;
}

/** A short, condition-based pause for the polling loop. */
function poll(): Promise<void> {
  return new Promise((resume) => setTimeout(resume, 40));
}

/**
 * Wait for Chrome to announce a page target, and bound the wait.
 *
 * `--remote-debugging-port` is a promise about the future, so it is polled rather than
 * slept at: on a loaded machine the browser can take seconds to write the endpoint.
 */
async function findPageTarget(port: number, browser: ReturnType<typeof spawn>): Promise<string> {
  const deadline = Date.now() + 30_000;
  let lastFailure = 'the endpoint never answered';

  while (Date.now() < deadline) {
    if (browser.exitCode !== null) {
      throw new Error(`the browser exited with code ${browser.exitCode} before exposing a target`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = (await response.json()) as {
        type?: string;
        webSocketDebuggerUrl?: string;
      }[];
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      lastFailure = 'the browser exposed no page target';
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await poll();
  }
  throw new Error(`no DevTools page target after 30s: ${lastFailure}`);
}

/* -------------------------------------------------------------------------- */
/* Layout probes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Find elements that reach past the right edge of the layout viewport.
 *
 * `scrollWidth > clientWidth` tells you a page overflows; it does not tell you *what*
 * overflowed, and "no horizontal scroll" is unfixable without that. This returns the
 * offenders, widest-first, so a failure names the component instead of the symptom.
 *
 * Elements inside a container that is itself allowed to scroll horizontally
 * (`overflow-x: auto`, which is how a wide table is legitimately presented on a phone)
 * are skipped: that scroll is the design, not the defect.
 */
export const OVERFLOW_PROBE = `
(() => {
  const limit = document.documentElement.clientWidth;
  const findings = [];

  const scrollableAncestor = (node) => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const overflowX = getComputedStyle(parent).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return parent;
    }
    return null;
  };

  for (const element of document.querySelectorAll('body *')) {
    const rect = element.getBoundingClientRect();
    // A sub-pixel box is not visible content, and in a mirrored layout a 1x1 absolutely
    // positioned element (the visually hidden skip link) rounds one pixel past the edge.
    // The document-level width check below is what catches a genuine overflow.
    if (rect.width <= 1 || rect.height <= 1) continue;
    if (getComputedStyle(element).clipPath !== 'none') continue;
    // A tenth of a pixel of rounding is not a defect.
    if (rect.right <= limit + 0.5) continue;
    const scroller = scrollableAncestor(element);
    if (scroller) {
      const scrollerRect = scroller.getBoundingClientRect();
      // Only tolerated when the scroll container itself fits the viewport.
      if (scrollerRect.right <= limit + 0.5) continue;
    }
    findings.push({
      tag: element.tagName.toLowerCase(),
      detail:
        (element.getAttribute('data-testid') ||
          element.getAttribute('aria-label') ||
          (element.className && String(element.className).split(' ').slice(0, 3).join('.')) ||
          element.textContent?.trim().slice(0, 40) ||
          '').toString(),
      right: Math.round(rect.right - limit),
      width: Math.round(rect.width),
    });
  }

  findings.sort((a, b) => b.right - a.right);
  return JSON.stringify({
    limit,
    documentScrollWidth: document.documentElement.scrollWidth,
    findings: findings.slice(0, 5),
    total: findings.length,
  });
})()
`;

/**
 * Measure every interactive element against a minimum target size.
 *
 * WCAG 2.2 "Target Size (Minimum)" is 24×24 CSS px. Element size is read from the
 * rendered box, so this is a statement about the shipped interface rather than about
 * the classes that produced it.
 */
export const TARGET_PROBE = `
(() => {
  const minimum = 24;
  const small = [];
  const controls = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"]');
  for (const element of controls) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // A visually hidden element is not a target, so a 1x1 skip link is not a defect.
    // Tailwind's sr-only collapses the box with clip-path, which is how it is detected.
    if (getComputedStyle(element).clipPath !== 'none') continue;
    if (rect.width < minimum || rect.height < minimum) {
      small.push({
        tag: element.tagName.toLowerCase(),
        label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 30),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
  }
  return JSON.stringify({ considered: controls.length, small: small.slice(0, 8), total: small.length });
})()
`;

/**
 * Audit the rendered document for the accessibility properties that a browser, not a
 * source file, can decide: accessible names, image alternatives and label association.
 */
export const ACCESSIBILITY_PROBE = `
(() => {
  const issues = [];

  const nameOf = (element) => (
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    (element.getAttribute('aria-labelledby')
      ? (document.getElementById(element.getAttribute('aria-labelledby'))?.textContent || '')
      : '') ||
    (element.id ? (document.querySelector('label[for="' + element.id + '"]')?.textContent || '') : '') ||
    (element.closest('label')?.textContent || '') ||
    (element.textContent || '')
  ).trim();

  for (const element of document.querySelectorAll('button, a[href], [role="button"], [role="tab"]')) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (!nameOf(element)) {
      issues.push({ kind: 'unnamed-control', detail: element.tagName.toLowerCase() });
    }
  }

  for (const image of document.querySelectorAll('img')) {
    const hasAlt = image.hasAttribute('alt');
    const decorative = image.getAttribute('aria-hidden') === 'true';
    if (!hasAlt && !decorative) {
      issues.push({ kind: 'image-without-alt', detail: image.getAttribute('src') || '' });
    }
  }

  for (const input of document.querySelectorAll('input, select, textarea')) {
    const type = input.getAttribute('type') || input.tagName.toLowerCase();
    if (type === 'hidden') continue;
    if (!nameOf(input)) {
      issues.push({ kind: 'unlabelled-field', detail: input.getAttribute('name') || type });
    }
  }

  const landmarks = {
    main: document.querySelectorAll('main').length,
    nav: document.querySelectorAll('nav').length,
    headings: document.querySelectorAll('h1, h2, h3').length,
  };

  const headingText = [...document.querySelectorAll('h1, h2')].map((h) => h.textContent?.trim() || '');

  return JSON.stringify({ issues: issues.slice(0, 10), total: issues.length, landmarks, headingText });
})()
`;

/**
 * Find a signed figure whose sign was painted on the wrong side of its digits.
 *
 * A leading `+` or `−` is a *neutral* to the Unicode bidi algorithm, so in a right-to-left paragraph it
 * inherits the paragraph's direction and is painted on the right of the number it belongs to: `+3` draws as
 * `3+`, and `−1` as `1−`. That is a different value wearing the same characters — the corruption this phase
 * has to prevent — and it is invisible to every source-level check, because the string in the DOM is correct
 * and only the painting is wrong.
 *
 * `.num` is the product's answer (it gives a figure its own left-to-right context, isolated from the sentence
 * around it) and this probe is what makes "every figure has it" a measurement instead of a convention.
 *
 * Measured per **element** over its whole text rather than per text node, because `+{count}` is two text nodes
 * in React and neither one looks like a signed figure on its own. The innermost matching element is used, so a
 * card whose first paragraph happens to open with a number is not reported once per ancestor.
 */
export const SIGNED_FIGURE_PROBE = `
(() => {
  const root = document.querySelector('main') || document.body;
  const SIGNED = /^[+\u2212-]\\s?[0-9\u06F0-\u06F9]/;
  const text = (element) => (element.textContent || '').trim();

  const qualifying = new Set(
    [...root.querySelectorAll('*')].filter((element) => SIGNED.test(text(element))),
  );

  const findings = [];
  for (const element of qualifying) {
    // The innermost element that opens with a signed figure: an ancestor of one is the same figure.
    if ([...element.children].some((child) => qualifying.has(child))) continue;

    // Map a character of the figure onto the text node that holds it, so a figure React split into
    // several text nodes is measured as the one run a reader sees.
    const pieces = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let piece;
    while ((piece = walker.nextNode())) pieces.push(piece);
    const raw = element.textContent || '';
    const value = text(element);
    const start = raw.indexOf(value);
    const locate = (target) => {
      let counted = 0;
      for (const node of pieces) {
        const length = node.textContent.length;
        if (target < counted + length) return { node, offset: target - counted };
        counted += length;
      }
      return null;
    };

    const sign = locate(start);
    const digit = locate(start + value.search(/[0-9\u06F0-\u06F9]/));
    if (!sign || !digit) continue;

    const box = (spot) => {
      const range = document.createRange();
      range.setStart(spot.node, spot.offset);
      range.setEnd(spot.node, spot.offset + 1);
      return range.getBoundingClientRect();
    };
    const signBox = box(sign);
    const digitBox = box(digit);
    // A figure with nothing painted (a hidden control) says nothing about direction.
    if (signBox.width <= 0 || digitBox.width <= 0) continue;

    // The sign has to be drawn to the *left* of the first digit. Anything else is the bidi algorithm
    // having resolved the sign against the paragraph instead of against the number.
    if (signBox.left + 0.5 >= digitBox.left) {
      findings.push({
        figure: value.slice(0, 18),
        tag: element.tagName.toLowerCase(),
        detail:
          (element.getAttribute('data-testid') ||
            (element.className && String(element.className).split(' ').slice(0, 2).join('.')) ||
            element.parentElement?.tagName.toLowerCase() ||
            '').toString(),
        signLeft: Math.round(signBox.left),
        digitLeft: Math.round(digitBox.left),
        isolated: element.closest('.num') !== null,
      });
    }
  }

  return JSON.stringify({ findings: findings.slice(0, 8), total: findings.length });
})()
`;

/**
 * Report text that is clipped by its own box.
 *
 * A truncated label with no tooltip is a usability defect that only a layout engine can
 * see: the string is present in the DOM and passes every source-level check.
 */
export const CLIPPING_PROBE = `
(() => {
  const clipped = [];
  for (const element of document.querySelectorAll('span, p, dd, dt, h1, h2, h3, button, td, th')) {
    if (element.children.length > 0) continue;
    const text = (element.textContent || '').trim();
    if (text.length < 12) continue;
    const style = getComputedStyle(element);
    if (style.webkitLineClamp && style.webkitLineClamp !== 'none') continue;
    // Visually hidden text (Tailwind's sr-only) is a 1x1 clipped box, so its scrollWidth
    // always exceeds its clientWidth — screen-reader-only labels exist precisely to be
    // announced and not painted. "Clipped" describes text that was meant to be visible.
    if (style.clipPath !== 'none') continue;
    if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) {
      clipped.push({
        tag: element.tagName.toLowerCase(),
        text: text.slice(0, 40),
        overBy: element.scrollWidth - element.clientWidth,
        truncate: /truncate|ellipsis/.test(style.textOverflow + String(element.className)),
      });
    }
  }
  return JSON.stringify({ total: clipped.length, sample: clipped.slice(0, 6) });
})()
`;
