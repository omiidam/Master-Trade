/**
 * Real-time layer — public surface.
 *
 * Split so each piece can be read on its own: `contracts` (what an event is),
 * `events` (who may publish and see it), `hub` (connections, subscriptions,
 * backpressure), `protocol` (the wire format), `ws` (the Fastify transport).
 */

export {
  EVENT_CONTRACTS,
  EVENT_SCHEMA_VERSION,
  EVENT_SECRET_KEY_PATTERN,
  EVENT_STATEMENT_KINDS,
  MAX_EVENT_PAYLOAD_BYTES,
  assertEventContracts,
  assertNoSecretsInPayload,
  assertValidEventPayload,
  contractFor,
  eventTypes,
  internalEventTypes,
  isRealtimeEventType,
  mayPublish,
  validateEventPayload,
  type EventContract,
  type EventPublisher,
  type EventSource,
  type EventSourceKind,
  type EventValidation,
  type RealtimeEventType,
} from './contracts.js';
export {
  EventBus,
  assertOrdered,
  assertReplayContinuity,
  isVisibleTo,
  missingSequences,
  resolveAudience,
  type EventBusOptions,
  type EventDelivery,
  type PublishInput,
  type PublishReceipt,
  type RealtimeEvent,
} from './events.js';
export {
  DEFAULT_REALTIME_LIMITS,
  RealtimeConnection,
  RealtimeHub,
  type ConnectionSnapshot,
  type ConnectionState,
  type RealtimeHubOptions,
  type RealtimeLimits,
  type RealtimeTransport,
} from './hub.js';
export {
  CLOSE_CODES,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_SUBPROTOCOL,
  TERMINAL_CLOSE_CODES,
  closeCodeFor,
  parseClientFrame,
  serializeFrame,
  shouldReconnect,
  type ClientFrame,
  type CloseCode,
  type ServerFrame,
} from './protocol.js';
export { REALTIME_ROUTE, registerRealtimeTransport, type RealtimeTransportOptions } from './ws.js';
