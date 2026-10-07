/**
 * Decision Router foundation — taxonomy, schemas and safety rules for
 * Needle 3 as a lightweight local routing model (Phase 2.12-A).
 *
 * Needle 3's role is narrow and stated here so it cannot drift: it is
 * **not** the main reasoning model, it does **not** replace DeepSeek or
 * the cloud LLM Gateway, and it sits **before** expensive LLM calls as a
 * local decision maker. Its entire output is a machine-readable routing
 * decision — classify the request, pick one of five routes, report two
 * flags — and nothing else. It never writes conversational text, never
 * gives trading advice, never executes anything.
 *
 * This module is foundation only, per this phase:
 *
 *   1. **Intent taxonomy** — eight supported intents, each with its
 *      subcategories, closed by enumeration: a classifier cannot emit an
 *      intent outside this list.
 *   2. **Routing taxonomy** — five routes (`LOCAL_RESPONSE`,
 *      `MEMORY_RETRIEVAL`, `TOOL_REQUIRED`, `LLM_GATEWAY`, `BLOCK`),
 *      each with its meaning and the two flags it implies, plus the
 *      per-intent route guidance the dataset is validated against.
 *   3. **Decision output schema** — a strict, machine-consumption-only
 *      object: `intent`, `route`, `confidence`, `reason`,
 *      `requires_llm`, `requires_tool`. Unknown keys are rejected, the
 *      flags must agree with the route, and `reason` is bounded so the
 *      schema can never smuggle a prose answer past its contract.
 *   4. **Training example schema and JSONL validation** — the
 *      `training-data/decision-router.jsonl` record shape for the future
 *      Needle 3 LoRA fine-tuning (Phase 2.12-B), with a pure parser/
 *      validator that reports precise, line-numbered issues.
 *
 * What this module deliberately does **not** do, per this phase: it runs
 * no model, makes no decision at request time, wires into nothing. The
 * Agent Loop, the LLM Gateway, the response pipeline and every existing
 * system are untouched — routing is decided *before* the gateway is
 * reached, and this file only defines what that decision looks like.
 * There are no mock AI responses and no trading logic of any kind: the
 * dataset records classification labels, never answers.
 *
 * Safety rules (§5 of the phase scope) are encoded as data below and
 * enforced by construction: the schema has no field that can carry
 * advice or an execution, routes are the only legal outcomes, and a
 * tool route reaches tools only through the existing permission gate
 * this phase does not touch.
 */

import { z } from 'zod';

// ── 1. Intent taxonomy ─────────────────────────────────────────────────────

/**
 * The eight supported intents, closed by enumeration. Needle 3 classifies
 * into exactly these; an unknown intent at parse time is a validation
 * failure, never a new label invented on the fly.
 */
export const ROUTER_INTENTS = [
  'NON_TRADING',
  'TRADING_EDUCATION',
  'MARKET_ANALYSIS',
  'PORTFOLIO_ANALYSIS',
  'RISK_MANAGEMENT',
  'TRADE_JOURNAL',
  'MARKET_DATA_REQUEST',
  'SYSTEM_REQUEST',
] as const;

export type RouterIntent = (typeof ROUTER_INTENTS)[number];

/**
 * Each intent's subcategories — the vocabulary a labelled example is
 * understood under. Not emitted in the decision output: the decision
 * carries the intent, the subcategory is what the label *means*.
 */
export const INTENT_SUBCATEGORIES: Record<RouterIntent, readonly string[]> = {
  NON_TRADING: ['greetings', 'casual conversation', 'unrelated questions'],
  TRADING_EDUCATION: ['concepts', 'definitions', 'basic explanations'],
  MARKET_ANALYSIS: [
    'technical analysis',
    'price action',
    'order flow',
    'liquidity',
    'market structure',
  ],
  PORTFOLIO_ANALYSIS: ['allocation', 'portfolio decisions', 'risk exposure'],
  RISK_MANAGEMENT: ['position sizing', 'risk rules', 'drawdown questions'],
  TRADE_JOURNAL: ['reviewing previous trades', 'performance analysis'],
  MARKET_DATA_REQUEST: ['price data', 'external information', 'real-time data'],
  SYSTEM_REQUEST: ['AI Workplace configuration', 'settings', 'account actions'],
};

