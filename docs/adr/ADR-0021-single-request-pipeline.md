# ADR-0021 — One request pipeline for every route, and honest 501s for the rest

- **Status:** Accepted (Phase 3.3, decision id `DEC-BE-5-PIPELINE`)
- **Date:** 2026-09-19
- **Supersedes:** none
- **Related:** [ADR-0014](./ADR-0014-backend-runtime-fastify.md), [ADR-0015](./ADR-0015-validation-zod-single-source.md), [ADR-0007](./ADR-0007-deny-by-default-auth.md)

## Context

Phase 2 defined the API as typed contracts with a fixed sequence (envelope →
authN/authZ → validation → dispatch) but had no transport. Phase 3.3 mounts it on
Fastify. The open question was not "how do we route?" but **where the pipeline
lives**, because that determines whether a future route can accidentally skip
authorization.

A second question: the catalogue already declares routes whose backend capability
does not exist yet (`lesson.complete`, `rule.propose`, `rule.activate`). They
could be omitted until implemented, or registered and refused.

## Decision

**1. The pipeline is a `preHandler` hook attached by the route generator.** Routes
are registered by iterating `API_ROUTES`; each registration sets
`config.mtRouteId` and the same `preHandler`. Because routes are generated rather
than hand-wired, there is no per-route place to forget the guard.

**2. Start-up proves coverage.** `assertRouteCoverage()` runs after registration
and throws if any registered route lacks the pipeline, or if any catalogue route
was not registered. A bypass is a boot failure, not an incident to discover later.

**3. Authorization runs before body validation.** An unauthenticated caller learns
nothing about which fields the server would accept, and no parsing work is done
for a request that is going to be refused.

**4. Unimplemented routes are registered, guarded and refused with `501
NOT_IMPLEMENTED`** naming the missing capability and the route id.

**5. The pipeline returns its own refusals** (with the envelope and correlation
id) instead of throwing into the global error handler, so the refusal path is one
code path and cannot be double-handled.

## Alternatives rejected

| Alternative                                                 | Why rejected                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard called at the top of each handler                     | Relies on discipline; one skipped call is a silent privilege escalation. This is exactly the failure mode a typed contract is supposed to make impossible.                                  |
| Fastify global `onRequest` hook only                        | Global hooks cannot express per-route operation/validation, so the route-specific decision would move back into handlers.                                                                   |
| Per-route `preValidation`/`preHandler` written by hand      | Same drift risk as above, plus duplication across transports.                                                                                                                               |
| Validation before authorization (the "obvious" order)       | Returns field-level feedback to anonymous callers and does work for requests that will be refused; leaks schema shape to unauthenticated callers.                                           |
| Serving unauthenticated `501` for unimplemented routes      | Tells an unauthenticated caller which capabilities exist and are planned; the route surface itself is information.                                                                          |
| Omitting unimplemented routes from the server               | Two request code paths (matched vs unmatched) and a `404` that is indistinguishable from a typo; also lets a route appear in the catalogue without the pipeline ever being exercised on it. |
| Returning `200` with an empty body for unimplemented routes | A client cannot tell "not implemented" from "no data", and the frontend would build against a lie.                                                                                          |

## Consequences

**Positive:** authorization cannot be bypassed by omission; both transports (HTTP
and the desktop bridge) run the identical sequence, so "works in the bridge but
not over HTTP" is structurally impossible; the refusal shape is uniform
(`{ok:false, error:{code,…}, correlationId}`); adding a route cannot weaken the
guard; and the frontend can distinguish _unimplemented_ from _forbidden_.

**Negative:** three routes always answer `501` until their slices land, which is
noise in the route table; every route pays the pipeline cost (microseconds
against a local database, irrelevant next to a provider call).

**Security impact:** positive — the decision point is centralized, deny-by-default
is applied uniformly, and the coverage assertion makes a future bypass a failed
build.

## References

- [backend-foundation.md § 2](../backend-foundation.md)
- [api-auth.md](../api-auth.md), [architecture.md § 4.1](../architecture.md)
- `src/server/routes.ts`, `src/server/authorization.ts`, `tests/server.test.ts`
