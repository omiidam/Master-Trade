/**
 * The chat decision-router contract (Phase 2.14, Needle 3 runtime integration).
 *
 * Phase 2.12-A defined what a Needle 3 decision *looks like*
 * (`src/training/decisionRouter.ts` — eight intents, five routes, a strict
 * six-field schema). This module defines what the *runtime* does with one:
 * a typed decision the chat pipeline can act on and the AI Workplace can
 * display, without ever exposing the model's path, its files or a secret.
 *
 * The layering rule this contract exists to keep:
 *
 *   User → Chat API → **Needle 3 → deterministic routing policy** →
 *     local path  (no hosted model consulted), or
 *     existing Agent Runtime → Agent Loop → LLM Gateway → response.
 *
 * Needle 3 classifies; the deterministic policy decides. The classifier's
 * output is never authoritative for permissions, financial risk, tool
 * authorization or execution — those stay exactly where they were, and the
 * policy can only ever choose between "answer locally" and "run the full
 * existing pipeline". Every failure shape (unavailable, timeout, malformed
 * output, incoherent route, confidence below the safety threshold) fails
 * closed into that same deterministic fallback, visibly (`source`, `code`)
 * rather than silently.
 */

import {
  ROUTE_FLAGS,
  ROUTER_INTENTS,
  ROUTER_ROUTES,
  type RouterIntent,
  type RouterRoute,
} from '../../training/decisionRouter.js';

/** Where a classified request belongs, in the product's own vocabulary. */
export type DecisionDomain = 'trading' | 'general' | 'system' | 'unknown';

/**
 * How demanding the request is, decided mechanically from the classified
 * route — never an opinion the router invents: a route the runtime can
 * serve locally is `simple`, everything else is `complex`.
 */
export type DecisionComplexity = 'simple' | 'complex';

/**
 * The intent a decision carries. `UNCLASSIFIED` is a runtime-only value for
 * the deterministic fallback: no classifier produced a usable intent, and
 * the fallback policy routed conservatively instead of guessing one. The
 * closed eight-intent taxonomy itself is unchanged.
 */
export type DecisionIntent = RouterIntent | 'UNCLASSIFIED';

/** The two execution paths that exist in the chat pipeline today. */
export type DecisionExecutionPath = 'LOCAL_RESPONSE' | 'LLM_GATEWAY';

/** Which layer produced the decision, reported so a fallback is never silent. */
export type DecisionSource = 'needle3' | 'fallback' | 'disabled';

/**
 * Bounded machine codes for how a decision was reached. These travel to the
 * surface (and to tests) as the safe statement of *why* a turn was routed
 * the way it was; the classifier's model path, its files and every secret
 * stay server-side.
 */
export const DECISION_CODES = [
  /** A classified decision was used as-is. */
  'NEEDLE3_CLASSIFIED',
  /** The router is switched off (`MASTER_TRADE_DECISION_ROUTER=off` / `NEEDLE3_ENABLED=false`). */
  'ROUTER_DISABLED',
  /** Needle 3 mode is active but no checkpoint is configured. */
  'NEEDLE3_NOT_CONFIGURED',
  /** The classifier or its checkpoint could not be executed. */
  'NEEDLE3_UNAVAILABLE',
  /** The classification did not answer within the configured budget. */
  'NEEDLE3_TIMEOUT',
  /** The classifier's output was not a valid decision under the strict contract. */
  'NEEDLE3_INVALID_OUTPUT',
  /** The classifier's route is not legal for its intent (taxonomy violation). */
  'NEEDLE3_INCOHERENT_ROUTE',
  /** The classifier proposed `BLOCK`, which the router is not authoritative to apply. */
  'NEEDLE3_BLOCK_NOT_AUTHORITATIVE',
  /** The classification arrived, but below the configured safety threshold. */
  'NEEDLE3_LOW_CONFIDENCE',
] as const;

export type DecisionCode = (typeof DECISION_CODES)[number];

/**
 * The runtime routing decision — the full, machine-readable verdict the
 * chat pipeline acts on and the AI Workplace displays. Every field is safe
 * to show: a bounded reason, a closed vocabulary, and nothing that names a
 * path, a file or a credential.
 */
export interface ChatRoutingDecision {
  /** Where the request belongs (derived mechanically from the intent). */
  domain: DecisionDomain;
  /** The classified intent, or `UNCLASSIFIED` when only the fallback spoke. */
  intent: DecisionIntent;
  /** `simple` when the route can be served locally, `complex` otherwise. */
  complexity: DecisionComplexity;
  /** Whether the route requires a hosted model (mechanically from the route). */
  requires_cloud_llm: boolean;
  /** The classifier's confidence, 0–100 (0 when no classifier spoke). */
  confidence: number;
  /** The taxonomy route the decision selected. */
  route: RouterRoute;
  /** The execution path the policy selected for this decision. */
  executionPath: DecisionExecutionPath;
  /** Which layer produced the decision. */
  source: DecisionSource;
  /** Bounded machine code for how the decision was reached. */
  code: DecisionCode;
  /** One bounded, safe sentence on why. */
  reason: string;
}

/** The exact key set a decision carries — asserted by tests and the API contract. */
export const CHAT_DECISION_KEYS = [
  'domain',
  'intent',
  'complexity',
  'requires_cloud_llm',
  'confidence',
  'route',
  'executionPath',
  'source',
  'code',
  'reason',
] as const;

/** The domain each intent belongs to, derived mechanically — never guessed. */
export function domainForIntent(intent: DecisionIntent): DecisionDomain {
  if (intent === 'NON_TRADING') return 'general';
  if (intent === 'SYSTEM_REQUEST') return 'system';
  if (intent === 'UNCLASSIFIED') return 'unknown';
  return 'trading';
}

/** The execution path a taxonomy route maps to, for the runtime that exists today. */
export function executionPathForRoute(route: RouterRoute): DecisionExecutionPath {
  return route === 'LOCAL_RESPONSE' ? 'LOCAL_RESPONSE' : 'LLM_GATEWAY';
}

/** Build the decision's mechanical fields from an intent and its route — never guessed. */
export function deriveDecisionFields(
  intent: DecisionIntent,
  route: RouterRoute,
): {
  domain: DecisionDomain;
  complexity: DecisionComplexity;
  requires_cloud_llm: boolean;
  executionPath: DecisionExecutionPath;
} {
  return {
    domain: domainForIntent(intent),
    complexity: route === 'LOCAL_RESPONSE' ? 'simple' : 'complex',
    requires_cloud_llm: ROUTE_FLAGS[route].requiresLlm,
    executionPath: executionPathForRoute(route),
  };
}

/** Closed guard so a decision can never carry a route or intent outside the vocabularies. */
export function isKnownIntent(intent: string): intent is RouterIntent {
  return (ROUTER_INTENTS as readonly string[]).includes(intent);
}

export function isKnownRoute(route: string): route is RouterRoute {
  return (ROUTER_ROUTES as readonly string[]).includes(route);
}

/** Bounded reason: the contract caps it where the taxonomy caps the classifier's own. */
export function boundReason(reason: string, max = 200): string {
  return reason.length <= max ? reason : `${reason.slice(0, max - 1)}…`;
}
