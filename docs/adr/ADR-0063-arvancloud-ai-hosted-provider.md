# ADR-0063 — ArvanCloud AI as a hosted provider inside the existing gateway

- **Status:** Accepted
- **Decision id:** `DEC-AI-15-ARVANCLOUD-PROVIDER`
- **Phase:** Phase 2.3 (Real ArvanCloud LLM Gateway integration)
- **Depends on:** ADR-0004 (the gateway abstraction), ADR-0019 (adapters, not
  frameworks), ADR-0026 (cost from our price table), ADR-0028 (native-fetch
  provider transport).

## Context

The gateway abstraction existed from Phase 3.5 with three hosted adapters:
OpenAI, Anthropic and any local OpenAI-compatible server. The product now needs
ArvanCloud's hosted AI service (`https://api.arvancloudai.ir`, endpoint
`/chat/completions`, model `DeepSeek-V4-Flash`) as the real model behind the
agent surface (AI Workplace).

ArvanCloud speaks the OpenAI Chat Completions wire protocol but authenticates
with `Authorization: apikey <key>` rather than the `Bearer` scheme. Three ways
to absorb that difference were on the table:

1. **A second gateway / second configuration system for ArvanCloud.** Rejected
   outright: two places that own endpoints, retries, budgets and error
   semantics is how the guarantees drift. `DEC-AI-2-GATEWAY` names the existing
   `LlmGateway` as the single owner.
2. **A vendor SDK.** Rejected by `DEC-AI-3-INDEPENDENCE` and ADR-0028: provider
   code stays a thin native-fetch adapter in `src/llm/providers/`.
3. **Compose the existing OpenAI-compatible adapter with a transport-level
   auth-header override, and register it as a new provider id.** Accepted —
   it is exactly what the `HttpProviderDeps.authHeader` seam existed for.

## Decision (`DEC-AI-15-ARVANCLOUD-PROVIDER`)

ArvanCloud AI is a hosted provider **inside the existing gateway**, not beside
it:

- **Provider id `arvancloud`** joins `LlmProviderId`
  (`src/llm/provider.ts`). `src/llm/providers/arvancloud.ts` composes the
  existing `openAiCompatibleProvider` — payload mapping, reasoning-field
  dropping, tool-argument refusal, error taxonomy are all the existing code —
  and supplies the one difference: `Authorization: apikey <key>` via the
  transport's `authHeader` override. The credential never appears in an error,
  a detail object or a log field.
- **Registry wiring, not a new composition root.**
  `src/llm/registry.ts` gains `arvancloud` in `DEFAULT_BASE_URLS`
  (`https://api.arvancloudai.ir`) and a `buildProvider` branch that requires a
  resolved `SecretRef`, exactly like `openai`/`anthropic`: no credential means
  the provider is skipped **with a reason** and the offline scripted adapter
  answers.
- **A price row before the first call.** `DeepSeek-V4-Flash` is priced in
  `src/llm/pricing.ts` (indicative list price), so `requirePricedModels`
  budget enforcement holds; an unpriced model remains a start-up warning and a
  call-time refusal (ADR-0026).
- **The AI Workplace connects through the same gateway.** The server
  (`src/server/app.ts`) builds its gateway with the existing composition root
  (`createAiGateway`) from the existing `AppConfig.ai` and installs
  `createLlmModelAdapter({ gateway })` as the agent's async model when a hosted
  endpoint was actually built. There is no second gateway, no second
  configuration system and no provider-specific branch anywhere above
  `src/llm/providers/`.
- **Environment, not code.** The credential is referenced by name —
  `MASTER_TRADE_AI_KEY_ENV=ARVANCLOUD_API_KEY` makes the config hold a
  `SecretRef` to the environment variable `ARVANCLOUD_API_KEY`, resolved
  server-side at the point of use. The key is never inlined into config,
  never shipped to the browser, and the server binds loopback only.
  `.env.example` documents the variable with a placeholder, never a real key.
- **Local development is unchanged.** With no key set, the provider is skipped
  with a recorded reason and the deterministic scripted adapter answers; the
  parser, permission check and cost accounting are identical on both paths.

## Alternatives rejected and why

- **Vendor SDK (`openai` npm package pointed at ArvanCloud):** violates
  `DEC-AI-3-INDEPENDENCE` (provider SDK imports are confined and the import
  boundary test fails the build) and ADR-0028 (native fetch, no vendor SDK).
  It would also have hidden the `apikey` scheme inside a library instead of
  stating it once, in reviewable code.
- **Reuse `local-openai-compatible` with a custom base URL:** would route a
  hosted Iranian cloud provider through the adapter that assumes "local means
  no credential", forcing a credential through a path whose contract says
  none is needed, and would make "hosted" and "local" indistinguishable in
  configuration, audit and pricing.
- **Hard-code ArvanCloud as the default provider:** the offline scripted
  adapter is the default (`registry.ts`), and "the system runs with no key and
  no network" is a locked property, not a Phase 2.3 preference.

## Consequences

- Adding the next OpenAI-compatible hosted provider is now a small, reviewable
  change: an id, a base URL, a price row and — if its auth differs — an
  `authHeader` value. Nothing above `src/llm/providers/` changes.
- The gateway's guarantees apply to ArvanCloud for free: endpoint fallback,
  retry, timeout, circuit breaker, budget refusal, token/cost accounting,
  structured-summary contract enforcement and the tool-call permission check.
- The indicative price row must be reviewed when ArvanCloud changes its
  pricing; the cost number the budget enforces is always ours, never the
  provider's.
- Scope deliberately excluded in this phase: memory persistence beyond the
  Task 1.5 contracts, RAG, tool-calling expansion, evaluation and learning.
