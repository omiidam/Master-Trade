/**
 * The deterministic routing policy (Phase 2.14).
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
  type ChatRoutingDecision,
  type DecisionCode,
} from './contract.js';
import { CactusNeedle3Classifier, type Needle3Classifier } from './needle3Adapter.js';

/** What the chat pipeline asks the layer for, and all it gets back. */
export interface ChatDecisionRouter {
  route(message: string): Promise<ChatRoutingDecision>;
}

/** The conservative fallback: the full pipeline, as before this layer existed. */
function fallbackDecision(code: DecisionCode, reason: string): ChatRoutingDecision {
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

/** The disabled decision: the router is off, the pipeline runs as it always did. */
function disabledDecision(): ChatRoutingDecision {
  const decision = fallbackDecision('ROUTER_DISABLED', 'The decision router is disabled.');
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

  return {
    async route(message: string): Promise<ChatRoutingDecision> {
      if (disabled) return disabledDecision();
      if (classifier === null) {
        return fallbackDecision(
          'NEEDLE3_NOT_CONFIGURED',
          'Needle 3 is enabled but no checkpoint is configured; the deterministic fallback routed the turn.',
        );
      }

      let classified: RouterDecision;
      try {
        classified = await classifier.classify({ message });
      } catch (error) {
        const name = (error as Error).name;
        if (name === 'Needle3TimeoutError') {
          return fallbackDecision(
            'NEEDLE3_TIMEOUT',
            'The Needle 3 classification did not answer in time; the deterministic fallback routed the turn.',
          );
        }
        if (name === 'Needle3InvalidOutputError') {
          return fallbackDecision(
            'NEEDLE3_INVALID_OUTPUT',
            'The Needle 3 output was not a valid decision; the deterministic fallback routed the turn.',
          );
        }
        return fallbackDecision(
          'NEEDLE3_UNAVAILABLE',
          'Needle 3 could not be executed; the deterministic fallback routed the turn.',
        );
      }

      if (!isRouteAllowedForIntent(classified.intent, classified.route)) {
        return fallbackDecision(
          'NEEDLE3_INCOHERENT_ROUTE',
          'The Needle 3 route was not legal for its intent; the deterministic fallback routed the turn.',
        );
      }
      // `BLOCK` is a taxonomy route, but refusing a request is the chat
      // policy's authority, not the router's: a BLOCK here is ignored and
      // the conservative fallback decides, visibly.
      if (classified.route === 'BLOCK') {
        return fallbackDecision(
          'NEEDLE3_BLOCK_NOT_AUTHORITATIVE',
          'Needle 3 proposed a block, which is not the router\u2019s authority; the deterministic fallback routed the turn.',
        );
      }
      if (classified.confidence < config.minConfidence) {
        return fallbackDecision(
          'NEEDLE3_LOW_CONFIDENCE',
          `Needle 3 confidence ${classified.confidence} is below the safety threshold ${config.minConfidence}; the deterministic fallback routed the turn.`,
        );
      }
      return classifiedDecision(classified);
    },
  };
}
