# Master Trade

A desktop-oriented **Trading Training Agent** that evolves from beginner to
advanced level over ≥6 months. Training only — no live trading, no broker
execution, by design.

Three independent components:

1. **Model** — reasoning/explanation (LLM later; deterministic scripted adapter now)
2. **Tools** — explicit, typed, deterministic, side-effect free
3. **Instructions** — versioned, safety-validated rules and policies

See `docs/architecture.md` and `docs/workflow.md`.

## Quick start

```bash
npm install
npm run validate     # format + typecheck + tests + build
npm run agent:demo   # run the end-to-end demo
```

## Safety

- No live trading. No broker connections. No order placement.
- Risk numbers come only from deterministic tools.
- Facts / analysis / hypotheses / uncertainty are always labeled.
- New trading rules require human approval.