/** One sentence per intent: what it covers, so a label is never guessed. */
export const INTENT_MEANING: Record<RouterIntent, string> = {
  NON_TRADING: 'Greetings, casual conversation and questions unrelated to trading or the product.',
  TRADING_EDUCATION:
    'Trading concepts, definitions and basic explanations — learning, not analysis.',
  MARKET_ANALYSIS:
    'Analysis of the market itself: technical analysis, price action, order flow, liquidity and market structure.',
  PORTFOLIO_ANALYSIS:
    'Questions about a portfolio: its allocation, decisions about it, and the risk exposure it carries.',
  RISK_MANAGEMENT:
    'Risk discipline: position sizing, risk rules and drawdown questions — rules and math, not advice.',
  TRADE_JOURNAL:
    'Reviewing previously recorded trades and analyzing the performance they add up to.',
  MARKET_DATA_REQUEST:
    'Requests for data: prices, external information and real-time market facts, which only a tool can supply.',
  SYSTEM_REQUEST:
    'Requests about the AI Workplace itself: configuration, settings and account actions.',
};

// ── 2. Routing taxonomy ────────────────────────────────────────────────────

/**
 * The five allowed routes, closed by enumeration. A decision naming any
 * other route is refused by the schema.
 */
export const ROUTER_ROUTES = [
  /** Handled without any cloud LLM call. */
  'LOCAL_RESPONSE',
  /** Retrieve existing knowledge/context first. */
  'MEMORY_RETRIEVAL',
  /** Requires approved tool execution (through the existing gate). */
  'TOOL_REQUIRED',
  /** Requires DeepSeek/cloud reasoning through the existing LLM Gateway. */
  'LLM_GATEWAY',
  /** Rejected by policy before any call happens. */
  'BLOCK',
] as const;

export type RouterRoute = (typeof ROUTER_ROUTES)[number];

/** What each route means — the route vocabulary, in one place. */
export const ROUTE_MEANING: Record<RouterRoute, string> = {
  LOCAL_RESPONSE:
    'Handled locally without a cloud LLM call: a greeting, a settings answer, anything the product can say on its own.',
  MEMORY_RETRIEVAL:
    'Existing knowledge or stored context is retrieved first, so the answer draws on what the product already holds.',
  TOOL_REQUIRED:
    'Requires an approved tool execution through the Tool Registry and its permission gate — the only path that may fetch live data or compute a figure.',
  LLM_GATEWAY:
    'Requires cloud reasoning through the existing LLM Gateway: the request is answered by the main model, not by Needle 3.',
  BLOCK:
    'Rejected by policy before any call: the request is refused outright and nothing downstream runs.',
};

/**
 * The two flags each route implies. The decision schema enforces this
 * table, so `requires_llm` / `requires_tool` can never contradict the
 * route — they are a mechanical restatement of it, not an opinion.
 */
export const ROUTE_FLAGS: Record<RouterRoute, { requiresLlm: boolean; requiresTool: boolean }> = {
  LOCAL_RESPONSE: { requiresLlm: false, requiresTool: false },
  MEMORY_RETRIEVAL: { requiresLlm: false, requiresTool: false },
  TOOL_REQUIRED: { requiresLlm: false, requiresTool: true },
  LLM_GATEWAY: { requiresLlm: true, requiresTool: false },
  BLOCK: { requiresLlm: false, requiresTool: false },
};

/**
 * Which routes are expected for each intent — the routing guidance the
 * training dataset is validated against, and the baseline policy a
 * future runtime will read. `BLOCK` is deliberately absent from the
 * lists and handled by `isRouteAllowedForIntent` instead: policy can
 * reject a request under *any* intent, so block-reachability is
 * universal while the constructive routes stay per-intent.
 */
