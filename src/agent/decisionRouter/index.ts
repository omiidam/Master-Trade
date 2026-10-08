/**
 * The chat decision-router layer (Phase 2.14): the Needle 3 runtime
 * integration. See `contract.ts` for the decision shape and the layering
 * rule, `needle3Adapter.ts` for the only file that knows a model exists,
 * and `routingPolicy.ts` for the deterministic, fail-closed policy.
 */
export {
  boundReason,
  CHAT_DECISION_KEYS,
  DECISION_CODES,
  deriveDecisionFields,
  domainForIntent,
  executionPathForRoute,
  isKnownIntent,
  isKnownRoute,
  type ChatRoutingDecision,
  type DecisionCode,
  type DecisionComplexity,
  type DecisionDomain,
  type DecisionExecutionPath,
  type DecisionIntent,
  type DecisionSource,
} from './contract.js';
export {
  CactusNeedle3Classifier,
  Needle3InvalidOutputError,
  Needle3TimeoutError,
  Needle3UnavailableError,
  parseCompletion,
  processRunner,
  type Needle3AdapterOptions,
  type Needle3Classifier,
  type Needle3Runner,
} from './needle3Adapter.js';
export {
  createChatDecisionRouter,
  type ChatDecisionRouter,
  type ChatDecisionRouterOptions,
} from './routingPolicy.js';
