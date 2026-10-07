# training-data

Curated, hand-authored datasets for local fine-tuning. Nothing in this
directory is captured from production: every record is written by the
team (`DEC-AI-7-DATASET-PROVENANCE`, origin `authored`) or is a
reviewed synthetic record with its reviewer recorded — never a live
conversation (`DEC-AI-6-NO-LIVE-DATA`). If a record cannot say where it
came from, it does not belong here.

## `decision-router.jsonl`

The Needle 3 decision-router dataset (Phase 2.12-A), the input for the
Phase 2.12-B LoRA fine-tuning. Needle 3 is a **local routing model** —
it classifies a user request and picks one of five routes _before_ any
expensive cloud LLM call. It is not the main reasoning model, does not
replace DeepSeek or the LLM Gateway, and never answers the user.

One JSON object per line (JSONL), exactly:

```json
{
  "instruction": "Classify this user request",
  "input": "user message",
  "output": { "intent": "...", "route": "...", "requires_llm": false }
}
```

- `instruction` is the fixed string `Classify this user request`.
- `input` is the raw user message to classify.
- `output.intent` is one of the eight intents in
  `ROUTER_INTENTS` (`src/training/decisionRouter.ts`).
- `output.route` is one of the five routes in `ROUTER_ROUTES`.
- `output.requires_llm` is `true` exactly when `route` is `LLM_GATEWAY`.

Both objects are strict: an unknown key or an unknown label is a
validation failure, not a near-miss. The output carries **no answer
text** — the dataset teaches classification labels only.

### Validating

`parseDecisionRouterJsonl()` (exported from `src/training/index.ts`)
parses and validates the file as a pure function, reporting line-numbered
issues: malformed JSON, schema violations, duplicate inputs, incoherent
`requires_llm` flags, and routes the taxonomy does not allow for the
intent. `tests/decision-router.test.ts` runs it against this file and
also checks coverage — every intent and every route appears at least
once.

### Adding examples

1. Append a line (one compact JSON object, no blank lines).
2. Keep `output` to the three specified fields; never add prose.
3. Route only through `INTENT_ALLOWED_ROUTES` — `BLOCK` is legal under
   any intent; trade-execution, permission-bypass and similar requests
   must be `BLOCK`.
4. Run `npx vitest run tests/decision-router.test.ts`.
