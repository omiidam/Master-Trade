/**
 * Shared taxonomy helpers for the decision-router suites (Phase 2.14).
 *
 * `decisionOf` builds a complete, valid decision the strict schema accepts —
 * the stubs are injected at the `Needle3Classifier` interface, which is the
 * adapter boundary, so no other part of the layer is ever faked.
 */
import { ROUTE_FLAGS, type RouterDecision } from '../src/training/decisionRouter.js';

export { ROUTE_FLAGS };

export function decisionOf(
  intent: RouterDecision['intent'],
  route: RouterDecision['route'],
  confidence = 90,
): RouterDecision {
  return {
    intent,
    route,
    confidence,
    reason: 'classified',
    requires_llm: ROUTE_FLAGS[route].requiresLlm,
    requires_tool: ROUTE_FLAGS[route].requiresTool,
  };
}
