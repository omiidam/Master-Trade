/**
 * The deterministic routing policy (Phase 2.14, hardened by Phase 2.14.C).
 *
 * Needle 3 classifies; this policy decides. Everything after the classifier
 * is closed, typed and testable:
 *
 *   1. **Disabled** — `MASTER_TRADE_DECISION_ROUTER=off` or
 *      `NEEDLE3_ENABLED=false`: no model is consulted, and the decision
 *      says so (`source: 'disabled'`, `ROUTER_DISABLED`).
 *   2. **Not configured** — Needle 3 mode without a checkpoint path: the
 *      deterministic fallback routes, visibly (`NEEDLE3_NOT_CONFIGURED`).
 *   3. **Classified** — the classifier answered: its decision is accepted
 *      only when the route is legal for the intent
 *      (`isRouteAllowedForIntent`), the route is not `BLOCK` (the router is
 *      never authoritative for refusals — the chat policy owns those), and
 *      the confidence is at or above the configured safety threshold.
 *   4. **Fail closed** — every other shape (unavailable, timeout, malformed
 *      output, incoherent route, `BLOCK`, low confidence) routes through the
 *      same deterministic fallback: the full existing pipeline (Agent
 *      Runtime → Agent Loop → LLM Gateway), which is exactly what ran
 *      before this layer existed. A fallback is therefore never a quality
 *      regression and never a silent bypass — it is visible in the decision
 *      (`source: 'fallback'`, a specific `code`, confidence 0) and it
 *      reaches the turn through every gate that already exists.
 *
 * The policy never grants a permission, never authorizes a tool, never
 * touches financial risk and never executes anything: its only output is
 * which of the two existing execution paths a turn takes.
 *
 * Phase 2.14.C adds the fail-safe shell around all of it, so Needle 3 can
 * never be a single point of failure for a chat turn:
 *
 *   - `route()` is **total**: an unexpected exception anywhere in the layer
 *     (a classifier that resolves a malformed value, an intent outside the
 *     closed taxonomy, a non-numeric confidence) is caught here and turned
 *     into the same visible fallback — it never propagates to `agent.chat`;
 *   - the classification runs under the policy's own wall-clock deadline in
 *     addition to the adapter's subprocess timeout, so a runner that ignores
 *     its own budget cannot hold a turn open;
 *   - `routeChatTurn` is the seam `agent.chat` calls: it wraps `route()`,
 *     guarantees a decision even when an *injected* router throws, and emits
 *     the turn's structured router trace (`decision.router.started`,
 *     `decision.router.completed`, `decision.router.failed`,
 *     `fallback.triggered`) — bounded codes and an error's *name* only, never
 *     a path, a file, a raw completion or a secret.
 */

import type { DecisionRouterConfig } from '../../core/config.js';
import {
  isRouteAllowedForIntent,
  ROUTE_FLAGS,
  type RouterDecision,
} from '../../training/decisionRouter.js';
import {
  boundReason,
  deriveDecisionFields,
  isKnownIntent,
  isKnownRoute,
  type ChatRoutingDecision,
  type DecisionCode,
} from './contract.js';
import {
  CactusNeedle3Classifier,
  Needle3TimeoutError,
  type Needle3Classifier,
} from './needle3Adapter.js';

/** What the chat pipeline asks the layer for, and all it gets back. */
export interface ChatDecisionRouter {
  route(message: string): Promise<ChatRoutingDecision>;
}

/** The conservative fallback: the full pipeline, as before this layer existed. */
export function fallbackRouteDecision(code: DecisionCode, reason: string): ChatRoutingDecision {
  const route = 'LLM_GATEWAY' as const;
  return {
    domain: 'unknown',
    intent: 'UNCLASSIFIED',
    complexity: 'complex',
    requires_cloud_llm: ROUTE_FLAGS[route].requiresLlm,
    confidence: 0,
    route,
    executionPath: 'LLM_GATEWAY',
    source: 'fallback',
    code,
    reason: boundReason(reason),
  };
}

/**
 * The codes that mean Needle 3 *was consulted and could not decide* — distinct
 * from the two configuration states (`ROUTER_DISABLED`, `NEEDLE3_NOT_CONFIGURED`),
 * which are deliberate settings rather than failures. `routeChatTurn` uses this
 * to decide whether a routed turn's trace carries a `decision.router.failed`
 * line.
 */
