/**
 * Phase 2.14.B — the real Needle 3 path, in a real browser.
 *
 * Where `decision-pipeline.e2e.test.ts` pins the deterministic *policy* with
 * a stub at the adapter boundary, this file pins the real thing: the API boots
 * with the installed Cactus checkpoint and CLI (no injected classifier), and a
 * human-typed prompt travels
 *
 *   textarea → composer → API client → agent.chat → **real Needle 3
 *   classification** → routing policy → local answer, or the existing
 *   Agent Runtime → Agent Loop → LLM Gateway → response pipeline → transcript.
 *
 * The acceptance condition of the phase is exactly this: a real browser
 * request classified by the local model, taking the correct route, including
 * one that reaches the existing Agent Runtime and LLM Gateway.
 *
 * The suite is skipped only when the machine genuinely lacks the model or the
 * CLI — a property of the host, not of the code — and the reason is printed.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { translate } from '../../web/src/i18n/index.js';
import { NAV_SECTIONS } from '../../web/src/config/navigation.js';
import { resolveConfig, secretFromEnv } from '../../src/core/config.js';
import { createAiGateway, type FetchLike } from '../../src/llm/index.js';
import { DEFAULT_RETRY_POLICY } from '../../packages/shared/src/core/retry.js';
import { MemoryLogSink } from '../../packages/shared/src/core/logging.js';
import {
  findBrowser,
  openSession,
  startStaticServer,
  type PageSession,
  type StaticServer,
} from './driver.js';

const BROWSER = findBrowser();

/** The installed model: the fine-tuned router checkpoint and the Cactus CLI. */
const NEEDLE = {
  checkpoint: join(
    process.env['HOME'] ?? '',
    'needle3',
    'models',
    'checkpoints',
    'needle3-router.safetensors',
  ),
  cli: join(process.env['HOME'] ?? '', 'needle3', '.venv', 'bin', 'needle'),
};

const installed = existsSync(NEEDLE.checkpoint) && existsSync(NEEDLE.cli);
if (!installed) {
  // Named, not silent: a skipped real-model suite is a fact about the host.
  console.warn(
    `[needle3-real] skipped: ${NEEDLE.checkpoint} / ${NEEDLE.cli} not installed on this machine`,
  );
}

const suite = BROWSER === null || !installed ? describe.skip : describe;

/**
 * A hosted provider that answers offline, so the complex route has a real
 * gateway to reach: the Agent Loop, the Harness and the Response Pipeline are
 * the shipped ones, and only the network boundary answers from a fixture —
 * the same seam every alpha-chat test uses.
 */
