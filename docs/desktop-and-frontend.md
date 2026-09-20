# Desktop Application & Frontend

> **Implementation status (Phase 3.6):** both halves are now implemented.
> Section 1 is real — `src-tauri/` holds the Tauri 2 project, `src/desktop/` holds
> the TypeScript policy layer (capability allow-list, IPC contract, local config,
> lifecycle, sidecar supervision) and `npm run desktop:verify` checks the two
> against each other. Section 2 is the frontend foundation in `web/`. See
> [desktop-shell.md](./desktop-shell.md) for how to build, run and verify the
> shell, and [frontend-foundation.md](./frontend-foundation.md) for the frontend. What is still missing is a built bundle: this repository contains no
> Rust toolchain, so the shell is source-complete and policy-verified, not
> compiled.

## 1. Desktop technology evaluation

The requirement is a desktop application for one learner, running for months,
holding an LLM API key, working offline for lessons, and never touching a broker.

| Criterion                    | Tauri (recommended)                         | Electron                  | Native (Qt/.NET)  |
| ---------------------------- | ------------------------------------------- | ------------------------- | ----------------- |
| Bundle size                  | ~10–15 MB                                   | ~120–200 MB               | ~40–80 MB         |
| Memory (idle)                | low (system WebView)                        | high (Chromium per app)   | low               |
| Secret storage               | Rust `keyring` bindings, first-class        | `safeStorage`, needs care | native keychain   |
| Offline capability           | full (local process + cache)                | full                      | full              |
| Future deterministic compute | Rust host can host Menai-style pure compute | Node addons / workers     | native            |
| Update channel               | signed updater built in                     | electron-updater          | manual            |
| Ecosystem                    | smaller                                     | largest                   | smallest          |
| Cross-platform consistency   | WebView differences                         | identical everywhere      | per-platform work |

**Recommendation: Tauri.** Decision and trade-offs in
[ADR-0001](./adr/ADR-0001-desktop-shell-tauri.md). The shell contract is
`src/desktop/host.ts`:

- `SecureStore` — LLM keys and credentials live in the OS keychain, never in
  config, the database or a log.
- `OfflineCache` — lesson content and last-known data survive without network.
- Required capabilities are declared (`REQUIRED_DESKTOP_CAPABILITIES`) and
  `assertDesktopHost()` refuses to start a shell missing any of them.

### Communication

The desktop shell hosts the local API process and exposes it to the WebView as
an in-process bridge that speaks the **same typed contracts** as HTTP
(`src/api/contracts.ts`). There is no second, shell-only API surface: a request
that is invalid or unauthorized in-process is invalid and unauthorized over
HTTP. Remote deployment later (hypothetical) means swapping the transport only.

### Secure local capabilities

- Capability allow-list: the shell exposes only the capabilities it declares.
- No shell API returns a filesystem path to the frontend; files are addressed by
  storage id and served through the storage layer (`src/storage/files.ts`).
- No shell capability exists for order placement, broker connection or trading —
  not disabled, simply absent.

### Offline behaviour

Offline-capable: lesson reading, agent explanation of local content, review of
past sessions, deterministic risk tools, synthetic data. Requires network:
real LLM calls, future provider data ingestion, future remote embeddings. The
frontend shows `SystemStatusView.realtimeConnected` and budget usage so the user
always knows what is live and what is cached.

## 2. Frontend

### Responsibilities and state

The frontend owns UI and application state only. Its shapes are defined in
`src/frontend/viewModels.ts` so that backend, tests and UI agree on one
contract. State groups:

- session/principal (roles drive what is rendered);
- conversation thread and streaming status;
- curriculum, lesson progress, exam attempts;
- dashboard view (read-only) and provenance banner;
- notifications, activity log, system status.

### Screens

| Screen               | Content                                                     | Invariant                                                 |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Agent (conversation) | messages with epistemic label and sources                   | every answer shows `fact/analysis/hypothesis/uncertainty` |
| Academy              | curriculum, lessons, examinations, progress                 | lessons gated by prerequisites                            |
| Dashboard            | read-only charts/metrics, provenance banner                 | `capability: 'read-only'`, never an order control         |
| Notifications        | progress, job, system notices                               | severity only; no actionable trade language               |
| Activity             | what the agent did: tool calls, provenance, correlation ids | sourced from audit/log records                            |
| Settings             | providers, budget, safety status                            | secrets are write-only into the keychain                  |

### Trading dashboard and future charting

The dashboard is deliberately read-only. `NAV_ITEMS` and every control label are
validated against `FORBIDDEN_UI_CONTROL` (order/execute/broker/blocked phrases),
and `assertNoExecutionControls()` fails the build's test suite if any label
matches. Charting (candles, indicators, annotations) renders `Bar` data whose
`provenance` is always displayed via `provenanceLabel()` — synthetic data reads
"Synthetic training data — not real market data".

### Conversation interface