export const INTENT_ALLOWED_ROUTES: Record<RouterIntent, readonly RouterRoute[]> = {
  NON_TRADING: ['LOCAL_RESPONSE'],
  TRADING_EDUCATION: ['MEMORY_RETRIEVAL', 'LLM_GATEWAY'],
  MARKET_ANALYSIS: ['LLM_GATEWAY'],
  PORTFOLIO_ANALYSIS: ['TOOL_REQUIRED', 'LLM_GATEWAY'],
  RISK_MANAGEMENT: ['MEMORY_RETRIEVAL', 'TOOL_REQUIRED', 'LLM_GATEWAY'],
  TRADE_JOURNAL: ['MEMORY_RETRIEVAL', 'TOOL_REQUIRED'],
  MARKET_DATA_REQUEST: ['TOOL_REQUIRED'],
  SYSTEM_REQUEST: ['LOCAL_RESPONSE'],
};

/**
 * One rule, one place: is this route legal for this intent? `BLOCK` is
 * always legal (policy is orthogonal to the intent taxonomy); everything
 * else must be listed for the intent.
 */
export function isRouteAllowedForIntent(intent: RouterIntent, route: RouterRoute): boolean {
  return route === 'BLOCK' || INTENT_ALLOWED_ROUTES[intent].includes(route);
}

// ── 3. The decision output schema ──────────────────────────────────────────

/**
 * The strict machine-readable decision. Optimized for machine
 * consumption, not human conversation:
 *
 * - unknown keys are refused (`strictObject`) — a model that adds a
 *   field it invented did not follow the contract;
 * - `confidence` is an integer 0–100;
 * - `reason` is a short machine-oriented justification, bounded so the
 *   schema cannot carry a prose answer;
 * - `requires_llm` / `requires_tool` must equal the route's flags
 *   (`ROUTE_FLAGS`), so the two booleans cannot disagree with the route.
 *
 * There is intentionally no field for a user-facing reply anywhere in
 * this schema: the router decides the route, and only the route.
 */
export const routerDecisionSchema = z
  .strictObject({
    intent: z.enum(ROUTER_INTENTS),
    route: z.enum(ROUTER_ROUTES),
    confidence: z.number().int().min(0).max(100),
    reason: z.string().min(1).max(200),
    requires_llm: z.boolean(),
    requires_tool: z.boolean(),
  })
  .refine(
    (decision) => {
      const flags = ROUTE_FLAGS[decision.route];
      return (
        decision.requires_llm === flags.requiresLlm && decision.requires_tool === flags.requiresTool
      );
    },
    {
      message:
        'requires_llm / requires_tool must state exactly what the route implies (ROUTE_FLAGS)',
    },
  );

export type RouterDecision = z.infer<typeof routerDecisionSchema>;

/** The exact key set a decision may contain — asserted by tests and docs. */
export const ROUTER_DECISION_KEYS = [
  'intent',
  'route',
  'confidence',
  'reason',
  'requires_llm',
  'requires_tool',
] as const;

/** Result of parsing a model's raw output into a decision. */
export type RouterDecisionParse =
  { ok: true; decision: RouterDecision } | { ok: false; issues: readonly string[] };

/**
 * Parse raw model output (a JSON string, or an already-decoded value)
 * into a decision. Strict: anything the contract did not describe is an
 * issue, and issues are returned — never thrown — so a caller can refuse
 * the decision without the router ever being able to crash a request.
 */
