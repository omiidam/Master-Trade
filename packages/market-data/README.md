# packages/market-data — placeholder (not a package)

Reserved for the market-data layer. **Nothing lives here yet**, and this directory
contains no `package.json`, so npm does not treat it as a package and nothing can be
imported from it.

Today the provider interface, normalization and quality validation are in
`src/marketdata/**`, and they stay there — Phase 4.2 moved no files.

**Why it is deferred:** it has exactly one consumer
([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).

**Safety invariants that must survive any move:** every value carries mandatory
provenance, and synthetic / historical / live data are never conflated. There is no
path from this layer to order execution.

**Trigger to populate:** a second consumer, or the first real provider adapters being
released on their own cadence.
