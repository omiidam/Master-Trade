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
  appears in a log record;
- a refusal to start is **never silent**: the preconditions run before a logger can
  exist, so a refused boot writes one structured, redacted record to `stderr` and
  exits non-zero (`reportBootRefusal`, `tests/server.test.ts` — see
  [ADR-0040](./adr/ADR-0040-a-refusal-is-reported-before-the-logger-exists.md)).

## Native engine / optional dependencies (Tailwind oxide)

**Symptom.** `npm run build:web` (or `vite build`) fails with:

```
Cannot find native binding
    at …/node_modules/@tailwindcss/oxide/index.js
```

**Root cause.** Tailwind CSS v4 builds on a native engine, `@tailwindcss/oxide`,
published as a set of per-platform packages (`@tailwindcss/oxide-linux-x64-gnu`,
`…-linux-x64-musl`, `…-darwin-arm64`, `…-win32-x64-msvc`, …) declared by oxide as
**optional** dependencies. npm installs the one matching the host OS/CPU and skips
the others. If anything makes npm omit optional dependencies, the package that
disappears is the engine itself, and the error above is thrown from inside oxide —
which is why it reads as a packaging complaint rather than a missing install.

**What it is not.** It is _not_ a missing or pruned lockfile: `package-lock.json`
declares every platform package with its `os`/`cpu`, including
`@tailwindcss/oxide-linux-x64-gnu`. It is _not_ a dependency-version problem, and it
is _not_ a Node version problem — the binaries are N-API and independent of the
Node minor. Editing or deleting the lockfile cannot fix it and loses
reproducibility.

**Diagnose the host.**

```bash
node -v && npm -v                              # Node ≥ 22.5 expected (node:sqlite)
node -p "process.platform + ' ' + process.arch"
npm config get omit                            # 'optional' here is the cause
npm ls @tailwindcss/oxide                      # is the platform package present?
node -e "require('@tailwindcss/oxide'); console.log('binding ok')"
```

**Fix.** Keep optional dependencies. The repository commits a `.npmrc` setting
`include=optional` — npm's positive directive for keeping them — so a user- or
global-level `omit=optional` on a build host can no longer silently disable the
engine, because a project `.npmrc` outranks one higher up the tree. (Writing
`omit=` with an empty value does not work: npm rejects it as invalid config and
ignores it, which is why the positive form is used.) `npm run validate` fails
loudly at `tests/native-engine.test.ts` if the engine is ever absent. Then
reinstall **without touching the lockfile**:

```bash
rm -rf node_modules
npm ci                     # never `--omit=optional` / `--no-optional`
node -e "require('@tailwindcss/oxide'); console.log('binding ok')"
```

A command-line flag still outranks `.npmrc`, so an explicit `--omit=optional` on the
build host must be removed rather than worked around. Do not hand-pin the platform
package in `package.json`: the lockfile is already correct, and a hard-pinned
platform package goes stale the next time Tailwind is upgraded.

## Commit style

- `area: summary` (e.g. `risk: add fixed-fractional position sizing tool`)
- Body explains motivation; safety-relevant changes call it out explicitly.

## CI

`.github/workflows/ci.yml` runs `npm run validate` on every push and PR, on a
Node **22 and 24** matrix (22.5+ is required for `node:sqlite`, the local database
driver; a 22 build without it skips the database suites with a recorded reason
rather than failing). It installs with `npm ci` — the committed lockfile, which
also keeps the optional Tailwind engine — and never `npm install`. CI passing is
required before a push is considered valid.

CI also runs `npm run audit:prod` (`npm audit --omit=dev --audit-level=high`)
immediately after install, so a **production-scope** advisory fails the build. The gate
is scoped to production deliberately: what can ship is what blocks a build. The dev/test
toolchain is assessed separately — currently at 0 as well — and its reachability record
lives in [dependency-audit.md](./dependency-audit.md). The gate is not part of
`npm run validate`, which stays offline and deterministic.
