/**
 * Phase 7.5.3.4.1 — the language an answer is written in, from the four signals to the prompt.
 *
 * The phase names one priority and six behaviours, and this file is the two halves of them:
 *
 *   - **The decision** (`web/src/language/response.ts`, over 7.5.3.1–7.5.3.2's modules): a request in the
 *     message, then the person's explicit choice, then what their previous turns showed, then the reading
 *     of the message. Every case below is one of those four winning, and one of them being *passed over* —
 *     because a priority that is never tested at its boundary is a list of sources rather than an order.
 *   - **The application** (`src/llm/prompt.ts` and the agent pipeline): the resolved language reaches the
 *     model as a wording instruction in the system message, the prompt is byte-identical when there is no
 *     language to state, and the answer's content — statements, tool results, refusals, permissions — is
 *     exactly what it would have been without it.
 *
 * The suite is deliberately blind to the two layers' internals: it imports the language layer by its public
 * surface and the pipeline by the functions the service actually calls, so a change that keeps the
 * behaviour passes and a change that moves a decision fails.
 */

import { describe, expect, it } from 'vitest';
import {
  GUIDANCE_FIELDS,
  GUIDANCE_INVARIANTS,
  LANGUAGE_PROFILE_FIELDS,
  REPLY_LANGUAGES,
  REPLY_SOURCES,
  communicationProfile,
  emptyObservations,
  languageProfile,
  learnedLanguage,
  mergeObservations,
  observeCommunication,
  parseObservations,
  readCommunicationObservations,
  responseControl,
  storedResponseOptions,
  writeCommunicationObservations,
  type CommunicationObservations,
  type PreferenceStorage,
  type ReplyLanguage,
} from '../web/src/language/index.js';
import {
  DEFAULT_SAFETY_PROFILE,
  RESPONSE_LANGUAGES,
  type ModelStatement,
} from '../packages/shared/src/types.js';
import {
  DECISION_POLICY,
  RESPONSE_LANGUAGE_DIRECTIVE,
  buildTurnMessages,
  withResponseDirectives,
} from '../src/llm/prompt.js';
import { OUTPUT_CONTRACT } from '../src/llm/summary.js';
import { AgentService } from '../src/agent/service.js';
import { Orchestrator } from '../src/agent/orchestrator.js';
import { createLlmModelAdapter } from '../src/agent/asyncModel.js';
import { section } from '../src/agent/context.js';
import { LlmGateway, type LlmGatewayConfig } from '../src/llm/provider.js';
import { openAiCompatibleProvider, type FetchLike } from '../src/llm/providers/index.js';
import { InMemoryStore } from '../src/memory/store.js';
import { defaultToolRegistry } from '../packages/trading-engine/src/index.js';
import { loadInstructions, renderInstructions } from '../src/instructions/loader.js';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import { createServer } from '../src/server/index.js';
import { resolveConfig } from '../src/core/config.js';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const PERSIAN = 'حد ضرر را روی ۳۳۲۰ بگذار و بعد پوزیشن را ببند.';
const ENGLISH = 'Where should I move my stop-loss after the first target is hit?';
/** Persian prose with the product's own English term in it: more Persian letters than Latin ones. */
const MIXED_PERSIAN_HEAVY = `قیمت XAUUSD امروز 3345.20 دلار است و ${PERSIAN}`;
/** The reverse: a sentence of English with two Persian terms quoted inside it. */
const MIXED_LATIN_HEAVY = `${ENGLISH} میگوید «پوزیشن» و «حد ضرر»`;
const ASKS_ENGLISH = 'please reply in English: what is a stop-loss?';
const ASKS_PERSIAN = 'please reply in Persian: what is a stop-loss?';

const INSTRUCTIONS = renderInstructions(loadInstructions());

/** A store that is a `Map`, so a test can inspect exactly what was written. */
function fakeStorage(initial: Readonly<Record<string, string>> = {}): {
  store: PreferenceStorage;
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    store: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value);
      },
    },
  };
}