export const NEEDLE3_FAILURE_CODES: readonly DecisionCode[] = [
  'NEEDLE3_UNAVAILABLE',
  'NEEDLE3_TIMEOUT',
  'NEEDLE3_INVALID_OUTPUT',
  'NEEDLE3_INCOHERENT_ROUTE',
  'NEEDLE3_BLOCK_NOT_AUTHORITATIVE',
  'NEEDLE3_LOW_CONFIDENCE',
];

/** The disabled decision: the router is off, the pipeline runs as it always did. */
function disabledDecision(): ChatRoutingDecision {
  const decision = fallbackRouteDecision('ROUTER_DISABLED', 'The decision router is disabled.');
  return { ...decision, source: 'disabled' as const };
}

/** Turn a valid classification into the runtime decision, mechanically. */
function classifiedDecision(classified: RouterDecision): ChatRoutingDecision {
  return {
    ...deriveDecisionFields(classified.intent, classified.route),
    intent: classified.intent,
    confidence: classified.confidence,
    route: classified.route,
    source: 'needle3',
    code: 'NEEDLE3_CLASSIFIED',
    reason: boundReason(classified.reason),
  };
}

/**
 * Grace on top of the adapter's own budget. The adapter already hands its
 * timeout to the subprocess, so that typed timeout normally fires first; this
 * deadline is the policy's last-resort backstop for a runner that ignores it.
 */
const DEADLINE_GRACE_MS = 1_000;

/**
 * Run one classification under the policy's own wall-clock deadline.
 *
 * A promise that settles after the deadline has already been handled by
 * `Promise.race` (the race attaches the rejection handler), so a late failure
 * is not an unhandled rejection.
 */
async function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Needle3TimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * The slice of the shared `Logger` this layer uses.
 *
 * Structural rather than imported, so the router module depends on no server
 * type: the server's `Logger` satisfies it as-is, and a test can pass a
 * two-line stub.
 */
export interface DecisionRouterLogger {
  info(message: string, data?: Record<string, unknown>, event?: string): void;
  warn(message: string, data?: Record<string, unknown>, event?: string): void;
  error(message: string, data?: Record<string, unknown>, event?: string): void;
}

/** The error's *name* only: a message can carry a path or a provider detail, and a trace must not. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

export interface ChatDecisionRouterOptions {
  /** Injection point for tests; defaults to the real local Cactus adapter. */
  classifier?: Needle3Classifier;
}

export function createChatDecisionRouter(
  config: DecisionRouterConfig,
  options: ChatDecisionRouterOptions = {},
): ChatDecisionRouter {
  const disabled = config.mode === 'off' || !config.enabled;
  const classifier: Needle3Classifier | null =
    options.classifier ??
    (config.checkpointPath === null || disabled
      ? null
      : new CactusNeedle3Classifier({
          checkpointPath: config.checkpointPath,
          ...(config.cliPath === null ? {} : { cliPath: config.cliPath }),
          timeoutMs: config.timeoutMs,
        }));

  /** The classification and policy, exactly as Phase 2.14 defined them. */
  async function routeOnce(message: string): Promise<ChatRoutingDecision> {
    if (disabled) return disabledDecision();
    if (classifier === null) {
      return fallbackRouteDecision(
        'NEEDLE3_NOT_CONFIGURED',
        'Needle 3 is enabled but no checkpoint is configured; the deterministic fallback routed the turn.',
      );
    }

    let classified: RouterDecision;
    try {
      const classification = classifier.classify({ message });
      classified = await withDeadline(classification, config.timeoutMs + DEADLINE_GRACE_MS);
    } catch (error) {
      const name = (error as Error).name;
      if (name === 'Needle3TimeoutError') {
        return fallbackRouteDecision(
          'NEEDLE3_TIMEOUT',
          'The Needle 3 classification did not answer in time; the deterministic fallback routed the turn.',
        );
      }
      if (name === 'Needle3InvalidOutputError') {
        return fallbackRouteDecision(
          'NEEDLE3_INVALID_OUTPUT',
          'The Needle 3 output was not a valid decision; the deterministic fallback routed the turn.',
        );
      }
      return fallbackRouteDecision(
        'NEEDLE3_UNAVAILABLE',
        'Needle 3 could not be executed; the deterministic fallback routed the turn.',
      );
    }

    // The shape guard: a classifier that answered with something outside the
    // closed vocabulary is a malformed decision, not a route. Without this,
    // `INTENT_ALLOWED_ROUTES[intent]` would throw and `boundReason` would read
    // a non-string — either of which used to be able to fail the whole turn.
    if (
      typeof classified !== 'object' ||
      classified === null ||
      !isKnownIntent(classified.intent) ||
      !isKnownRoute(classified.route) ||
      typeof classified.confidence !== 'number'
    ) {
      return fallbackRouteDecision(
        'NEEDLE3_INVALID_OUTPUT',
        'The Needle 3 decision named an intent, route or confidence outside the closed contract; the deterministic fallback routed the turn.',
      );
    }

    if (!isRouteAllowedForIntent(classified.intent, classified.route)) {
      return fallbackRouteDecision(
        'NEEDLE3_INCOHERENT_ROUTE',
        'The Needle 3 route was not legal for its intent; the deterministic fallback routed the turn.',
      );
    }
    // `BLOCK` is a taxonomy route, but refusing a request is the chat
    // policy's authority, not the router's: a BLOCK here is ignored and
    // the conservative fallback decides, visibly.
    if (classified.route === 'BLOCK') {
      return fallbackRouteDecision(
        'NEEDLE3_BLOCK_NOT_AUTHORITATIVE',
        'Needle 3 proposed a block, which is not the router\u2019s authority; the deterministic fallback routed the turn.',
      );
    }
    if (classified.confidence < config.minConfidence) {
      return fallbackRouteDecision(
        'NEEDLE3_LOW_CONFIDENCE',
        `Needle 3 confidence ${classified.confidence} is below the safety threshold ${config.minConfidence}; the deterministic fallback routed the turn.`,
      );
    }
    return classifiedDecision(classified);
  }

  return {
    async route(message: string): Promise<ChatRoutingDecision> {
      try {
        return await routeOnce(message);
      } catch (error) {
        // Total by construction (Phase 2.14.C): whatever a classifier, a runner
        // or a future adapter threw, the turn goes on through the fallback path
        // instead of failing the chat. The name is the only detail carried out.
        return fallbackRouteDecision(
          'NEEDLE3_UNAVAILABLE',
          `The decision router failed unexpectedly (${errorName(error)}); the deterministic fallback routed the turn.`,
        );
      }
    },
  };
}

