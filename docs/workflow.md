# Development & Git Workflow

## Mandatory policy after every validated code change

1. Run `npm run validate` (format check → typecheck → tests → build).
2. Review `git status` and `git diff`.
3. Create a meaningful commit (imperative mood, describe the _why_).
4. Push to the GitHub repository specified by the user.
5. Verify the remote branch and record the commit SHA.

## Rules

- If no GitHub repository is configured, **ask before the first push**.
- Never create a GitHub repository without explicit user approval.
- Never commit secrets, credentials, API keys or `.env` files
  (`.gitignore` blocks them; `.env.example` is allowed).
- Failed changes are never marked as completed.

## Commands

```bash
npm install          # setup
npm run validate     # format + typecheck + test + build
npm test             # tests only
npm run agent:demo   # end-to-end demo after build
```

## Documentation map (Phase 2)

`docs/architecture.md` is the entry point; each layer has its own document and
every significant decision has an ADR in `docs/adr/`.

New architectural decision? Add an ADR with context, decision and consequences.
Changed behaviour of a layer? Update that layer's document in the same commit —
documentation drift is treated as a defect, not a chore.

## Architectural invariants

These are enforced by tests and must stay green on every push:

- `assertSafeConfig()` refuses live trading, execution, live data, sensitive
  storage, unredacted logs and model-direct tool execution;
- `assertNoHardlineOperations()` proves no broker/execution operation exists;
- no side-effecting tool can register;
- a model referencing a denied capability is `BLOCKED`;
- no UI navigation label matches `FORBIDDEN_UI_CONTROL`;
- a rule cannot activate without an approved human approval;
- model-authored memory can never be promoted to trusted knowledge by automation.

## Commit style

- `area: summary` (e.g. `risk: add fixed-fractional position sizing tool`)
- Body explains motivation; safety-relevant changes call it out explicitly.

## CI

`.github/workflows/ci.yml` runs `npm run validate` on every push and PR
(Node 20 and 22). CI passing is required before a push is considered valid.
