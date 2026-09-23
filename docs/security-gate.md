# End-of-Phase-6 security gate

Phase 6 ended with an attack simulation rather than a review. 150 adversarial cases were executed
against the product as it stands after 6.1–6.6, in ten stages, each case an _attempt_ rather than a
description of one. This document is the method, the result and — the part that matters most — the
limits of what the result means.

**It is a completion criterion for Phase 6, not a phase.** Nothing in it is a new subsystem, a new
dependency or a new route: every case attacks code that already shipped, and the fixes are changes to
that code.

**It does not say the product is secure.** It says: these 150 attempts were made, one attack surface
does not exist yet, this is what was found, this is what was fixed, this is how each fix is kept
fixed, and this is what was not tested and why. Anything stronger would be a claim the run cannot
support.

- Findings and their permanent record: [security-knowledge-base.md](./security-knowledge-base.md)
- Current posture, boundary by boundary: [security-and-privacy.md](./security-and-privacy.md)
- The decision the main fix implements: [ADR-0057](./adr/ADR-0057-trust-is-granted-by-the-product-not-asserted-by-content.md)
- The machine-readable checkpoint: [security-gate-baseline.json](./security-gate-baseline.json)

## 1. How to run it

```bash
npx vitest run tests/security-gate        # the 150 attacks, and the gate criteria over them
npm test                                  # everything, including them
```

The suite is part of the default `npm test` run, so the gate is not a thing anyone has to remember.
`tests/security-gate/gate.test.ts` fails if a stage is short of its required attack count, if any
stage carries an unresolved CRITICAL or HIGH breach, if an attack id is missing or duplicated, or if
`docs/security-gate-baseline.json` disagrees with the run.

## 2. The harness

Five files, no new dependencies, no new npm script:

| File                                  | What it holds                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `harness.ts`                          | The verdict machinery: `blocked` / `breached` / `observe` / `refusalAttempt`, `executeAttack`, `stageGate`, `resultLine`, `report`. |
| `fixtures.ts`                         | Every synthetic principal, token, credential, record, file, vault and server the cases touch.                                       |
| `stages-01-02.ts` … `stages-09-10.ts` | The 150 cases, two stages per file.                                                                                                 |
| `gate.test.ts`                        | The runner: executes the stages, asserts the stage gates and the totals, and checks the recorded baseline.                          |

Three properties are enforced by the harness rather than promised by a comment:

- **A refusal must be observed, not assumed.** A case may only claim "the code refused" through
  `refusalAttempt`, which requires the call to _throw_ and lets the case name the message it expects —
  so a case cannot pass on an unrelated error, and a call that returns instead of refusing is a
  `breach` even if its return value looks benign.
- **A case that throws is a failure, not a pass.** An escaping error is reported as "the boundary
  crashed rather than refusing". A boundary that crashes is not a boundary.
- **Results are machine-readable.** Every attack renders as one line
  (`SEC-003 stage=1 category="Prompt injection" severity=HIGH status=PASS target="…" detection="…" regression=no`)
  and the run as one report, so a later pass can diff against this one rather than re-read prose.

Determinism comes from a fixed clock (`FIXED_NOW`), injected id factories, and no network, no
broker, no payment path and no third-party host anywhere in the suite. Where a case needs a real
database, it opens `:memory:`.

## 3. The sandbox boundary

Every attack remains inside the test process. Nothing reaches a real user, a real broker, a real
payment system, a production database, a production secret or a third-party service; there is no
network client in the suite at all. Principals, tokens, credentials, market data, memory records and
files are synthetic, and the one credential-shaped value that exists
(`tests/security-gate/fixtures.ts`, `SYNTHETIC_SECRET`) is obvious, namespaced as this product's own
tokens and valid nowhere.