function scriptedGateway() {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async () => {
    calls.push('call');
    return new Response(
      JSON.stringify({
        model: 'DeepSeek-V4-Flash',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                headline: 'Market structure is the shape of price',
                statements: [
                  {
                    kind: 'analysis',
                    text: 'Market structure on BTC/USDT is the sequence of swings the price has printed.',
                    sources: [],
                  },
                ],
                uncertainty: [],
                toolRequests: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const registration = createAiGateway(
    {
      primary: {
        provider: 'arvancloud' as const,
        model: 'DeepSeek-V4-Flash',
        maxTokensPerRequest: 512,
        secret: secretFromEnv('ARVANCLOUD_API_KEY'),
      },
      fallbacks: [],
      requestTimeoutMs: 30_000,
      maxRetries: 2,
      retry: DEFAULT_RETRY_POLICY,
      monthlyBudgetUsd: 25,
    },
    { resolveSecret: () => 'resolved-credential', fetchImpl },
  );
  return { registration, calls };
}

suite('the real Needle 3 path in a real browser (Phase 2.14.B)', () => {
  let session: PageSession;
  let staticServer: StaticServer;
  let api: Awaited<ReturnType<typeof import('../../src/server/start.js').startServer>>;
  let distDir: string | null = null;
  /** The server's own log records: how the turn was actually executed. */
  const logs = new MemoryLogSink();
  const gateway = scriptedGateway();

  beforeAll(async () => {
    const port = await new Promise<number>((resolve, reject) => {
      const probe = net.createServer();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const chosen = typeof address === 'object' && address !== null ? address.port : null;
        probe.close(() =>
          chosen === null ? reject(new Error('no ephemeral port')) : resolve(chosen),
        );
      });
    });

    distDir = await mkdtemp(join(tmpdir(), 'mt-e2e-needle3-'));
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

    const config = resolveConfig({});
    config.api.port = port;
    config.api.corsAllowedOrigins = [staticServer.origin];
    config.auth.allowAnonymousLocalLogin = true;
    config.database.file = join(distDir, 'e2e.db');
    // The real router: no injected classifier anywhere in this suite.
    config.decisionRouter = {
      ...config.decisionRouter,
      mode: 'needle3',
      enabled: true,
      checkpointPath: NEEDLE.checkpoint,
      cliPath: NEEDLE.cli,
      // One real classification on this machine's CPU takes tens of seconds.
      timeoutMs: 180_000,
      minConfidence: 60,
    };

    const { startServer } = await import('../../src/server/start.js');
    api = await startServer({
      config,
      aiGateway: gateway.registration,
      sink: logs,
      captureLogs: true,
    });

    session = await openSession(BROWSER as string);
    await session.setViewport(1440, 900);
    await session.goto(staticServer.origin);

    const agent = NAV_SECTIONS.find((entry) => entry.id === 'agent');
    if (agent === undefined) throw new Error('no agent navigation entry');
    await session.clickNav(translate('en', agent.labelKey));
  }, 300_000);

  afterAll(async () => {
    await session?.close();
    await staticServer?.close();
    await api?.close();
    if (distDir !== null)
      await rm(distDir, { recursive: true, force: true }).catch(() => undefined);
  });

  function bodyIncludes(text: string): string {
    return `document.body.innerText.includes(${JSON.stringify(text)})`;
  }

  /** Real inference takes tens of seconds; every wait in this file allows for it. */
  const LONG_WAIT_MS = 240_000;

  async function sendPrompt(message: string): Promise<void> {
    await session.waitFor(`!!document.querySelector('textarea')`, 'the composer', 30_000);
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

  it('classifies a non-trading prompt with the real local model and answers it locally', async () => {
    await sendPrompt('Hi there! Are you available?');

    // The real classification, over the wire: a Needle 3 verdict — not the
    // fallback — selecting the local path.
    await session.waitFor(
      bodyIncludes('decision NON_TRADING → LOCAL_RESPONSE'),
      'the real decision block of the non-trading turn',
      LONG_WAIT_MS,
    );
    await session.waitFor(
      bodyIncludes('Needle 3, confidence'),
      'the real classifier named in the sidebar',
      LONG_WAIT_MS,
    );
    // The transcript never says a fallback spoke, because none did.
    expect(await session.evaluate<boolean>(`document.body.innerText.includes('fallback:')`)).toBe(
      false,
    );
    // And nothing about the model's disk layout reaches the page.
    expect(
      await session.evaluate<boolean>(
        `document.body.innerText.includes('safetensors') || document.body.innerText.includes('checkpoint')`,
      ),
    ).toBe(false);
  }, 300_000);

  it('classifies a complex market prompt with the real model and runs the existing Agent Runtime and gateway', async () => {
    await sendPrompt('Analyze the current market structure on BTC/USDT.');

    // The real classifier required cloud reasoning; the policy selected the
    // existing pipeline, which is the Agent Runtime → Agent Loop → gateway.
    await session.waitFor(
      bodyIncludes('decision MARKET_ANALYSIS → LLM_GATEWAY'),
      'the real decision block of the complex turn',
      LONG_WAIT_MS,
    );
    await session.waitFor(
      bodyIncludes('cloud LLM required'),
      'the cloud-LLM requirement',
      LONG_WAIT_MS,
    );
    await session.waitFor(
      bodyIncludes('LLM_GATEWAY'),
      'the route line of the cloud turn',
      LONG_WAIT_MS,
    );

    // The path itself, in the server's own words: the router decided, then the
    // existing Agent Runtime ran the turn through the Harness, the Agent Loop
    // and the LLM Gateway — no second pipeline anywhere in it.
    const events = logs.records.map((record) => record.event);
    expect(events).toContain('agent.turn.routed');
    expect(events).toContain('agent.turn.loop');
    expect(gateway.calls.length).toBeGreaterThanOrEqual(1);
    // The Workplace says the same thing: this turn travelled the loop.
    await session.waitFor(
      bodyIncludes('Agent Loop → Harness → LLM Gateway → Response'),
      'the loop path named beside the turn',
      LONG_WAIT_MS,
    );

    // A tracked run exists for the turn: the Agent Runtime really ran, and the
    // Workplace is showing that run's id beside the decision.
    const runs = api.runs.listRuns('local-owner');
    const runId = runs.at(-1)?.runId ?? '';
    expect(runId).toMatch(/^run_/);
    expect(
      await session.evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(runId)})`),
    ).toBe(true);
  }, 300_000);

  it('logged no runtime error while the real path was exercised', () => {
    const errors = session.diagnostics.filter((entry) => /error|exception/.test(entry));
    expect(errors).toEqual([]);
  });
});
