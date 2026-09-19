# Desktop Application & Frontend

> **Implementation status (Phase 3.2):** the frontend foundation described in
> section 2 is now implemented in `web/` — shell, design tokens, component library
> and five prototype pages on mock data. See
> [frontend-foundation.md](./frontend-foundation.md) for the structure, the tested
> guardrails and what remains unwired. The desktop shell (section 1) is still a
> contract + decision, not a build.

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

## 3. What the frontend may never do

- call an LLM or market-data provider directly;
- construct a risk number itself;
- render an execution/order control;
- display synthetic data without the synthetic label;
- hold a secret in component state instead of the keychain.
