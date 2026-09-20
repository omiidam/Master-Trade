# ADR-0034 — Loading, empty and error are designed states, not omissions

- **Status:** Accepted
- **Phase:** 3.7 (preview prototype)
- **Decision id:** `DEC-FE-8-STATES`
- **Refines:** `DEC-FE-5-MOTION` (ADR-0020) and the design-system decisions of Phase 3.2

## Context

A prototype is usually reviewed on its happy path: populated cards, a full table, a
plausible number in every field. The states a user actually meets first — waiting,
nothing-yet, and it-broke — are the ones left to a spinner and a string.

That is a poor trade for this product specifically. Master Trade's central claim is
that the interface tells the truth about what it knows: facts against hypotheses,
provenance against real data, permission denials against failures. An interface that
cannot distinguish "no lessons exist" from "the curriculum did not load" has already
broken that claim, and it breaks it in the place a user is most likely to be
confused.

## Decision

Every data surface ships three designed states, built from the same components the
wired version will use:

- **Loading** — skeletons that match the shape of the coming content, so the layout
  does not jump; no provisional number, because a number that later changes reads as
  a finished fact.
- **Empty** — a successful read that found nothing, saying _why_ it is empty.
  "Nothing exists" and "nothing loaded" must never look alike.
- **Error** — the typed backend code shown as evidence, with a retry offered **only**
  when retrying can help. A refused credential is stated, not re-offered.

`web/src/components/InterfaceStates.tsx` exhibits them with the real components, and
each page carries the subset its surfaces can actually reach. A page that can never
reach a state does not render it — a drawn state with no behaviour behind it is its
own kind of lie.

Fixtures follow the same rule: mock data is rendered only inside a panel that labels
it, at the same visual weight as the sentence saying the stream is not live, and no
code path routes a fixture into the live store.

## Alternatives rejected

- **One generic `<Spinner/>` for every wait.** Discards the information a user needs
  most: whether the thing they are waiting for is a fast read or a slow job.
- **A single "no data" message for empty and error.** These demand different actions
  from the user, and merging them guarantees at least one is wrong.
- **Shells only for the happy path, states "handled later".** They are never handled
  later; and in this product the failure states are the ones that carry the safety
  claims.
- **Showing plausible placeholder numbers while loading.** Fastest to build and the
  most damaging: it is the interface asserting a value it has not read.

## Consequences

Reviewing the prototype now includes reviewing failure, and the components for those
states are exercised before the API they will sit behind exists. The cost is that
each new surface owes three designs instead of one, which is the intended trade: the
alternative was discovering the failure design during an incident.