export function parseRouterDecision(raw: string | unknown): RouterDecisionParse {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, issues: ['output is not valid JSON'] };
    }
  }
  const result = routerDecisionSchema.safeParse(value);
  if (result.success) return { ok: true, decision: result.data };
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`,
    ),
  };
}

// ── 4. Safety rules ────────────────────────────────────────────────────────

/**
 * The router's safety rules, as data so they can be asserted against
 * (§5 of the phase scope). The first four are properties of *what the
 * router is*: a classifier with a closed output schema and five routes.
 * The fifth is the whole job.
 */
export const DECISION_ROUTER_SAFETY_RULES = [
  'Never provide trading advice itself — the router classifies and routes; it answers nothing.',
  'Never execute trades — execution stays a human action through the existing approval workflow.',
  'Never bypass permission systems — a TOOL_REQUIRED route reaches tools only through the existing permission gate.',
  'Never call external tools or the LLM Gateway directly — the decision reports what is required, and a separate layer does it.',
  'Only decide the correct route — intent, route, confidence, reason and two flags, and nothing else.',
] as const;

// ── 5. Training examples (Phase 2.12-B's input) ────────────────────────────

/** The fixed instruction every record in the dataset carries. */
export const ROUTER_TRAINING_INSTRUCTION = 'Classify this user request';

/**
 * One record of `training-data/decision-router.jsonl`, in the exact
 * shape the phase specifies: `instruction`, `input`, and an `output`
 * carrying the three fields Needle 3 must learn to emit. Strict in both
 * objects — a record with an invented key or an unknown label is an
 * issue, not a silently accepted near-miss.
 */
export const routerTrainingExampleSchema = z.strictObject({
  instruction: z.literal(ROUTER_TRAINING_INSTRUCTION),
  input: z.string().min(1),
  output: z.strictObject({
    intent: z.enum(ROUTER_INTENTS),
    route: z.enum(ROUTER_ROUTES),
    requires_llm: z.boolean(),
  }),
});

export type RouterTrainingExample = z.infer<typeof routerTrainingExampleSchema>;

/** One validation failure in the JSONL, with the line it sits on. */
export interface RouterDatasetIssue {
  code:
    | 'empty-line'
    | 'invalid-json'
    | 'schema'
    | 'duplicate-input'
    | 'route-incoherent'
    | 'route-not-allowed';
  message: string;
  /** 1-based line number in the JSONL file. */
  line: number;
}

export interface RouterDatasetResult {
  /** True only when every line parsed, validated and passed coherence. */
  ok: boolean;
  issues: readonly RouterDatasetIssue[];
  /** Parsed examples from every valid line — present even when `ok` is false, for repair. */
  examples: readonly RouterTrainingExample[];
}

/**
 * Parse and validate the JSONL dataset. Pure: text in, typed records
 * and precise issues out — no filesystem, so the same function validates
 * a file on disk, a fetched artifact or a CI fixture.
 *
 * Beyond schema, two dataset-level rules are enforced here:
 *
 *   - **flag coherence** — `requires_llm` must be true exactly when the
 *     route is `LLM_GATEWAY` (the record schema has no `requires_tool`;
 *     the tool story is the route itself);
 *   - **route guidance** — the route must be legal for the intent
 *     (`isRouteAllowedForIntent`), so training data cannot teach a
 *     pairing the taxonomy does not sanction. `BLOCK` is legal under
 *     every intent.
 */
export function parseDecisionRouterJsonl(text: string): RouterDatasetResult {
  const issues: RouterDatasetIssue[] = [];
  const examples: RouterTrainingExample[] = [];
  const seenInputs = new Map<string, number>();

  const lines = text.split('\n');
  // A single trailing newline is the file's normal ending, not an entry.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === '') {
      issues.push({
        code: 'empty-line',
        message: 'blank line is not a JSONL entry',
        line: lineNumber,
      });
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      issues.push({ code: 'invalid-json', message: 'line is not valid JSON', line: lineNumber });
      return;
    }

    const parsed = routerTrainingExampleSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          code: 'schema',
          message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          line: lineNumber,
        });
      }
      return;
    }
    const example = parsed.data;

    const previousLine = seenInputs.get(example.input);
    if (previousLine !== undefined) {
      issues.push({
        code: 'duplicate-input',
        message: `same input as line ${previousLine}`,
        line: lineNumber,
      });
      return;
    }
    seenInputs.set(example.input, lineNumber);

    const expectedLlm = example.output.route === 'LLM_GATEWAY';
    if (example.output.requires_llm !== expectedLlm) {
      issues.push({
        code: 'route-incoherent',
        message: `requires_llm must be ${expectedLlm} for route ${example.output.route}`,
        line: lineNumber,
      });
      return;
    }

    if (!isRouteAllowedForIntent(example.output.intent, example.output.route)) {
      issues.push({
        code: 'route-not-allowed',
        message: `route ${example.output.route} is not expected for intent ${example.output.intent}`,
        line: lineNumber,
      });
      return;
    }

    examples.push(example);
  });

  return { ok: issues.length === 0, issues, examples };
}