The trading boundary is _attacked_ rather than assumed: the safety flags are literal `false` in
`DEFAULT_SAFETY_PROFILE`, the resolved configuration is asserted to agree, `assertSafeConfig` is
asserted to **refuse** a configuration that raises them, the orchestrator is asserted to refuse
construction with execution enabled, the route table is asserted to contain no financial route, and
the shell command allow-list is asserted to contain no command that can start a process. No case
attempts a financial action outside the fake boundary, because no execution path exists to attempt
one against.

## 4. The ten stages

| Stage | Theme                            | Cases | What the cases attack                                                                                                                                                                                                                                                                                                                   |
| ----- | -------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | Input & prompt injection         | 15    | The `system` message is composed only from the loaded instructions, `DECISION_POLICY` and the output contract; retrieved text arrives labelled as data inside the _user_ turn; the instruction section cannot be dropped; `MAX_USER_INPUT_CHARS` bounds input.                                                                          |
| 02    | Jailbreak & instruction override | 15    | Capability, role, trading, approval, tool, environment, secret-handling, execution, confirmation, fail-closed, desktop/native and sandbox restrictions.                                                                                                                                                                                 |
| 03    | Data leakage                     | 15    | Instructions, configuration, credentials, session material, another principal's records and files, vault descriptions, log lines, error bodies, diagnostics.                                                                                                                                                                            |
| 04    | Authentication & authorization   | 20    | Missing, malformed, expired, forged and revoked sessions; vertical and horizontal access; direct route and direct IPC access; capability bypass; ownership; persistence of privilege after logout and across restart.                                                                                                                   |
| 05    | Tool & API abuse                 | 20    | Tool inputs and registry boundaries, malformed and replayed calls, fake results, duplicate decisions, file policy ceilings, IPC command abuse, native command boundary, error paths, retry bounds.                                                                                                                                      |
| 06    | Memory & RAG poisoning           | 15    | False knowledge, trust laundering, promotion without a verifier, caller-asserted provenance, conflicting records, retrieval relevance, cross-principal ownership.                                                                                                                                                                       |
| 07    | Malicious external data          | 10    | Market-data payloads, imported files, structured provider responses, oversized bodies, parser failures, provenance spoofing, instruction-bearing prose.                                                                                                                                                                                 |
| 08    | Agentic / multi-step attack      | 15    | Chains: injection → context → memory → tool → data → action, and whether one step's success authorizes the next.                                                                                                                                                                                                                        |
| 09    | Resource & availability          | 10    | Request floods, oversized inputs and headers, restart storms, concurrent start and stop, context budget, loop induction.                                                                                                                                                                                                                |
| 10    | Full red-team simulation         | 15    | End-to-end attacker journeys: unauthenticated attacker, escalation, a compromised synthetic session, malicious import, poisoned record, manipulated payload, tool abuse, IPC boundary, secret extraction, cross-session persistence, approval bypass, repeated action, runtime compromise, combined memory+tool+auth, complete journey. |

## 5. Gate criteria

A stage is a gate, and the gate is not "everything passed":

- **zero unresolved CRITICAL**, and **zero unresolved HIGH** — a stage that fails either does not
  clear, and the runner names the attacks that failed it;
- MEDIUM and LOW findings are classified **FIXED / ACCEPTED / DEFERRED**, each with its reasoning
  written down;
- a vulnerability is not fixed until the attack is **reproduced, root-caused, fixed, given a
  regression test, re-tested and passing** — in that order;
- `NOT_APPLICABLE` is reported and **never counted as a pass**.

The runner additionally fails a stage for a MEDIUM or LOW breach, because an observed breach is an
observed breach. That is stricter than the gate requires, deliberately: if one is ever accepted it
must be recorded as accepted and the assertion relaxed on purpose, with the reasoning written down,
rather than left failing quietly.

## 6. Severity model

