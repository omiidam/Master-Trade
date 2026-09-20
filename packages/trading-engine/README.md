# packages/trading-engine — placeholder (not a package, and intentionally nearly empty)

Reserved for deterministic trading logic. **Nothing lives here yet**, and this
directory contains no `package.json`, so npm does not treat it as a package and nothing
can be imported from it.

**Be aware of how little this package would hold.** The proposed structure names a
"trading engine", but what actually exists is a small, deliberate amount of code:

- `src/tools/risk.ts` — position sizing, R-multiples, drawdown, deterministic and
  unit-tested;
- `src/evaluation/**` — the architectural-invariant harness.

There is no strategy engine, no execution model and no broker connectivity, because
**live trading is disabled by design** (`liveTradingEnabled` and
`brokerExecutionEnabled` are both `false` and the configuration loader refuses to
start with them enabled). Creating an empty package to match a target diagram would be
premature structure — the opposite of what [ADR-0002](../../docs/adr/ADR-0002-modular-monolith.md)
chose, and explicitly rejected by
[ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md).

This marker exists so the directory is not mistaken for a missing implementation.

**Trigger to populate:** backtesting and a strategy evaluation surface becoming real
enough to have their own consumers — and even then, risk math must stay deterministic
and outside the model (`ADR-0009`).