/** A history of `count` turns answered in `language`, recorded the way the store records them. */
function answered(count: number, language: ReplyLanguage): CommunicationObservations {
  let observations = emptyObservations();
  for (let index = 0; index < count; index += 1) {
    const context = communicationProfile(PERSIAN).context;
    observations = observeCommunication(context, observations, language);
  }
  return observations;
}

/** Every leaf of a value, with the path it sits at, so "all numbers" can be asserted. */
function leaves(value: unknown, path = '$'): readonly (readonly [string, unknown])[] {
  if (value === null || typeof value !== 'object') return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
}

const gatewayConfig: LlmGatewayConfig = {
  primary: { provider: 'openai', model: 'gpt-4o-mini', maxTokensPerRequest: 1_200 },
  fallbacks: [],
  requestTimeoutMs: 1_000,
  maxRetries: 0,
  retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
  monthlyBudgetUsd: 25,
};

const SCRIPTED_SUMMARY = JSON.stringify({
  headline: 'Answered.',
  statements: [{ kind: 'analysis', text: 'The answer.', sources: [] }],
  uncertainty: [],
  toolRequests: [],
});

/** A fake provider that records the request bodies it was sent. */
function recordingEndpoint(): { fetchImpl: FetchLike; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        model: 'gpt-4o-mini-2024-07-18',
        choices: [
          { message: { role: 'assistant', content: SCRIPTED_SUMMARY }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return { fetchImpl, calls };
}

function providerService(fetchImpl: FetchLike): AgentService {
  const gateway = new LlmGateway({
    providers: [
      openAiCompatibleProvider({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        models: ['gpt-4o-mini'],
        fetchImpl,
      }),
    ],
    config: gatewayConfig,
  });
  return new AgentService({
    instructions: loadInstructions(),
    memory: new InMemoryStore(),
    tools: defaultToolRegistry(),
    safety: DEFAULT_SAFETY_PROFILE,
    asyncModel: createLlmModelAdapter({ gateway }),
  });
}

/** The `system` and `user` messages of a built prompt. */
function messagesOf(text: string, responseLanguage?: 'fa' | 'en') {
  return buildTurnMessages({
    instructions: INSTRUCTIONS,
    sections: [
      section({ id: 'instructions', source: 'instructions', priority: 100, content: INSTRUCTIONS }),
    ],
    userInput: text,
    ...(responseLanguage === undefined ? {} : { responseLanguage }),
  });
}

/* -------------------------------------------------------------------------- */
/* Task 1 — the decision                                                       */
/* -------------------------------------------------------------------------- */

describe('the response language (Task 1)', () => {
  it('answers a Persian message in Persian and an English one in English', () => {
    for (const [text, language] of [
      [PERSIAN, 'fa'],
      ['قیمت طلا امروز چند است؟', 'fa'],
      [ENGLISH, 'en'],
      ['what is a drawdown?', 'en'],
    ] as const) {
      const control = responseControl(text);
      expect(control.reply.language, `${text.slice(0, 24)}…`).toBe(language);
      expect(control.reply.source).toBe('detected');
      expect(control.reply.overridden).toBe(false);
      // The guidance is for the language the answer is owed in, always: a response stage that applied
      // one and not the other would word a Persian answer in English.
      expect(control.guidance.language).toBe(control.reply.language);
    }
  });

  it('follows the larger script when a message mixes both', () => {
    const persianHeavy = responseControl(MIXED_PERSIAN_HEAVY);
    expect(persianHeavy.reply.language).toBe('fa');
    expect(persianHeavy.reply.reason).toContain('Persian half is larger');

    const latinHeavy = responseControl(MIXED_LATIN_HEAVY);
    expect(latinHeavy.reply.language).toBe('en');
    expect(latinHeavy.reply.reason).toContain('Latin half is larger');

    // A message with no letters at all is not a language: the product answers in its own, and says that
    // nothing was read rather than claiming a detection.
    const bare = responseControl('3345.20');
    expect(bare.reply.language).toBe('en');
    expect(bare.reply.source).toBe('default');
    expect(bare.observedSamples).toBe(0);
  });

  it('lets a request inside the message outrank every other signal', () => {
    // The request was made now, in words, for this turn: it outranks the stored choice *and* a habit.
    const overSetting = responseControl(ASKS_ENGLISH, { preference: 'fa' });
    expect(overSetting.reply).toMatchObject({
      language: 'en',
      source: 'requested',
      overridden: true,
    });
    expect(overSetting.reply.reason).toContain('outranks');

    const overHabit = responseControl(ASKS_ENGLISH, { observations: answered(8, 'fa') });
    expect(overHabit.reply).toMatchObject({ language: 'en', source: 'requested' });

    const overBoth = responseControl(ASKS_PERSIAN, {
      preference: 'en',
      observations: answered(8, 'en'),
    });
    expect(overBoth.reply).toMatchObject({
      language: 'fa',
      source: 'requested',
      overridden: true,
    });
  });

  it('lets the explicit choice outrank a habit and a reading', () => {
    const chosen = responseControl(ENGLISH, { preference: 'fa' });
    expect(chosen.reply).toMatchObject({
      language: 'fa',
      source: 'explicit',
      overridden: true,
    });

    // The switch is not overruled by the history it accumulated *while* it was set: a person who chose
    // Persian and is now answered in English by history would have had their setting quietly reversed.
    const chosenAgainstHistory = responseControl(ENGLISH, {
      preference: 'fa',
      observations: answered(10, 'en'),
    });
    expect(chosenAgainstHistory.reply).toMatchObject({ language: 'fa', source: 'explicit' });

    const agreeing = responseControl(PERSIAN, { preference: 'fa' });
    expect(agreeing.reply).toMatchObject({ language: 'fa', source: 'explicit', overridden: false });
  });

  it('lets a habit outrank one message, and records that it did', () => {
    const habit = responseControl(ENGLISH, { observations: answered(6, 'fa') });
    expect(habit.reply).toMatchObject({ language: 'fa', source: 'observed', overridden: true });
    // The evidence is stated, so a person can see why an English question was answered in Persian.
    expect(habit.reply.reason).toContain('6 of 6');
    expect(habit.reply.reason).toContain('habit');

    const agreeing = responseControl(PERSIAN, { observations: answered(6, 'fa') });
    expect(agreeing.reply).toMatchObject({ language: 'fa', source: 'observed', overridden: false });
    expect(agreeing.observedSamples).toBe(6);
  });

  it('refuses to call a thin or a tied history a habit', () => {
    // Below the minimum there is no evidence, so the reading of the message decides — the same rule the
    // register and detail dimensions already use, reused rather than restated.
    const thin = answered(4, 'fa');
    expect(learnedLanguage(thin)).toBeNull();
    expect(responseControl(ENGLISH, { observations: thin }).reply.source).toBe('detected');

    // A person whose turns go both ways has no habit, and picking the first value would be inventing one.
    const tie = mergeObservations(answered(5, 'fa'), answered(5, 'en'));
    expect(learnedLanguage(tie)).toBeNull();

    // Nothing learned at all, and a store that was never consulted, are the same answer.
    expect(learnedLanguage(null)).toBeNull();
    expect(learnedLanguage(emptyObservations())).toBeNull();
  });

  it('states the precedence once, in the order the phase names', () => {
    expect(REPLY_SOURCES).toEqual(['requested', 'explicit', 'observed', 'detected', 'default']);
    // The reply itself is still only ever one of two languages: a mix is a way of *writing*, not a way of
    // answering, and the resolution never returns one.
    for (const text of [PERSIAN, ENGLISH, MIXED_PERSIAN_HEAVY, MIXED_LATIN_HEAVY, '3345.20']) {
      expect(REPLY_LANGUAGES).toContain(responseControl(text).reply.language);
    }
  });

  it('hands the response stage one value, and nothing it could carry a figure in', () => {
    const control = responseControl(ENGLISH, { observations: answered(6, 'fa') });

    // One value, closed: the language, its guidance, the same decision in the shape the pipeline is handed
    // (`style`, added in 7.5.3.4.2), and how many turns informed it.
    expect(Object.keys(control).sort()).toEqual(
      ['guidance', 'observedSamples', 'reply', 'style', 'version'].sort(),
    );
    expect(Object.keys(control.reply).sort()).toEqual(
      ['language', 'overridden', 'reason', 'source'].sort(),
    );
    // The guidance is 7.5.3.2's own, unchanged in shape and still carrying the invariants it may not touch.
    expect(Object.keys(control.guidance).sort()).toEqual([...GUIDANCE_FIELDS].sort());
    expect(control.guidance.invariants).toEqual(GUIDANCE_INVARIANTS);
    // And the whole value names nothing about a person beyond a count of turns.
    const fields = leaves(control).map(([path]) => path.split('.').pop());
    for (const forbidden of ['name', 'email', 'userId', 'country', 'nativeLanguage']) {
      expect(fields, `the control has a field called ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('resolves the same turn the same way every time', () => {
    const options = { preference: 'auto', observations: answered(6, 'fa') } as const;
    expect(responseControl(MIXED_PERSIAN_HEAVY, options)).toEqual(
      responseControl(MIXED_PERSIAN_HEAVY, options),
    );
    // Two messages that read alike resolve alike, however far apart their subject matter is.
    const first = responseControl('قیمت طلا امروز چند است؟', options);
    const second = responseControl('پوزیشن من در ضرر است، چه کار کنم؟', options);
    expect(first.reply.language).toBe(second.reply.language);
    expect(first.reply.source).toBe(second.reply.source);
  });

  it('names the same two languages the pipeline contract names', () => {
    // Two layers, one vocabulary. The language layer reads messages; the shared contract is what crosses
    // the process boundary. Neither may gain a language the other has not heard of.
    expect([...REPLY_LANGUAGES]).toEqual([...RESPONSE_LANGUAGES]);
  });

  it('reads the choice and the history from where they are kept, and nowhere else', () => {
    const { store } = fakeStorage({
      'master-trade.language.preference': 'fa',
      'master-trade.language.observations': JSON.stringify(answered(6, 'fa')),
    });
    const stored = storedResponseOptions(store);
    expect(stored.preference).toBe('fa');
    expect(stored.observations?.languages.fa).toBe(6);
    expect(responseControl(ENGLISH, stored).reply.source).toBe('explicit');

    // A first run: nothing chosen, nothing learned, and no error on the way in.
    const empty = storedResponseOptions(fakeStorage().store);
    expect(empty).toEqual({ preference: 'auto', observations: null });
    expect(responseControl(ENGLISH, empty).reply.source).toBe('detected');
    expect(storedResponseOptions(null)).toEqual({ preference: 'auto', observations: null });
  });
});

/* -------------------------------------------------------------------------- */
/* The learned store, with the language dimension                              */
/* -------------------------------------------------------------------------- */

describe('the learned store (Task 1)', () => {
  it('counts the language each turn was answered in, and nothing else', () => {
    const observations = answered(3, 'fa');

    expect(observations.languages).toEqual({ fa: 3, en: 0 });
    expect(observations.samples).toBe(3);
    // Every leaf is still a number: a learned store that could hold a word from a message would be a
    // transcript, and this one is a count.
    for (const [path, value] of leaves(observations)) {
      expect(typeof value, `${path} is not a number`).toBe('number');
    }

    // A turn with no resolution to record leaves the language counts where they were rather than guessing.
    const silent = observeCommunication(communicationProfile(PERSIAN).context, observations);
    expect(silent.languages).toEqual({ fa: 3, en: 0 });
    expect(silent.samples).toBe(4);
  });

  it('persists, merges and decays the language counts with the rest', () => {
    const { store } = fakeStorage();
    const observations = answered(6, 'fa');
    expect(writeCommunicationObservations(observations, store)).toBe(true);
    expect(readCommunicationObservations(store).observations).toEqual(observations);

    const merged = mergeObservations(answered(2, 'fa'), answered(3, 'en'));
    expect(merged.languages).toEqual({ fa: 2, en: 3 });
    expect(merged.samples).toBe(5);

    // Past the window the counts halve, so a language from long ago cannot outlive the current one.
    const long = answered(60, 'fa');
    expect(long.samples).toBeLessThan(60);
    expect(long.languages.fa).toBe(long.samples);
  });

  it('reads a store written before the language dimension existed', () => {
    // The value a previous build wrote: no `languages` key at all. It degrades to zero counts rather than
    // becoming a fourth state the resolution has to have an opinion about.
    const older = parseObservations({
      samples: 9,
      formality: { formal: 4, informal: 2 },
      detail: { standard: 9 },
    });
    expect(older.samples).toBe(9);
    expect(older.languages).toEqual({ fa: 0, en: 0 });
    expect(learnedLanguage(older)).toBeNull();

    // And a value that is not a store at all is nothing learned, not a throw.
    expect(parseObservations({ samples: 'nonsense' })).toEqual(emptyObservations());
    expect(parseObservations({ languages: { fa: -3, en: 2.5, xx: 4 } }).languages).toEqual({
      fa: 0,
      en: 0,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Task 1 — the application                                                    */
/* -------------------------------------------------------------------------- */

describe('the pipeline applies the language it is handed (Task 1)', () => {
  it('states the language in the system message, and leaves the user turn alone', () => {
    for (const language of RESPONSE_LANGUAGES) {
      const [system, user] = messagesOf(PERSIAN, language);
      expect(system?.role).toBe('system');
      // The directive, the operating rules and the output contract all travel — the language block is an
      // addition, not a replacement for anything that was there.
      expect(system?.content).toContain(RESPONSE_LANGUAGE_DIRECTIVE[language]);
      expect(system?.content).toContain(DECISION_POLICY);
      expect(system?.content).toContain(OUTPUT_CONTRACT);
      expect(system?.content).toContain('core.safety @ 1.0.0');
      // What the person wrote is unchanged, and the instruction is not inside it: text a user can type
      // must not be where the answer's language is decided.
      expect(user?.content).toContain(PERSIAN);
      expect(user?.content).not.toContain(RESPONSE_LANGUAGE_DIRECTIVE[language]);
    }
  });

  it('changes the prompt only when a language was resolved', () => {
    const [system] = messagesOf(PERSIAN);
    expect(system?.content).toBe([INSTRUCTIONS, DECISION_POLICY, OUTPUT_CONTRACT].join('\n\n'));
    // The helper the synchronous path uses is the same rule: nothing resolved, the same bytes back.
    expect(withResponseDirectives(INSTRUCTIONS, {})).toBe(INSTRUCTIONS);
    expect(withResponseDirectives(INSTRUCTIONS, { responseLanguage: undefined })).toBe(
      INSTRUCTIONS,
    );
    expect(withResponseDirectives(INSTRUCTIONS, { responseLanguage: 'fa' })).toContain(
      RESPONSE_LANGUAGE_DIRECTIVE.fa,
    );
  });

  it('does not let the message choose the language the pipeline states', () => {
    // A prompt whose text asks for English, with nothing resolved, carries no directive at all: the
    // pipeline is *told* the language, and a sentence inside a message cannot move it.
    const [system] = messagesOf(ASKS_ENGLISH);
    expect(system?.content).not.toContain(RESPONSE_LANGUAGE_DIRECTIVE.en);
    expect(system?.content).not.toContain(RESPONSE_LANGUAGE_DIRECTIVE.fa);
  });

  it('carries the directive to the synchronous adapter in the text it receives', () => {
    const seen: { input: string; instructions: string }[] = [];
    const orchestrator = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory: new InMemoryStore(),
      safety: DEFAULT_SAFETY_PROFILE,
      model: {
        respond: (input: string, instructions: string): ModelStatement[] => {
          seen.push({ input, instructions });
          return [];
        },
      },
    });

    orchestrator.run(PERSIAN, { responseLanguage: 'fa' });
    orchestrator.run(PERSIAN);
    expect(seen[0]?.instructions).toBe(
      withResponseDirectives(INSTRUCTIONS, { responseLanguage: 'fa' }),
    );
    expect(seen[1]?.instructions).toBe(INSTRUCTIONS);
    // The message itself is never rewritten by the resolution: language analysis does not touch meaning.
    expect(seen[1]?.input).toBe(PERSIAN);
  });

  it('carries the directive into the provider prompt on the async path, and nothing else', async () => {
    const { fetchImpl, calls } = recordingEndpoint();
    const service = providerService(fetchImpl);

    const persian = await service.runAsync(PERSIAN, { responseLanguage: 'fa' });
    expect(persian.status).toBe('completed');
    const sent = JSON.stringify(calls[0]?.messages);
    expect(sent).toContain(RESPONSE_LANGUAGE_DIRECTIVE.fa);
    expect(sent).not.toContain(RESPONSE_LANGUAGE_DIRECTIVE.en);
    // The answer's content is untouched: same statements, same epistemic label, same tool executions.
    expect(persian.statements.map((statement) => statement.text)).toEqual(['The answer.']);
    expect(persian.epistemicKind).toBe('analysis');
    expect(persian.toolExecutions).toEqual([]);

    const bilingual = await service.runAsync(PERSIAN, { responseLanguage: 'en' });
    expect(bilingual.status).toBe('completed');
    expect(JSON.stringify(calls[1]?.messages)).toContain(RESPONSE_LANGUAGE_DIRECTIVE.en);

    const unstated = await service.runAsync(PERSIAN);
    expect(unstated.status).toBe('completed');
    const plain = JSON.stringify(calls[2]?.messages);
    expect(plain).not.toContain('RESPONSE_LANGUAGE');
  });

  it('cannot change what a refusal says', async () => {
    const { fetchImpl } = recordingEndpoint();
    const service = providerService(fetchImpl);
    // A turn whose inputs the gate refused never reaches a model, so the language has nothing to apply to
    // and the refusal is word for word what it was.
    const blocked = await service.runAsync(PERSIAN, {
      responseLanguage: 'fa',
      readiness: {
        analysisType: 'trade-review',
        readiness: 'BLOCKED',
        capability: 'available',
        limitations: ['The inputs are incomplete.'],
        clarifications: [],
        classification: 'insufficient',
        decidedBy: 'gate',
      } as never,
    });
    expect(blocked.status).toBe('blocked');
    expect(blocked.reason).toContain('The inputs are incomplete.');
  });

  it('echoes the language back on the route, and refuses one it does not know', async () => {
    const server = createServer({
      config: resolveConfig({}),
      sink: new MemoryLogSink(),
      now: () => Date.parse('2026-09-25T09:00:00.000Z'),
    });
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });
    const auth = { authorization: `Bearer ${student.token}` };

    const asked = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: auth,
      payload: { message: 'what is a stop-loss?', responseLanguage: 'fa' },
    });
    expect(asked.statusCode).toBe(200);
    // Echoed rather than derived: the server did not decide this, and it cannot — the signals behind it
    // are the caller's.
    expect(asked.json().data.responseLanguage).toBe('fa');

    const silent = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: auth,
      payload: { message: 'what is a stop-loss?' },
    });
    expect(silent.statusCode).toBe(200);
    expect(silent.json().data.responseLanguage).toBeUndefined();
    expect(silent.json().data.reply).toBe(asked.json().data.reply);

    const unknown = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: auth,
      payload: { message: 'what is a stop-loss?', responseLanguage: 'de' },
    });
    expect(unknown.statusCode).toBe(400);

    await server.close();
  });

  it('adds nothing to the shape a consumer of the reading already knows', () => {
    // The learned step is an *input* to the resolution, not a new thing about a person kept on the
    // reading: 7.5.3.1's profile has the same fields it had, and where the language came from is what
    // changed.
    const learned = answered(6, 'fa');
    const profile = languageProfile(PERSIAN, { learned: learnedLanguage(learned) });
    expect(Object.keys(profile).sort()).toEqual([...LANGUAGE_PROFILE_FIELDS].sort());
    expect(profile.reply).toMatchObject({ language: 'fa', source: 'observed', overridden: false });

    const control = responseControl(PERSIAN, { observations: learned });
    expect(control.reply.source).toBe('observed');
    expect(control.observedSamples).toBe(6);
  });
});