A message view carries `epistemicKind` and `sources`. Tool-backed numbers are
rendered with their tool name; model-authored statements are visually distinct
from facts, which is the UI-side enforcement of the epistemic policy.

### Notifications, logs, status

`NotificationView` (severity), the activity log (from structured logs, already
redacted) and `SystemStatusView` (agent lifecycle state, LLM provider, budget
spent, data sources with provenance, job list, safety mode). Safety status is
always visible: the user can confirm at a glance that live trading and broker
execution are disabled.

## 3. The implemented shell (Phase 3.6)

### Layering

The shell is three layers, and the split is what keeps "no unsafe permissions" a
property you can check rather than a promise:

```
src-tauri/            Rust host — owns the process, the window, the keychain,
  src/sidecar.rs        the local cache. Spawns the API. The only code that can.
  src/secrets.rs
  src/cache.rs
  src/config.rs
  src/  commands.rs     The complete command surface: 13 commands, all typed.
  capabilities/       What the WebView is allowed to call. Five permissions.
src/desktop/          TypeScript policy — the same rules, executable and tested.
  capabilities.ts       allow-list, forbidden-permission reasons, parser
  ipc.ts                command set, bridge, browser stand-in
  config.ts             app-data dir, strict schema, credential refusal
  lifecycle.ts          startup/shutdown order as a state machine
  sidecar.ts            launch plan, health gate, restart budget
  verify.ts             reads src-tauri/ and proves the two agree
web/src/desktop/      The frontend side: bridge + useShellStatus()
```

### The WebView holds five permissions

`core:app:default`, `core:event:default`, `core:window:default`,
`core:window:allow-hide`, `core:window:allow-show` — and nothing else. In
particular **no `shell:` permission at all**. That is the load-bearing decision,
confirmed against the Tauri 2 documentation: because the Rust host spawns the
sidecar itself, the WebView never needs spawn or execute rights. A compromised
page has no primitive to start a process with, because none was ever granted.

`src/desktop/verify.ts` adds two checks the compiler cannot make. First, every
permission in `capabilities/main.json` is checked against a **forbidden list with
a stated reason** per family (`shell:`, `fs:`, `path:`, `http:`, `process:`,
`store:`, `global-shortcut:`, `core:default`) and per specific dangerous entry
(`core:window:allow-create`, `allow-set-always-on-top`, …). Second, the command
names in `src/desktop/ipc.ts` must match the `#[tauri::command]` functions in
`commands.rs` **in both directions** — a command added on either side alone fails
the check, so the allow-list cannot silently drift from the bridge.

### No path reaches the frontend

`grep`-checkable and tested: no command returns a filesystem path. `export_report`
returns a file **name**; `export_report_as` returns the chosen name or a refusal,
never a directory. The export name is validated against a pattern before it
crosses (`assertExportName`), the extension is restricted, and the shell resolves
the destination inside the app-data directory. Files are otherwise addressed by
storage id through `src/storage/files.ts`, as section 1 requires.

### Local configuration

`config.json` lives in the per-OS app-data directory (`%APPDATA%\Master Trade`,
`~/Library/Application Support/Master Trade`, `$XDG_CONFIG_HOME/master-trade`) and
is parsed by exactly one strict Zod schema shared with the Rust side —
`verify.ts` compares the key sets, so a key added in Rust alone fails. A recursive
check refuses anything named like a credential (`key`, `token`, `secret`, …) at
any depth: the **value** is rejected with a policy error, not filtered out, so a
"just cache the key here" change fails immediately rather than leaking a key to
disk. Window geometry and the start-up mode are the only things that live here;
secrets stay in the OS keychain.

### Lifecycle

The order is fixed and machine-checked (`lifecycle.ts`): resolve the app-data
directory → read configuration → instance check → spawn the sidecar → wait for
the API to answer → show the window → ready. A window is never shown against an
API that is not listening, because the failure it would present is an empty
workspace rather than the real cause — and the state machine carries the reason,
so the reason is reportable. Shutdown runs in reverse (stop accepting work → the
child exits and closes the database → release the instance lock → remove the
tray → stopped), so the SQLite database is closed by the process that owns it.

### Sidecar supervision

`sidecar.ts` builds a **plan**, not a command string: fixed argument list, fixed
loopback host, a 256-bit token generated per launch and passed through the
environment (never written to a file, never logged). `httpHealthCheck` probes
`GET /v1/health` with that same token, so "ready" means the real authenticated
route answered. A crash restarts with exponential backoff up to a bound and then
fails — the counter is deliberately _not_ reset on a restart, which is what stops
"restart forever" from looking like "recovered".

The port is fixed at 4317 rather than dynamic: the CSP names that exact origin, and
`http://127.0.0.1:*` would let a page reach any local service. A busy port is
therefore an actionable start-up failure, not a silent relocation.

## 4. What the frontend may never do

- call an LLM or market-data provider directly;
- construct a risk number itself;
- render an execution/order control;
- display synthetic data without the synthetic label;
- hold a secret in component state instead of the keychain.
