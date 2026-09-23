# ADR-0057 — trust is granted by the product, never asserted by the content it describes

- **Status:** Accepted
- **Decision id:** `DEC-SEC-1-TRUST`
- **Phase:** 6.7 (end-of-Phase-6 security gate)
- **Depends on:** ADR-0006 (vector memory separate from structured records, trust-gated), ADR-0007
  (deny-by-default authorization and human approval), ADR-0044 (the gate runs before the model),
  ADR-0045 (plans are code and entitlement only narrows).

## Context

The Phase 6 security gate found the same mistake three times, in three registers. In each case the
rule existed, was documented, and was enforced at one door while another door stood open.

1. **An update kept a trust label it had not earned** (`VULN-001`, `src/vector/memory.ts`). The create
   path forced model-authored content to `unverified`. The update path spread the existing record and
   carried `existing.trust` forward, so writing over the _text_ of a `verified` record replaced the
   evidence while leaving the verdict. `query({ minTrust: 'verified' })` then returned model-authored
   text — poisoned content in the tier the product reserves for verified knowledge.
2. **A declared price could assert a provenance the product alone may grant** (`VULN-002`,
   `packages/shared/src/portfolio/model.ts`). The stored schema doubles as the shape the read path
   rebuilds from rows, so it must accept `system` and `market-data` sources and a raised trust. Nothing
   narrowed it for the _write_ path, where the caller is a client — so a caller could declare
   `source: 'market-data', trust: 'authoritative'`, have those two strings stored verbatim, and receive
   them back as the provenance of a number it typed. The readiness layer reads that label, and its
   `price-unverified` limitation fires only when trust is _not_ `verified` or `authoritative` — so the
   claim did not merely misdescribe a price, it **suppressed the finding that exists to say a user
   cannot supply this label**.
3. **A malformed instruction module stepped around the safety scan** (`VULN-003`,
   `src/instructions/loader.ts`). The scan iterated `module.content`. Nothing validated the document,
   so text under any other field was invisible to it: the set loaded, the authorizing language was
   never seen, and `renderInstructions` rendered `undefined`.

Read together they are one defect with three faces: **a label was accepted from the party it
labels.** A record's trust is decided by what wrote it, not by what the record says about itself. A
price's provenance is decided by the product that obtained it, not by the client that supplied the
number. An instruction set's safety is decided by scanning all of its text, which requires that the
document say where its text is.

The product already had the rule in the abstract — `promoteTrust()` refuses to let a model grant
`authoritative` trust, citing that "only a human verifier may grant authoritative trust" — and the
readiness layer states it for prices outright ("only a provider can attach a provenance label; a user
cannot declare a series into being verified"). What was missing was a general form of it that a
reviewer can apply to a field that does not exist yet.

## Decision

**A trust or provenance label is produced by the product from the act that created the data. It is
never read from the content, the caller or the document it describes.**

1. **Lowering is implicit; raising is an act.** A write may lower a record's trust to what it earned —
   `upsert` takes the lower of the incoming trust and the stored trust, and a write from a model starts
   at `unverified` whatever it claims. Raising a label is only ever `promote()`, which requires a
   non-model verifier and records who verified it.
2. **The declaration schema is not the stored schema.** Where a shape is both stored and declared, the
   declared half is narrowed to what a client can honestly say: `portfolioDeclaredPriceSchema` allows
   `user`/`derived` and the literal `unverified`. The stored half keeps accepting what the product
   itself produces, because the read path rebuilds from rows.
3. **The rule belongs to the writer, not to the validator in front of it.** The API body schema is one
   door and `PortfolioRepository.replace` is the other; the latter refuses an unearned claim
   independently, because it is the single function that writes a price row and a future caller could
   reach it without the first.
4. **A rule enforced by scanning text requires the text to be locatable.** `loadInstructions` validates
   the document — a set has modules, a module has a non-empty `id`, `version` and `content` — before the
   safety scan reads it, so no authorization can hide in a field the scan does not look at.
5. **A redaction rule must know the shapes its own product mints.** `SECRET_VALUE` recognises this
   product's session-token prefix (`mt_s_`), not only other vendors' formats (`VULN-004`). A rule that
   works for a secret you did not create and fails for the one you did is not a rule.

## Alternatives rejected, and why

- **Trust the caller, and make the label descriptive.** This is the status quo ante, and it is what
  the readiness layer's own reasoning rejects: if trust is a statement the caller makes about itself,
  the gate cannot be a gate, because the party being gated writes the input to it. It also makes the
  label useless downstream — a reader cannot distinguish "a provider said this" from "somebody typed
  this and said a provider said it".
- **Drop the label entirely for declared data.** Cleaner, and rejected because it loses real
  information the product has: a user _can_ honestly say whether a figure is their own or derived, and
  that distinction is worth carrying. The rule narrows what may be claimed rather than removing the
  field.
- **Keep the stored schema as the declaration schema and validate in the repository only.** One door
  instead of two, and rejected because the API schema is what the route's validator uses and what
  produces the field-level error a client sees. A rule enforced only downstream surfaces as a 500-class
  policy error after the request has been fully accepted, and it makes the _contract_ wrong rather than
  merely unchecked.
- **Sanitize on read: downgrade a suspicious label when the row is read back.** It puts the decision at
  the furthest possible point from the write, so every new reader must remember to apply it, and it
  makes stored data mean something different from what was written. The write is where the product knows
  who is asking; that is where the decision goes.
- **Reject a document whose instruction text is anywhere but `content` by convention and documentation.**
  A prose convention cannot refuse a load, and the failure mode for getting it wrong is silent — the set
  renders `undefined` and the scan passes. Validation is the only version of this that fails closed.
- **Broaden the logger's redaction to "anything that looks random".** Rejected as a false-positive
  machine: correlation ids, hashes, ids and base64 payloads all look random, and a redactor that eats
  legitimate diagnostics is one that gets switched off. Named shapes — including this product's own —
  are what can be enforced.

## Consequences

- **A field that carries a trust label has an owner.** Adding one to a schema now means answering "who
  is permitted to decide this, and where is that enforced?" — which is the question that was missing,
  not the answer.
- **Two-layer enforcement is deliberate duplication.** The declaration schema and the writer both refuse
  an unearned claim. They are not redundant: one produces the client's error, the other is the
  invariant. Removing either is a change to this decision, not a cleanup.
- **The declaration contract is narrower than the stored document**, so a round trip is not an identity
  — a client cannot post back what the product returned to it once the product has enriched a value
  itself. That is intended, and it is why the read and write shapes are named separately
  (`portfolioPriceSchema` / `portfolioDeclaredPriceSchema`).
- **A malformed instruction set now fails loudly** rather than loading with `undefined` rendered into
  the prompt. Any caller that was relying on lenient loading will be refused, which is the point.
- **The security gate's remaining findings were of a different kind** (`VULN-005`, `VULN-006`: two
  supervisor calls that threw where they should have refused). They are recorded in
  [security-knowledge-base.md](../security-knowledge-base.md) and are not part of this decision: this
  one is about where a label comes from, and those were about a failure path being total.
- **The gate itself is now part of the test suite** (`tests/security-gate`), with its baseline recorded
  in `docs/security-gate-baseline.json` and asserted against the run, so this decision is re-tested on
  every `npm test` rather than remembered.