| Level    | Means                                                                                                                                                                                     | This gate's bar                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| CRITICAL | Authentication or authorization bypass, secret disclosure, arbitrary native execution, or any path to a real financial action.                                                            | Must be zero, unresolved, before the next stage.                               |
| HIGH     | A control the product documents as enforced can be defeated, or data crosses a boundary it is not permitted to cross (trust laundering, cross-principal access, credential reachability). | Must be zero, unresolved, before the next stage.                               |
| MEDIUM   | A limitation can be suppressed, a defence can be evaded in a way that needs an unusual caller, or a failure path throws where it should refuse.                                           | Classified and reasoned; fixed when the fix is small and behaviour-preserving. |
| LOW      | Honest robustness or hygiene, no confidentiality, integrity or availability consequence.                                                                                                  | Classified and reasoned.                                                       |

Severity is assigned by **impact**, not by how interesting the case was. VULN-002 is MEDIUM, not
HIGH, because the value in question is a declaration by definition and no access, role or
authorization boundary moves; VULN-001 is HIGH because the outcome is poison retrievable from the
tier the product reserves for verified knowledge.

## 7. Result

**150 attacks executed. 149 PASS. 0 FAIL. 1 NOT_APPLICABLE. All ten stages cleared.**

| Stage                               | Cases | Pass | Fail | N/A | Gate    |
| ----------------------------------- | ----- | ---- | ---- | --- | ------- |
| 01 Input & prompt injection         | 15    | 15   | 0    | 0   | CLEARED |
| 02 Jailbreak & instruction override | 15    | 15   | 0    | 0   | CLEARED |
| 03 Data leakage                     | 15    | 15   | 0    | 0   | CLEARED |
| 04 Authentication & authorization   | 20    | 20   | 0    | 0   | CLEARED |
| 05 Tool & API abuse                 | 20    | 20   | 0    | 0   | CLEARED |
| 06 Memory & RAG poisoning           | 15    | 14   | 0    | 1   | CLEARED |
| 07 Malicious external data          | 10    | 10   | 0    | 0   | CLEARED |
| 08 Agentic / multi-step attack      | 15    | 15   | 0    | 0   | CLEARED |
| 09 Resource & availability          | 10    | 10   | 0    | 0   | CLEARED |
| 10 Full red-team simulation         | 15    | 15   | 0    | 0   | CLEARED |

Findings: **0 CRITICAL, 1 HIGH (VULN-001, found and fixed before this run and re-tested here),
5 MEDIUM (VULN-002 … VULN-006, found by this run), 0 LOW. Six fixed, none accepted, none deferred.**
Each is in [security-knowledge-base.md](./security-knowledge-base.md) with its root cause, fix,
regression case and re-test result.

The number of failures that were _findings_ is smaller than the number of failures the first
execution produced, and the difference is the honest part of a gate: **eleven cases first failed
because they measured the wrong thing.** They are recorded in
`docs/security-gate-baseline.json` → `attacksChangedDuringThisGate` and in §8 below, because a
corrected test and a weakened test look identical in a diff that only shows the final state.

## 8. Cases corrected during the gate

In each of these the boundary already held and the assertion was wrong. None of them weakened a
check: every replacement is a stricter or more specific statement about the same boundary, and the
product code behind each is unchanged.

