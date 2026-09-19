# ADR-0015 — Validation: Zod as the single source of truth

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-BE-4-VALIDATION`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

Phase 2 implemented validation twice in spirit: `validateEnvelope()` plus
per-route hand-written `validateBody()` functions in `src/api/contracts.ts`,
returning `{ ok: true, value } | { ok: false, issues[] }`. That works and is
tested, but it forces every payload shape to be maintained twice — once as a
TypeScript type, once as a runtime check — and the two can drift.

Phase 3.1 adds Fastify (ADR-0014), which arrives with its own JSON-Schema/Ajv
validation. Having a second validator in the request path is a security hazard:
two validators can disagree, and the one that runs last wins by accident.

## Decision

**Zod schemas are the single runtime validator, and Fastify's body/schema
validation is disabled.**

- Each route declares a Zod schema beside it; the static input type is derived
  with `z.infer`, so input shape and authorization requirement are read together
  in review.
- `route.validateBody()` becomes a thin adapter over `schema.safeParse`, mapping
  issues into the existing `VALIDATION_FAILED` (400) response shape with a safe
  `issues: string[]` — never a stack trace and never raw input echoed back.
- `validateEnvelope()` stays an explicit small function: it is a version gate
  (unknown versions are rejected, not best-effort interpreted) rather than data
  validation, and it must run before any schema is chosen.
- Exactly one validator runs on untrusted input, and it lives in `src/api`;
  everything downstream receives typed data.
- Fastify route registration therefore passes no `schema` option for bodies. A
  lint/test guard keeps that true.

## Alternatives rejected

| Alternative                              | Why rejected                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Ajv / JSON Schema only (Fastify default) | No static type inference, so payload types would be hand-written again; verbose schemas; would still need a separate typed layer. |
| TypeBox                                  | Good inference story, but couples the contract layer to Fastify/Ajv idioms and is less pleasant for unions/refinements we need.   |
| io-ts / fp-ts                            | Stronger type-theory story, heavier learning curve and more verbose error mapping than the project needs.                         |
| Hand-rolled guards (Phase 2 status quo)  | Works, but duplicates types by hand and offers no composition; it is the thing that will drift first as routes multiply.          |
| Both Zod and Ajv                         | Two validators that can disagree — rejected outright as an authorization-adjacent risk.                                           |

## Consequences

**Positive:** one definition per payload; type inference removes drift; error
messages are consistent; composition (partials, refinements, discriminated
unions) makes new routes cheap.

**Negative:** Zod becomes a core dependency (small, type-first, no runtime
framework coupling) and is invoked in the request path — negligible for a
single-user loopback API.

**Security impact:** positive — a single validation point is auditable; with
Fastify's validator off, no request can be accepted by a schema we did not
declare, and validation still happens before any handler and _after_ the
authorization guard.

## References

- [technology-decisions.md § 2.4](../technology-decisions.md)
- [api-auth.md § 1](../api-auth.md)
- [ADR-0014](./ADR-0014-backend-runtime-fastify.md)
