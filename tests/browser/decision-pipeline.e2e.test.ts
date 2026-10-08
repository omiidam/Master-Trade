/**
 * Phase 2.14 — the Needle 3 decision pipeline, in a real browser.
 *
 * The Product Foundation suite renders the built UI as a fixture surface; this
 * file is the other seam. It boots the **real local API** — the same
 * `startServer` process `npm run api` runs, with the offline deterministic
 * adapter answering — and a rebuild of the built frontend pinned to it, so a
 * human-typed prompt travels the complete local flow:
 *
 *   textarea → composer → API client → agent.chat → **decision router** →
 *   routing policy → offline adapter (local route) or Agent Loop →
 *   LLM Gateway (cloud route) → response pipeline → transcript.
 *
 * What is pinned, per requirement:
 *
 *   1. A non-trading prompt is classified, routed locally, answered without
 *      any gateway call — and the decision block (intent, selected path,
 *      confidence) is visible in the transcript.
 *   2. A complex trading request keeps the full pipeline: route
 *      `LLM_GATEWAY`, a hosted-model note, and a decision block that says
 *      cloud LLM was required.
 *   3. The fallback state is named, never silent: the sidebar names which
 *      layer produced the decision.
 *   4. Nothing about the model's disk layout or any credential reaches the
 *      document.
 *
 * The classifier is the one mocked seam, at the adapter boundary
 * (`deps.decisionRouter`) — a deterministic stub exactly where the local
 * Cactus classifier would run, so both routes are exercised in one session
 * without a per-turn subprocess. The policy suite (`tests/decision-router.test.ts`)
 * covers the real adapter and the default fallback-only configuration.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { translate } from '../../web/src/i18n/index.js';
import { NAV_SECTIONS } from '../../web/src/config/navigation.js';
import { resolveConfig } from '../../src/core/config.js';
import {
  createChatDecisionRouter,
  type ChatDecisionRouter,
} from '../../src/agent/decisionRouter/index.js';
import { decisionOf } from '../decision-router-helpers.js';
import {
  findBrowser,
  openSession,
  startStaticServer,
  type PageSession,
  type StaticServer,
} from './driver.js';

const BROWSER = findBrowser();
const suite = BROWSER === null ? describe.skip : describe;

/** The router the API boots with: a deterministic classifier stub behind the real policy. */
function stubRouter(): ChatDecisionRouter {
  // `createChatDecisionRouter` applies the deterministic policy on top of the
  // stubbed classification, so the API boots the real layer with a hermetic
  // classifier at the adapter boundary — both routes reachable in one session.
  return createChatDecisionRouter(
    { ...resolveConfig({}).decisionRouter, checkpointPath: '/models/needle3.safetensors' },
    {
      classifier: {
        classify: ({ message }) =>
          Promise.resolve(
            /\bhello\b/i.test(message)
              ? decisionOf('NON_TRADING', 'LOCAL_RESPONSE', 92)
              : decisionOf('MARKET_ANALYSIS', 'LLM_GATEWAY', 87),
          ),
      },
    },
  );
}