| Case    | What was wrong                                                                                                                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-028 | Scanned command names for `/shell/`, which matched `shell_status` and `shell_handshake` — the bridge's own words for _describing_ the shell. Now scans a process/path vocabulary.                                                                                                            |
| SEC-060 | Read `src-tauri/capabilities/default.json`; the shipped grant is `main.json`. The case failed with `ENOENT`, which read as a breach of the native boundary.                                                                                                                                  |
| SEC-078 | Sent exactly the policy ceiling — which the policy _allows_ — and called it "far larger". Now sends one byte past it, read from the policy rather than hard-coded.                                                                                                                           |
| SEC-080 | Expected 404 for a job id the principal may not read. The pipeline answers 403 first, which is a refusal to disclose, not a leak. Now asserts "not disclosed" and additionally that no payload came back.                                                                                    |
| SEC-081 | Expected a 4xx for an empty body that is valid by design (both fields optional). Now asserts the real boundary — a typed, curated, leak-free envelope whatever the status.                                                                                                                   |
| SEC-085 | Expected `assertSecretKey` to enforce _declaredness_. That rule lives in `assertKnownCredential`, which the credential store calls on every access. Now asserts both rules plus a positive control, so the case cannot pass by refusing everything.                                          |
| SEC-124 | Grepped `src/core/config.ts` for flag literals that are not written there (`DEFAULT_CONFIG.safety` _is_ `DEFAULT_SAFETY_PROFILE`). Now asserts the profile's literals, the resolved configuration, and that raising them is refused at boot.                                                 |
| SEC-126 | Read `config.rateLimit`, which does not exist, fell back to 60, and sent 65 requests against a real limit of 600 — measuring its own guess. Now sets a five-request window explicitly.                                                                                                       |
| SEC-127 | Same, and it also issued its session outside the server it presented the token to, so every request was a 401.                                                                                                                                                                               |
| SEC-143 | Same missing capability file as SEC-060.                                                                                                                                                                                                                                                     |
| SEC-144 | Read the echo of a caller-supplied correlation id as a secret leak. A value the caller sent is not disclosure. Now asserts what the boundary actually claims: a bounded id is echoed, and an oversized one is replaced rather than reflected.                                                |
| SEC-093 | Measured "provenance is not caller-controlled" by scanning the source for a dynamic `provenance.source`, which cannot distinguish a caller's claim from a row the product wrote itself. Now tests both doors behaviourally — the API schema and the store — which is how VULN-002 was found. |

## 9. NOT_APPLICABLE policy

One case, **SEC-098** (Stage 6, per-principal memory ownership), is `NOT_APPLICABLE`:

- **capability:** per-principal memory ownership;
- **why the surface is absent:** `MemoryMetadata` carries `subject`, `symbol` and `tags` but no owner
  id, and the store is constructed per process. There is no field to authorize against, so an
  ownership attack has no target — building one to make the case runnable would be inventing
  architecture, which is exactly what the policy forbids;
- **which phase may introduce it:** the phase that introduces multi-principal or shared memory.

It is counted in its own column, never in the pass column, and the runner asserts that the two counts
do not overlap. `NOT_APPLICABLE` is not evidence that the absent capability is safe.

## 10. Limitations

What this gate does not cover, stated so that nothing is read into the result that is not in it:

1. **No Rust toolchain on this host.** The Tauri host (`src-tauri/src/*.rs`) is not compiled or
   exercised; the gate audits the native surface from the outside — the capability file's grants, the
   command allow-list, the CSP and the presence of a single audited spawner — and `npm run
desktop:verify` checks parity between the Rust and TypeScript state machines. `npm run release:qa`
   reports `NOT_AVAILABLE` for every scenario this host cannot exercise, and that list is unchanged by
   this gate.
2. **No signed production release exists**, so nothing about update delivery from a real endpoint was
   tested. The updater is exercised through its state machine and the signing boundary is asserted to
   refuse a release, which is a statement about the _local_ refusal path only.
3. **No real network, no real broker, no real market data.** Every payload is synthetic. A provider's
   behaviour under hostile real input is untested, and untestable here.
4. **No load testing.** Stage 9 establishes that bounds exist and that failures are bounded and
   controlled; it does not measure throughput, memory ceilings or behaviour under sustained load.
   `maxRestarts`, request windows and cache value limits are asserted as rules, not as capacities.
5. **No fuzzing and no formal analysis.** The cases are written by hand, so a boundary that no one
   thought to attack is not covered by this run. Coverage is by intent, not by line.
