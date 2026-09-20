# ADR-0032 — Versioned event contracts with deny-by-default audiences

- **Status:** Accepted
- **Phase:** 3.7
- **Decision id:** `DEC-RT-2-PROTOCOL`
- **Supersedes:** the protocol half of ADR-0017 (which chose the transport, not the contract)

## Context

ADR-0017 chose WebSocket over the existing event bus. That left a question the
transport decision does not answer: what is allowed to travel on the wire?

Two failure modes drove this. First, an event bus with free-form payloads becomes a
place where a field _changes meaning_ without anyone noticing, and a consumer
misreads it silently. Second, a realtime frame is the easiest place in a system to
leak a credential: payloads are assembled from arbitrary objects and sent straight to
a client.

## Decision

Every event type is a **declared contract** in `src/realtime/contracts.ts` carrying a
strict payload schema, a schema version, an audience, an internal flag and a
publisher allow-list. Delivery is deny-by-default:

- an event with an empty audience is **internal** and is never serialized to a client
  — not hidden in the UI, never sent;
- a publisher can **narrow** an audience but never widen it, and cannot give an
  internal event an audience;
- the bus reports per-subscriber `delivered`/`dropped` counts with reasons;
- payloads are size-bounded, and a key shaped like a credential **fails the publish**
  rather than being stripped — a silently-removed field is one a caller will believe
  was delivered.

The client mirrors the contract, not a copy of it: `web/src/realtime/client.ts`
imports `validateEventPayload` and `contractFor` from the same module the server
uses, and additionally refuses internal types it should never receive.

Authentication happens in the **first frame** — token, protocol version, resume
sequence and subscription together — and the route is gated by the same access policy
as every HTTP request.

## Alternatives rejected

- **Free-form payloads with a shared TypeScript type.** Types vanish at runtime; a
  version skew then produces a field read as something it is not. Rejected.
- **Filtering credentials out of payloads.** Silently dropping a field means the
  publisher believes it was delivered. Refusal is visible; filtering is not.
- **Audience as an opt-in list per publish.** An event with no declared audience
  would default to "everyone" under opt-in. Deny-by-default means the failure mode is
  "nobody sees it", which is recoverable.
- **Reusing `shouldReconnect` from the protocol module in the client.** That function
  answers the server's question and treats `1001 going away` as final, which is
  backwards for a client. The client defines its own terminal set (ADR recorded in
  `docs/realtime-and-jobs.md` § 3).
- **A provider SDK or a second protocol (SSE, polling).** SSE cannot carry a
  subscription model or a token in a body; polling cannot express ordering without a
  sequence anyway, which is the part that mattered.

## Consequences

A new event type requires a contract entry, and the registry is asserted complete by
test, so "I added an event" and "I documented what it may contain" are the same act.
The client duplicates no schema: one contract definition serves both sides, which is
why the frontend build fails if the contract changes incompatibly.

The cost is ceremony: an event that carries something new needs a version bump and a
consumer decision. That is the intended trade — the alternative showed up as silent
misreads.
