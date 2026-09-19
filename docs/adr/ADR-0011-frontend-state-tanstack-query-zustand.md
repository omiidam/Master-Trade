# ADR-0011 — Frontend state: TanStack Query + Zustand

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-FE-2-STATE`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

The UI has two genuinely different kinds of state, and Phase 2 already produced a
third that predates both:

1. **Server/agent data** — conversation threads, curriculum, lesson progress,
   exam attempts, job status, audit records, cost/budget. Async, cached,
   retryable, invalidated by mutations.
2. **Local UI state** — which panel is open, chart symbol/timeframe, draft
   message, filters, theme.
3. **Streaming tokens** — arrive over WebSocket at high frequency while a
   response is being generated, and must not thrash the cache that holds
   committed messages.

Phase 2 modelled agent state as typed structures and deliberately deferred the
runtime choice. The architecture lock must now name it.

## Decision

**TanStack Query v5 for async/server state, Zustand v5 for local UI state, and a
dedicated transient Zustand slice for streaming tokens.**

- Query owns fetch/cache/invalidate: `useQuery(['conversation', id])` and
  friends, with retry/backoff mirrored from the backend's retryable error codes.
- Zustand owns ephemeral UI state because it needs no provider, no reducer
  ceremony and is testable without React.
- Streaming writes go to the transient slice only; a finished message commits
  through a mutation that invalidates the query, so the UI has exactly one
  "source of truth" flip per turn.
- **Security rule:** no secret ever enters client state. Components read a
  `SecretRef`-shaped status ("configured"/"missing"), never a key.

## Alternatives rejected

| Alternative                              | Why rejected                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Redux Toolkit (+ RTK Query)              | Verbose for one user; RTK Query duplicates TanStack Query while its own cache/retry semantics would need re-deriving from our error model. |
| MobX                                     | Observable magic makes the streaming/commit boundary implicit; harder to reason about and to test outside React.                           |
| Jotai                                    | Elegant atomic model, but async cache/invalidation still needs TanStack Query, so it would be a third state system.                        |
| Recoil                                   | Effectively unmaintained; unsuitable for a system expected to live for months.                                                             |
| React Context only                       | Every token update re-renders all consumers of the provider; fine for theme, wrong for a token stream and a growing audit log.             |
| Server-side state in SQLite-backed hooks | Blurs the frontend/backend boundary the architecture depends on; the frontend must not read the database.                                  |

## Consequences

**Positive:** async state follows one predictable lifecycle; local state stays
small; streaming and committed state cannot collide; both libraries are
framework-agnostic enough to survive a future React upgrade.

**Negative:** two state systems to teach; developers must know which bucket a
piece of state belongs to. Mitigated by documenting the rule in
`docs/desktop-and-frontend.md` and by keeping the streaming slice in one file.

**Security impact:** positive — secrets are explicitly excluded from state, and
query errors surface the sanitized `ErrorCode`, never a raw provider payload.

## References

- [technology-decisions.md § 1.2](../technology-decisions.md)
- [ADR-0010](./ADR-0010-frontend-framework-react-vite.md)
