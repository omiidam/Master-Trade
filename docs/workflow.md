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
npm install          # setup (backend + frontend dev dependencies)
npm run validate     # format + typecheck + typecheck:web + test + build + build:web
npm run dev          # workstation UI preview → http://127.0.0.1:5173
npm test             # tests only
npm run api          # HTTP API after build → http://127.0.0.1:4317 (loopback only)
npm run agent:demo   # end-to-end demo after build
```

A backend change is smoke-tested against a real socket, not only `app.inject()`:
`npm run build && npm run api`, then `curl http://127.0.0.1:4317/v1/health` and
`curl http://127.0.0.1:4317/v1/health/ready`. Readiness is expected to answer
`degraded` until persistence, providers and realtime land — that is the honest
state, not a failure.

The frontend (`web/`) shares one package with the backend but has its own
typecheck (`web/tsconfig.json`, DOM lib + `react-jsx`) and its own build target,
so a UI regression cannot hide behind a green backend build.

## Documentation map

`docs/architecture.md` is the entry point; each layer has its own document and
every significant decision has an ADR in `docs/adr/`.

New architectural decision? Add an ADR with context, decision, **alternatives
rejected and why**, and consequences. Changed behaviour of a layer? Update that
layer's document in the same commit — documentation drift is treated as a defect,
not a chore.

### Locked technology decisions (Phase 3.1)

`docs/technology-decisions.md` is the official stack baseline and
`src/core/architectureLock.ts` is its machine-readable twin. A locked decision
changes **only** by adding an ADR that supersedes the previous one and updating
both the lock module and the document in the same commit; the lock test fails
otherwise. Nothing in Phase 3.1 installed a dependency — libraries named in the
lock become `package.json` entries only when Phase 3.2 uses them for real.

## Architectural invariants

These are enforced by tests and must stay green on every push:

- `assertSafeConfig()` refuses live trading, execution, live data, sensitive
  storage, unredacted logs and model-direct tool execution;
- `assertNoHardlineOperations()` proves no broker/execution operation exists;
- no side-effecting tool can register;
- a model referencing a denied capability is `BLOCKED`;
- no UI navigation label matches `FORBIDDEN_UI_CONTROL`;
- a rule cannot activate without an approved human approval;
- model-authored memory can never be promoted to trusted knowledge by automation;
- `assertArchitectureLock()` proves every technology area is decided, every
  cited ADR exists, and no experimental technology or opaque agent framework is
  a core dependency;
- no module outside `src/llm/providers/**` imports a provider SDK;
- the frontend exposes the five required pages, no navigation label or control
  accessible name matches `FORBIDDEN_UI_CONTROL`, every design token referenced
  exists in the theme, and the preview identifies itself as a preview;
- no route is registered outside the request pipeline, every catalogue route is
  registered, and no anonymous route is a write (`assertRouteCoverage()`,
  `assertApiCatalogue()` — both run at server start-up, not only in tests);
- authorization runs before body validation, an invalid bearer token is always
  `401` (even on a public route), and an approval-gated operation is `451`
  before it can reach its handler;
- configuration refuses to start on an unsafe value, and a session token never
  appears in a log record.

## Commit style

- `area: summary` (e.g. `risk: add fixed-fractional position sizing tool`)
- Body explains motivation; safety-relevant changes call it out explicitly.

## CI

`.github/workflows/ci.yml` runs `npm run validate` on every push and PR
(Node 20 and 22). CI passing is required before a push is considered valid.
