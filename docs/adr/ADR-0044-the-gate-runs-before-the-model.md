# ADR-0044 — The readiness gate is a function that runs before the model

- **Status:** Accepted
- **Phase:** 5.3
- **Decision id:** `DEC-QUALITY-1-READINESS-GATE`

## Context

ADR-0041 decided that input quality bounds output quality, and named a five-level ladder an
answer must descend without skipping. Phase 5.2 gave the declared inputs a durable home.
Neither decided **where the ladder is evaluated**, and that location is the whole difference
between a rule and a wish.

The natural place to put it is the prompt. Assemble the context, describe the gaps, and ask
the model to respond appropriately — fewer moving parts, and it handles cases a rule set did
not anticipate. It is also the wrong place, and this project has an existing reason to know
why: ADR-0009 already requires that deterministic tools own all risk mathematics and that the
LLM never bypasses a permission check. A quality verdict is the same kind of object. It is a
**decision about whether an answer may be attempted**, computed from declared requirements
and stored facts. Handing it to a model makes it an interpretation.

The failure is concrete and asymmetric. A model that receives "risk tolerance: not provided"
and is asked to be careful will, most of the time, be careful. The times it is not are the
times it matters: it will supply a conventional band because the rest of the request is
specific, and the output will read as a considered answer to a question the system could not
answer. Nothing downstream can detect this, because the output carries no trace of having
skipped a level. There is also no test that can be written against it — the assertion would
be about a model's judgement under a prompt, which is exactly what this project refuses to
put a guarantee on (ADR-0019, ADR-0027).

A second, smaller question sits with the first: what does an **undecidable** gate do? A server
with no store cannot compute a verdict, and the tempting default is to proceed ungated — the
request is well-formed, the model is available, and refusing looks like an outage. That
default would make the guarantee hold on exactly the deployments least able to afford its
absence.

## Decision

**The gate is a pure function of stored state, evaluated before any model is consulted. The
model never receives an input set the gate refused, and no model output can change a verdict.**

1. **Requirements are declared per capability, in code.** `ANALYSIS_REQUIREMENTS` states, for
   each analysis type, which inputs it needs, whether each is required, and what to do when it
   is absent, stale or conflicting (`clarify`, `limit` or `block`). A capability that does not
   declare its requirements does not exist.
2. **The verdict is computed, not described.** `assessAnalysisReadiness` takes the context, the
   market-data capability and the clock, and returns a decision carrying a readiness, an output
   mode, one of seven classifications, named counts, the findings behind them, the questions
   worth asking and the substitutions that would be needed. No step of it consults a model.
3. **A refusal short-circuits the turn.** `AgentService.run` and `runAsync` check the decision
   first. On a refusal they return a `blocked` turn with no statements and no tool executions,
   so there is no inference for a model to argue with — the guarantee holds for the reason that
   the model was never asked.
4. **A permitted verdict still travels.** `READY_WITH_LIMITATIONS` and its limitations are
   attached to the completed turn and to the API response. Dropping them because the turn
   succeeded is the same dishonesty as not gating at all.
5. **An undecidable gate is a refusal.** A request that names an analysis and supplies no
   decision is refused (`refusalFor(null)`), and the route supplies `null` rather than a
   permissive default when it cannot evaluate the gate.
6. **One implementation, two consumers.** The route and the agent call the **same** function
   from `src/server/handlers/quality.ts`. A second implementation is how the answer the client
   reads and the answer the agent acted on would come to differ — the worst possible bug in
   this layer, since the client would be told "not ready" about a turn that ran anyway.
7. **The route reports what it will not decide.** `POST /v1/quality/assess` returns the
   assessment for the caller's own context. It takes no subject, so assessing another account
   is unrepresentable rather than merely forbidden.
8. **The assessment is safe to log and to display.** It carries representations — a constrained
   token, a count, an aggregate, or an explicit withholding with a reason — never the value the
   user wrote. Findings are worded by the code that raises them and match the issue vocabulary
   exactly, so a log record cannot become a copy of a user's declaration.

## Consequences

- **A refusal is reproducible and testable.** The same context, market-data state and clock
  always produce the same decision, which means the ladder is asserted in unit tests rather
  than reviewed. `tests/quality.test.ts` and `tests/quality-api.test.ts` do that.
- **The gate can be examined without running a model.** The Profile surface renders the
  decision for the user, including the rule that decided it (`describeDecisionCode`). A refusal
  is arguable instead of mysterious, which is what makes it acceptable to a user.
- **Capabilities are `planned` before they are built, and say so.** Every analysis type except
  `education.explain` is declared with `capability: 'planned'`. The inputs are still assessed —
  the user's declaration is graded honestly — but the refusal names the backlog item rather
  than blaming the inputs. A product gap and an input gap must not wear the same words.
- **Adding a capability is a declaration, not a code change in the gate.** A new analysis type
  adds one entry to `ANALYSIS_REQUIREMENTS`; the ladder, the classification precedence and the
  refusal wording follow from it.
- **The gate is a dependency of the agent, not of the prompt.** The agent cannot be asked to
  reason about whether it should answer. It is handed a verdict.
- **Two questions that look alike stay apart.** The context-level report ("how good are my
  declared inputs?") and the capability-level gate ("may this analysis run?") are different
  functions with different outputs, deliberately. Filtering the report to a capability's inputs
  would make an unrelated gap look like a reason an analysis was limited.
- **The prompt does not soften.** The model is told what it may work from; it is never relied on
  to notice what it should not.

## Alternatives considered

- **Put the ladder in the prompt.** Rejected: it converts a computed decision into an
  interpretation, it cannot be asserted in a test, and the failure mode — a plausible answer
  built on an assumed input — is precisely what ADR-0041 exists to prevent. It would also put
  the rule under the control of the thing the rule constrains.
- **Evaluate the gate inside the agent service.** Rejected: the gate needs the stored context,
  and the agent layer holds no repository. Giving it one would make the agent responsible for
  reading the user's data, which the module boundaries forbid. The route reads, the gate
  decides, the service refuses.
- **Let the model proceed but reduce its certainty.** Rejected, and explicitly: hedged wording
  does not make an unanswerable question answerable, it is harder to audit than a refusal, and
  it hides the gap from the user who most needed to see it.
- **Default to proceeding when the gate cannot be evaluated.** Rejected: it makes the guarantee
  hold only where it is cheap to keep. A server with no store refuses, and says so.
- **Filter the context-level report to the requested capability's inputs.** Rejected: the report
  answers a question about the declaration as a whole, and a capability-scoped version would
  report an unrelated gap as a limitation of an analysis that does not consume it.
- **Return a numeric input-quality score.** Rejected in the contract, not merely here: a score
  invites a threshold, a threshold is a product decision hidden in a constant, and a single
  number cannot say which of eight dimensions failed. The verdicts and the named counts are the
  quantified part.
- **Let a client send its own readiness.** Rejected: the route takes no readiness, no verdict
  and no subject. A client that could assert readiness could make the refusal disappear, which
  would make the whole layer decorative.
- **Treat "prefer not to say" as a missing input.** Rejected: it is a legitimate answer about a
  sensitive field and the product must not fill it by inference (ADR-0042). It is recorded as a
  refusal-to-say, it cannot stand in as an input, and the capability that needs it descends the
  ladder rather than substituting.
