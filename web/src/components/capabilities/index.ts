/**
 * Capability components.
 *
 * Presentation only, and that is a security property here: no component resolves a capability,
 * checks a permission or looks up an entitlement. Every state and reason is the server's own.
 */

export {
  CapabilityCard,
  CapabilityPipeline,
  CapabilityStateBadge,
  CapabilitySummary,
  ModuleMap,
  STATE_LABEL,
  STATE_TONE,
} from './CapabilityPanels';
