/**
 * Decision Router foundation (Phase 2.12-A) — the taxonomy, schemas and
 * training dataset Needle 3's Phase 2.12-B fine-tuning will build on.
 *
 * The tests hold what the foundation promises:
 *
 *   1. **Closed vocabularies.** Eight intents with their documented
 *      subcategories, five routes with documented meanings — nothing
 *      else classifies, and every flag follows its route.
 *   2. **A strict machine-only decision schema.** Unknown keys, unknown
 *      labels, out-of-range confidence and flag/route contradictions are
 *      refused; there is no field anywhere that can carry an answer.
 *   3. **The dataset is real and coherent.** The JSONL parses clean,
 *      covers every intent and every route, carries only the three
 *      specified output fields, and never routes a trade-execution or
 *      permission-bypass request anywhere but BLOCK.
 *   4. **Isolation.** The module reads from nothing it may not touch:
 *      no Agent Loop, no LLM Gateway, no response pipeline imports, and
 *      the safety rules say the five prohibitions out loud.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DECISION_ROUTER_SAFETY_RULES,
  INTENT_ALLOWED_ROUTES,
  INTENT_MEANING,
  INTENT_SUBCATEGORIES,
  ROUTE_FLAGS,
  ROUTE_MEANING,
  ROUTER_DECISION_KEYS,
  ROUTER_INTENTS,
  ROUTER_ROUTES,
  ROUTER_TRAINING_INSTRUCTION,
  isRouteAllowedForIntent,
  parseDecisionRouterJsonl,
  parseRouterDecision,
  routerDecisionSchema,
  routerTrainingExampleSchema,
} from '../src/training/index.js';

const DATASET_PATH = 'training-data/decision-router.jsonl';

const datasetText = readFileSync(DATASET_PATH, 'utf8');
const dataset = parseDecisionRouterJsonl(datasetText);

describe('the intent taxonomy', () => {
  it('names exactly the eight supported intents', () => {
    expect([...ROUTER_INTENTS]).toEqual([
      'NON_TRADING',
      'TRADING_EDUCATION',
      'MARKET_ANALYSIS',
      'PORTFOLIO_ANALYSIS',
      'RISK_MANAGEMENT',
      'TRADE_JOURNAL',
      'MARKET_DATA_REQUEST',
      'SYSTEM_REQUEST',
    ]);
  });

  it('gives every intent its documented subcategories and a meaningful description', () => {
    expect(INTENT_SUBCATEGORIES.NON_TRADING).toEqual([
      'greetings',
      'casual conversation',
      'unrelated questions',
    ]);
    expect(INTENT_SUBCATEGORIES.MARKET_ANALYSIS).toEqual([
      'technical analysis',
      'price action',
      'order flow',
      'liquidity',
      'market structure',
    ]);
    for (const intent of ROUTER_INTENTS) {
      expect(INTENT_SUBCATEGORIES[intent].length).toBeGreaterThan(0);
      expect(INTENT_ALLOWED_ROUTES[intent].length).toBeGreaterThan(0);
      expect(INTENT_MEANING[intent].length).toBeGreaterThan(40);
    }
  });
});

describe('the routing taxonomy', () => {
  it('names exactly the five allowed routes', () => {
    expect([...ROUTER_ROUTES]).toEqual([
      'LOCAL_RESPONSE',
      'MEMORY_RETRIEVAL',
      'TOOL_REQUIRED',
      'LLM_GATEWAY',
      'BLOCK',
    ]);
    for (const route of ROUTER_ROUTES) {
      expect(ROUTE_MEANING[route].length).toBeGreaterThan(40);
    }
  });

  it('ties both flags to the route, so they can never disagree with it', () => {
    expect(ROUTE_FLAGS.LOCAL_RESPONSE).toEqual({ requiresLlm: false, requiresTool: false });
    expect(ROUTE_FLAGS.MEMORY_RETRIEVAL).toEqual({ requiresLlm: false, requiresTool: false });
    expect(ROUTE_FLAGS.TOOL_REQUIRED).toEqual({ requiresLlm: false, requiresTool: true });
    expect(ROUTE_FLAGS.LLM_GATEWAY).toEqual({ requiresLlm: true, requiresTool: false });
    expect(ROUTE_FLAGS.BLOCK).toEqual({ requiresLlm: false, requiresTool: false });
  });

  it('keeps BLOCK reachable from every intent, and nothing else outside the guidance', () => {
    for (const intent of ROUTER_INTENTS) {
      expect(isRouteAllowedForIntent(intent, 'BLOCK')).toBe(true);
      for (const route of ROUTER_ROUTES) {
        const allowed = isRouteAllowedForIntent(intent, route);
        const listed = INTENT_ALLOWED_ROUTES[intent].includes(route);
        expect(allowed, `${intent} × ${route}`).toBe(route === 'BLOCK' || listed);
      }
    }
  });
});

describe('the decision output schema', () => {
  it('accepts a well-formed decision and nothing more than the six keys', () => {
    const parsed = parseRouterDecision({
      intent: 'MARKET_ANALYSIS',
      route: 'LLM_GATEWAY',
      confidence: 92,
      reason: 'advanced analysis needs cloud reasoning',
      requires_llm: true,
      requires_tool: false,
    });
    expect(parsed.ok).toBe(true);
    expect(ROUTER_DECISION_KEYS).toEqual([
      'intent',
      'route',
      'confidence',
      'reason',
      'requires_llm',
      'requires_tool',
    ]);
  });

  it('refuses an invented key rather than ignoring it', () => {
    const parsed = parseRouterDecision({
      intent: 'NON_TRADING',
      route: 'LOCAL_RESPONSE',
      confidence: 90,
      reason: 'a greeting',
      requires_llm: false,
      requires_tool: false,
      answer: 'Hi! How can I help you today?',
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.join(' ')).toMatch(/answer/);
    }
  });

  it('refuses unknown labels, out-of-range confidence and empty reasons', () => {
    const base = {
      route: 'LOCAL_RESPONSE',
      confidence: 90,
      reason: 'fine',
      requires_llm: false,
      requires_tool: false,
    };
    expect(parseRouterDecision({ ...base, intent: 'SMUGGLING' }).ok, 'unknown intent').toBe(false);
    expect(
      parseRouterDecision({ ...base, intent: 'NON_TRADING', route: 'MAYBE' }).ok,
      'unknown route',
    ).toBe(false);
    expect(
      parseRouterDecision({ ...base, intent: 'NON_TRADING', confidence: 101 }).ok,
      'confidence above 100',
    ).toBe(false);
    expect(
      parseRouterDecision({ ...base, intent: 'NON_TRADING', confidence: 12.5 }).ok,
      'non-integer confidence',
    ).toBe(false);
    expect(
      parseRouterDecision({ ...base, intent: 'NON_TRADING', reason: '' }).ok,
      'empty reason',
    ).toBe(false);
  });

  it('refuses flags that contradict the route', () => {
    const wrong = routerDecisionSchema.safeParse({
      intent: 'MARKET_DATA_REQUEST',
      route: 'TOOL_REQUIRED',
      confidence: 80,
      reason: 'price data needs a tool',
      requires_llm: true,
      requires_tool: false,
    });
    expect(wrong.success).toBe(false);
  });

  it('returns issues instead of throwing on non-JSON model output', () => {
    const parsed = parseRouterDecision('certainly! here is my classification:');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues[0]).toMatch(/not valid JSON/);
  });
});

describe('the safety rules are stated, and the schema cannot break them', () => {
  it('carries all five prohibitions as data', () => {
    expect(DECISION_ROUTER_SAFETY_RULES).toHaveLength(5);
    expect(DECISION_ROUTER_SAFETY_RULES[0]).toMatch(/never provide trading advice/i);
    expect(DECISION_ROUTER_SAFETY_RULES[1]).toMatch(/never execute trades/i);
    expect(DECISION_ROUTER_SAFETY_RULES[2]).toMatch(/never bypass permission/i);
    expect(DECISION_ROUTER_SAFETY_RULES[3]).toMatch(/never call external tools/i);
    expect(DECISION_ROUTER_SAFETY_RULES[4]).toMatch(/only decide the correct route/i);
  });

  it('has no field anywhere that can carry advice or an execution', () => {
    // The decision's six keys are exactly the spec's; `reason` is the
    // only prose and the schema bounds it below any useful payload.
    expect(ROUTER_DECISION_KEYS).not.toContain('reply');
    expect(ROUTER_DECISION_KEYS).not.toContain('answer');
    expect(ROUTER_DECISION_KEYS).not.toContain('action');
    const long = routerDecisionSchema.safeParse({
      intent: 'NON_TRADING',
      route: 'LOCAL_RESPONSE',
      confidence: 90,
      reason: 'x'.repeat(201),
      requires_llm: false,
      requires_tool: false,
    });
    expect(long.success).toBe(false);
  });
});

describe('the training dataset foundation', () => {
  it('parses the committed JSONL with no issues', () => {
    expect(dataset.issues, JSON.stringify(dataset.issues, null, 2)).toEqual([]);
    expect(dataset.ok).toBe(true);
    expect(dataset.examples.length).toBeGreaterThanOrEqual(24);
  });

  it('gives every record the exact instruction and the three specified output fields', () => {
    for (const example of dataset.examples) {
      expect(example.instruction).toBe(ROUTER_TRAINING_INSTRUCTION);
      expect(Object.keys(example.output).sort()).toEqual(['intent', 'requires_llm', 'route']);
      const revalidated = routerTrainingExampleSchema.safeParse(example);
      expect(revalidated.success).toBe(true);
    }
  });

  it('covers every intent and every route at least once', () => {
    const intents = new Set(dataset.examples.map((example) => example.output.intent));
    const routes = new Set(dataset.examples.map((example) => example.output.route));
    for (const intent of ROUTER_INTENTS) expect(intents, `missing ${intent}`).toContain(intent);
    for (const route of ROUTER_ROUTES) expect(routes, `missing ${route}`).toContain(route);
  });

  it('covers the eight categories the first dataset was promised to cover', () => {
    const text = dataset.examples
      .map((example) => example.input)
      .join('\n')
      .toLowerCase();
    // greetings, irrelevant questions, basic education, advanced analysis,
    // market data, portfolio, risk, tool-backed requests.
    for (const marker of [
      'hi there',
      'capital of australia',
      'doji candlestick',
      'market structure',
      'current price of bitcoin',
      'portfolio allocated',
      'position size',
      'win rate',
    ]) {
      expect(text, `dataset is missing a "${marker}" example`).toContain(marker);
    }
  });

  it('routes requires_llm true for exactly the LLM_GATEWAY records', () => {
    for (const example of dataset.examples) {
      expect(example.output.requires_llm).toBe(example.output.route === 'LLM_GATEWAY');
    }
  });

  it('never routes a trade-execution or permission-bypass request anywhere but BLOCK', () => {
    const dangerous = /place an order|execute this strategy|hidden admin tools/i;
    const violations = dataset.examples.filter(
      (example) => dangerous.test(example.input) && example.output.route !== 'BLOCK',
    );
    expect(violations).toEqual([]);
    const blocked = dataset.examples.filter((example) => example.output.route === 'BLOCK');
    expect(blocked.length).toBeGreaterThanOrEqual(3);
  });

  it('reports line-numbered issues instead of silently accepting a broken record', () => {
    const good =
      '{"instruction":"Classify this user request","input":"hello","output":{"intent":"NON_TRADING","route":"LOCAL_RESPONSE","requires_llm":false}}';
    const blank = parseDecisionRouterJsonl(`${good}\n\n${good.replace('hello', 'hi')}`);
    expect(blank.ok).toBe(false);
    expect(blank.issues[0]).toMatchObject({ code: 'empty-line', line: 2 });

    const badIntent = parseDecisionRouterJsonl(good.replace('"NON_TRADING"', '"TOTALLY_A_LABEL"'));
    expect(badIntent.ok).toBe(false);
    expect(badIntent.issues[0]).toMatchObject({ code: 'schema', line: 1 });

    const duplicate = parseDecisionRouterJsonl(`${good}\n${good}`);
    expect(duplicate.issues[0]).toMatchObject({ code: 'duplicate-input', line: 2 });

    const incoherent = parseDecisionRouterJsonl(
      good.replace('"route":"LOCAL_RESPONSE"', '"route":"LLM_GATEWAY"'),
    );
    expect(incoherent.issues[0]).toMatchObject({ code: 'route-incoherent', line: 1 });

    const misrouted = parseDecisionRouterJsonl(
      good.replace('"NON_TRADING"', '"MARKET_DATA_REQUEST"'),
    );
    expect(misrouted.issues[0]).toMatchObject({ code: 'route-not-allowed', line: 1 });

    const brokenJson = parseDecisionRouterJsonl('{not json}');
    expect(brokenJson.issues[0]).toMatchObject({ code: 'invalid-json', line: 1 });
  });
});

describe('the foundation is isolated from the systems it must not touch', () => {
  it('imports nothing from the Agent Loop, LLM Gateway or response pipeline', () => {
    const source = readFileSync('src/training/decisionRouter.ts', 'utf8');
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
    for (const spec of imports) {
      expect(spec, `decisionRouter must not import ${spec}`).not.toMatch(
        /agent|provider|gateway|responsePipeline|server/,
      );
    }
    expect(imports).toEqual(['zod']);
  });

  it('defines the router as taxonomy and schemas only — no execution, no model, no mock', () => {
    const source = readFileSync('src/training/decisionRouter.ts', 'utf8');
    // Foundation-only guard: nothing here may run a model or fabricate a response.
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/class\s+\w+Model/);
    expect(source).not.toMatch(/mockReply|fakeResponse|simulatedAnswer/);
  });
});