6. **The Rust-side supervision loop is asserted, not driven.** VULN-005 and VULN-006 were found and
   fixed in `src/desktop/sidecar.ts`, the TypeScript expression of the same policy that the shell
   implements; the Rust implementation of `handleExit`/`stop` is compared for state parity but was not
   itself driven through the same concurrent sequences.
7. **Session and credential behaviour is in-memory.** Nothing survives a restart, which several cases
   assert — but that means "privilege persistence across restart" is tested by showing the store has
   no persistence, not by attacking a durable session store. A durable one would need its own pass.

## 11. Deferred work

| Item                                                                           | Why deferred                                                                                                                                                                                               | Where it would be tested                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Multi-principal memory ownership                                               | The capability does not exist (SEC-098).                                                                                                                                                                   | The stage that introduces shared memory.                        |
| Provider-sourced prices end-to-end                                             | No provider path can write a price row; VULN-002 fixes the doors that exist today. When one is added, its provenance must be produced by the product, and the writer guard is where that will be enforced. | The phase that wires a market-data provider into the portfolio. |
| Durable session material                                                       | Sessions are in-memory by design in this build; attacking persistence needs persistence.                                                                                                                   | The phase that adds a session store.                            |
| Fuzzing the parsers                                                            | Stage 7 covers malformed and oversized input by construction; a fuzzer would cover the space between the cases.                                                                                            | Any pass with a fuzzing harness available.                      |
| Driving the Rust state machine through the same sequences as VULN-005/VULN-006 | No Rust toolchain on this host.                                                                                                                                                                            | CI on a host with the toolchain, or a Windows release machine.  |

## 12. Regression policy

The 150 cases are a **baseline, not a ceiling**:

- every case stays in the suite forever, including the ones that pass trivially;
- a confirmed vulnerability adds a case that **fails on the old code**, and that case stays too
  (VULN-001 → SEC-087, VULN-002 → SEC-093, VULN-003 → SEC-016, VULN-004 → SEC-035, VULN-005 →
  SEC-129, VULN-006 → SEC-131);
- attack ids are permanent. `SEC-###` is a citation in the knowledge base, in comments in the code and
  in the baseline; renumbering one would silently point a finding at nothing, so
  `gate.test.ts` asserts the ids are contiguous, unique and complete;
- `docs/security-gate-baseline.json` records the counts, the N/A declarations and the regression
  mapping, and is asserted against the run, so the checkpoint cannot drift from the suite.

## 13. Future attack-surface expansion

Named now, so a later pass knows what this one deliberately left alone:

- **the model itself** — VULN-001 and the Stage 6 cases attack the _store_ and the _prompt assembly_,
  not a live model's willingness to be persuaded. A red-team pass against a configured hosted
  provider, with the same synthetic fixtures, would be a separate exercise with its own cost and rate
  limits;
- **the WebSocket surface** (`src/realtime`) and **the job queue** under hostile input, beyond the
  bounds asserted in Stage 9;
- **the update path** once a real endpoint and a real key exist, including a hostile (or downgrade)
  update manifest;
- **plugin or capability extension** if the capability catalogue ever becomes open;
- **multi-principal everything** the moment more than one principal shares a process;
- **a fuzzing harness** over the parsers and the IPC argument validators, to cover the input space the
  hand-written cases sample.

## 14. What this gate concludes

Tested: the boundaries listed in §4, in an isolated process, with synthetic data, by 150 adversarial
cases that attempt rather than describe.

Fixed: six confirmed findings, each with a reproduction, a root cause, a change, a regression case
and a re-test (§7 and the knowledge base).

Remains: one attack surface that does not exist yet (SEC-098, declared rather than skipped), and the
limitations in §10 — of which "no real network, no real broker, no real deployment, no Rust toolchain
on this host" is the substantive part.

Not applicable: the per-principal memory ownership case, and nothing else.

**The product is not described here as secure.** What is described is a set of attacks that were made,
a set of defects that were found and closed, and a suite that keeps them closed.