suite('the Needle 3 decision pipeline in a real browser (Phase 2.14)', () => {
  let session: PageSession;
  let staticServer: StaticServer;
  let api: Awaited<ReturnType<typeof import('../../src/server/start.js').startServer>>;
  let distDir: string | null = null;

  beforeAll(async () => {
    // A free loopback port, reserved and released: the build pins the API URL
    // before the API exists, so the port has to be chosen first.
    const port = await new Promise<number>((resolve, reject) => {
      const probe = net.createServer();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const chosen = typeof address === 'object' && address !== null ? address.port : null;
        // Closed only after the port was read: closing mid-bind cancels the
        // `listening` callback the promise is waiting on.
        probe.close(() =>
          chosen === null ? reject(new Error('no ephemeral port')) : resolve(chosen),
        );
      });
    });

    // Rebuild the frontend pinned at the API the test is about to boot. The
    // workspace's own vite binary, not `npx` — a resolver prompt has nowhere
    // to go with the output ignored, and would hang the suite forever.
    distDir = await mkdtemp(join(tmpdir(), 'mt-e2e-decision-'));
    const vite = join(process.cwd(), 'node_modules', '.bin', 'vite');
    const build = spawn(vite, ['build', '--outDir', distDir, '--emptyOutDir'], {
      cwd: process.cwd(),
      env: { ...process.env, VITE_MT_API_URL: `http://127.0.0.1:${port}` },
      stdio: 'ignore',
    });
    await new Promise<void>((resolve, reject) => {
      build.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`)),
      );
      build.once('error', reject);
    });

    staticServer = await startStaticServer(distDir);

    // The real API, on the pinned port, allowing exactly the page that will call it.
    // Anonymous local sign-in is the browser preview's door, exactly as `npm run api`
    // enables it for a standalone deployment with no shell.
    const config = resolveConfig({});
    config.api.port = port;
    config.api.corsAllowedOrigins = [staticServer.origin];
    config.auth.allowAnonymousLocalLogin = true;
    // Its own database: the test signs in against the real schema (migrations and
    // all) without sharing rows with whatever else is running on this machine.
    config.database.file = join(distDir, 'e2e.db');
    const { startServer } = await import('../../src/server/start.js');
    api = await startServer({ config, decisionRouter: stubRouter() });

    session = await openSession(BROWSER as string);
    await session.setViewport(1440, 900);
    await session.goto(staticServer.origin);

    // Open the AI Workspace the way a tester does.
    const agent = NAV_SECTIONS.find((entry) => entry.id === 'agent');
    if (agent === undefined) throw new Error('no agent navigation entry');
    await session.clickNav(translate('en', agent.labelKey));
  }, 240_000);

  afterAll(async () => {
    await session?.close();
    await staticServer?.close();
    await api?.close();
    if (distDir !== null)
      await rm(distDir, { recursive: true, force: true }).catch(() => undefined);
  });

  /** Whether the document contains a needle of text. */
  function bodyIncludes(text: string): string {
    return `document.body.innerText.includes(${JSON.stringify(text)})`;
  }

  /** Type a real prompt and send it, the way the tester does. */
  async function sendPrompt(message: string): Promise<void> {
    await session.waitFor(`!!document.querySelector('textarea')`, 'the composer');
    await session.evaluate(`document.querySelector('textarea').focus(); true`);
    await session.typeText(message);
    const sent = await session.evaluate(`
      (() => {
        const send = [...document.querySelectorAll('button')].find(
          (item) => (item.getAttribute('aria-label') ?? '') === 'Send message',
        );
        if (!send || send.disabled) return false;
        send.click();
        return true;
      })()
    `);
    if (sent !== true) throw new Error('the send control did not offer a click');
  }

  it('routes a non-trading prompt locally and shows the decision in the transcript', async () => {
    await sendPrompt('Hello, good evening');

    // The decision block: intent, selected path, confidence.
    await session.waitFor(
      bodyIncludes('decision NON_TRADING → LOCAL_RESPONSE (92%)'),
      'the decision block of the non-trading turn',
    );
    // The route line agrees: answered on this machine.
    await session.waitFor(bodyIncludes('LOCAL_RESPONSE'), 'the route line');
    // The sidebar names the layer that decided.
    await session.waitFor(
      bodyIncludes('Needle 3, confidence 92%'),
      'the decision layer in the sidebar',
    );
    // No gateway call happened for this turn: the note says no hosted model was consulted.
    await session.waitFor(bodyIncludes('no hosted model was consulted'), 'the local note');
  }, 60_000);

  it('keeps a complex trading prompt on the full pipeline and says cloud LLM was required', async () => {
    await sendPrompt('Analyze gold market structure in detail');

    await session.waitFor(
      bodyIncludes('decision MARKET_ANALYSIS → LLM_GATEWAY (87%)'),
      'the decision block of the cloud turn',
    );
    await session.waitFor(bodyIncludes('LLM_GATEWAY'), 'the gateway route line');
    await session.waitFor(
      bodyIncludes('cloud LLM required'),
      'the cloud-LLM requirement in the sidebar',
    );

    // Nothing about the model's disk layout or a credential reaches the document.
    expect(
      await session.evaluate<boolean>(
        `document.body.innerText.includes('safetensors') || document.body.innerText.includes('checkpoint')`,
      ),
    ).toBe(false);
  }, 60_000);

  it('logged no runtime error while the pipeline was exercised', () => {
    const errors = session.diagnostics.filter((entry) => /error|exception/.test(entry));
    expect(errors).toEqual([]);
  });
});
