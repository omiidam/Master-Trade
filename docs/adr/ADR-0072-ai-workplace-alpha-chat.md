# ADR-0072 — AI Workplace alpha chat: the first real end-to-end chat pipeline

- **Status:** Accepted
- **Decision id:** `DEC-AI-24-WORKPLACE-ALPHA-CHAT`
- **Phase:** AI Workplace Alpha Chat (Human Testing)
- **Depends on:** ADR-0065 (the Run Manager whose runs the chat turn
  rides on), ADR-0066 (the Agent Loop Engine the turn executes
  through), ADR-0060 (the Harness that assembles and calls the model),
  ADR-0063 (ArvanCloud as the hosted provider), ADR-0064 (the Context
  Builder the harness assembles with), ADR-0069 (the permission gate
  that stays the only way a tool runs), ADR-0070 (the Response Pipeline
  every response still leaves through) and ADR-0058 (the seam
  discipline — a phase wires a contract and does not grow a runtime).
- **Uses:** the existing LLM Gateway and its provider adapters
  (`src/llm/`), the existing `agent.chat` route and its pipeline, and
  the existing frontend API session (`clientForApiSession`).

## Context

Every layer of the agent stack exists and is tested — Harness, Agent
Loop Engine, Context Builder, Run Manager, LLM Provider/Gateway,
permission layer — but no human has ever driven the whole pipeline
with their own hands: the AI Workplace page rendered a mock transcript,
the composer refused to send, and `agent.chat` answered through the
offline single step even when a live gateway was configured. Phase
2.13 exists to open that seam: the first real chat interface whose
every answer comes from DeepSeek through the gateway, so the developer
can manually test the complete pipeline — and to do it without
redesigning any layer it touches.

Two constraints shape the phase. First, **no fake responses**: the
transcript holds only turns that were actually sent, a failure is
rendered as a failure, and the model badge says "model not connected"
when the server says the offline adapter answered. Second, **no
bypasses**: a plain chat turn must go through the Run Manager, the
Agent Loop, the Harness, the provider abstraction and the gateway —
not around any of them — and the response must still leave through the
Response Pipeline.

## Decision (`DEC-AI-24-WORKPLACE-ALPHA-CHAT`)

### 1. One loop path inside the existing handler, decided once per request

`src/server/handlers/agent.ts` decides per request whether the full
pipeline runs: a live gateway was configured (the Run Manager holds the
harness adapter and the service holds the async model), the caller is
authenticated, and the request is a plain chat turn (no capabilityId,
no analysisType). In that mode the turn executes through
`AgentRunManager.runLoop` → Agent Loop → Harness → adapter → gateway,
with `service.renderedInstructions()` as the run's instructions and
the request's language/style directives carried through. Every other
branch — capability plans, gated analyses, offline deployments —
executes exactly as it did before this phase.

### 2. The loop's run _is_ the tracked run

`runLoop` creates the run before the turn starts and settles it after,
so `runTrackedTurn` does not wrap it in a second record: double-tracking
one turn under two run ids would make the Workplace's own record a lie.
A turn the loop never reached (a policy refusal) is still a tracked
run, minted and immediately settled as blocked, so **every chat request
has exactly one tracked run** with an id, a state, a start time and a
completion. The response's `run` field is read back from the Run
Manager's record — not reconstructed — and carries `runId`, `state`,
`startedAt`, `endedAt` and `durationMs`.

### 3. The loop's pipeline decision travels to the response unchanged

The loop path runs the Response Pipeline once, on the full loop result
(`responsePipelineInputFromLoop`), to shape the turn — and that very
result is carried through `respond()` instead of being re-derived from
the turn's reduced view. Re-running through
`responsePipelineInputFromTurn` would silently drop the loop's stop
reason (it is `null` by construction on that path) and re-decide from
less input; carrying the decision through keeps one decision, one
source, and makes a failed loop's `kind: 'failed'` metadata reachable
to the client. Non-loop turns still finalize through the pipeline
exactly once, in `respond()`, as before.

### 4. A small policy hook before the model, not a policy engine

`src/agent/chatPolicy.ts` answers one question — _should this message
reach the model at all?_ — with closed, deterministic pattern lists:
system-manipulation attempts (override instructions, reveal the
prompt, extract credentials, escalate roles, flip safety) and trade-
execution requests are **rejected**; whole-message greetings and a
closed list of out-of-scope topics are **redirected** to what the
workspace is for. Everything else is allowed — the lists are closed on
purpose, so an unrecognised message (including Persian and technical
phrasing) can never be blocked by a guess. The hook runs immediately
before the model would be consulted in each branch; a refusal is
shaped into the same blocked turn every other gate produces, so
tracking, metering and the bus treat it alike. Operation
authorization, readiness gates, capability plans, metering and the
tool permission gate all stay where they already are — this adds no
second permission system.

### 5. The Workplace renders the real pipeline

`web/src/pages/AgentWorkspacePage.tsx` is wired to the real
`agent.chat` route through the existing typed client
(`ApiClient.agentChat`) and the existing session resolver
(`clientForApiSession`): a live transcript of only the turns actually
sent, user and assistant messages with epistemic labels, a RUNNING
state while a turn is in flight (the composer locks — one turn at a
time), an error surface with the server's or transport's own reason, a
per-page conversation identifier sent with every message, the
`Agent Loop → LLM Gateway → Response` pipeline line, and the tracked
run's id, state, start time and duration rendered from the server's
record. The model badge reports the label the last answer carried and
says `model not connected` when the server reports the offline
deterministic adapter; the provider question is answered by the
server, never guessed by the client.

### 6. Provider configuration stays server-side

The provider is configured exactly as before —
`MASTER_TRADE_AI_PROVIDER=arvancloud`, `MASTER_TRADE_AI_MODEL`,
`MASTER_TRADE_AI_KEY_ENV=ARVANCLOUD_API_KEY`, and the key itself in
the process environment (`.env.local`, sourced into the shell when
starting the API; no dotenv loads it implicitly). The gateway resolves
the secret server-side through the existing `secretFromEnv` seam, and
tests assert the resolved secret appears in no response body.

## Consequences

The developer can manually test the complete pipeline for the first
time: a browser message reaches DeepSeek-V4-Flash through the gateway
and comes back as a tracked, policy-checked, pipeline-finalized
answer, and a gateway outage ends in a `failed` run with a blocked
turn rather than a success-shaped reply. The same message reaches the
same gateway whether it arrives as plain chat, a gated analysis or a
capability request, because there is one adapter and one gateway.

Two defects the first live run exposed are fixed in this phase: the
ArvanCloud adapter's default base URL lacked the `/v1` mount the live
service answers on (corrected, with the verification noted, in
ADR-0063), and local sign-in issued sessions without the `users` row
every owner-scoped table references — so the first _write_ (a metered
chat turn) failed on a foreign key while every read succeeded.
Sign-in now makes the account before issuing the session
(`IdentityRepository.ensureUser`), which is what turns a browser
session from a readable ghost into a first-class account. While the
ArvanCloud account itself reports `403 Account is debtor`, a chat turn
ends as an honestly failed run — blocked, uncharged, no fabricated
answer — the pipeline behaving correctly on provider failure, not a
UI fallback.

Deliberately absent: streaming, Needle 3 runtime routing, tool
execution from chat, memory, RAG, portfolio integration and any
conversation persistence beyond the page's own transcript — none of
them belongs to this phase, and the mock transcript it replaced is
gone rather than kept beside the real one.