/**
 * Route one chat turn, and never let the router's failure reach the chat
 * (Phase 2.14.C). This is the seam `agent.chat` calls.
 *
 * `router.route()` is already total for the router this module builds, but the
 * handler can be handed *any* router (tests inject one at the boundary, and a
 * future implementation may differ), so the guarantee has to hold here too:
 * whatever the router does — reject, or throw synchronously — this resolves
 * with a visible fallback decision that sends the turn down the full existing
 * pipeline. The turn cannot be failed by its decision layer.
 *
 * The trace is emitted here, where the turn and its correlation id are known:
 * one `decision.router.started`, then `decision.router.completed` with the
 * decision's safe fields, plus `decision.router.failed` when Needle 3 could
 * not decide and `fallback.triggered` whenever the turn takes the fallback
 * path. Nothing logged names a path, a file, a raw completion or a secret.
 */
export async function routeChatTurn(
  router: ChatDecisionRouter,
  message: string,
  logger?: DecisionRouterLogger,
): Promise<ChatRoutingDecision> {
  logger?.info(
    'the decision router is classifying the turn',
    { layer: 'needle3' },
    'decision.router.started',
  );

  let decision: ChatRoutingDecision;
  try {
    decision = await router.route(message);
  } catch (error) {
    const code: DecisionCode = 'NEEDLE3_UNAVAILABLE';
    logger?.error(
      'the decision router threw; the deterministic fallback routed the turn',
      { code, error: errorName(error) },
      'decision.router.failed',
    );
    logger?.warn(
      'a routing fallback was triggered',
      { source: 'fallback', code, executionPath: 'LLM_GATEWAY' },
      'fallback.triggered',
    );
    return fallbackRouteDecision(
      code,
      'The decision router could not be consulted; the deterministic fallback routed the turn.',
    );
  }

  logger?.info(
    'the decision router returned a decision',
    {
      source: decision.source,
      code: decision.code,
      intent: decision.intent,
      route: decision.route,
      executionPath: decision.executionPath,
      complexity: decision.complexity,
      confidence: decision.confidence,
    },
    'decision.router.completed',
  );

  if (NEEDLE3_FAILURE_CODES.includes(decision.code)) {
    logger?.error(
      'Needle 3 did not classify the turn; the deterministic fallback routed it',
      { source: decision.source, code: decision.code },
      'decision.router.failed',
    );
  }
  if (decision.source === 'fallback') {
    logger?.warn(
      'a routing fallback was triggered',
      { source: decision.source, code: decision.code, executionPath: decision.executionPath },
      'fallback.triggered',
    );
  }

  return decision;
}
