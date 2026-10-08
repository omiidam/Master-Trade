/**
 * Phase 2.14 — the decision pipeline as the AI Workplace displays it.
 *
 * These are contract reads of the surface's own source, the same style as the
 * other frontend suites: the rules below are the ones that would silently
 * break in a refactor of `AgentWorkspacePage`, because they are all about
 * what the page *shows* about a turn's decision rather than how it looks.
 *
 *   1. The decision the server reported travels into the transcript — the
 *      page maps `data.decision` onto the turn and renders it, so the tester
 *      sees the intent, the selected execution path and the confidence from
 *      the backend's own words.
 *   2. The sidebar names the layer that decided: Needle 3 with its
 *      confidence, the deterministic fallback with its code, or "router
 *      disabled" — the fallback is never silent.
 *   3. Cloud-LLM requirement is visible, and Agent Runtime status and the
 *      run id are already shown by the run record — the decision block adds
 *      to them rather than replacing them.
 *   4. Nothing about the model's disk layout or a credential is ever
 *      composed into the page: every word rendered about a decision comes
 *      from the response payload.
 *
 * The rendered behaviour of all of this (typing a real prompt, watching the
 * decision block appear) is covered end-to-end in
 * `tests/browser/decision-pipeline.e2e.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = join('web', 'src', 'pages', 'AgentWorkspacePage.tsx');

function source(): string {
  return readFileSync(PAGE, 'utf8');
}

/** The page with its block comments removed, so documentation of a rule is not read as the rule. */
function bare(): string {
  return source().replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('the decision pipeline display (Phase 2.14)', () => {
  it('types the decision the server sent onto the turn, without re-deriving it', () => {
    const page = bare();
    // The response's own decision field is carried into the turn...
    expect(page).toMatch(/data\.decision === undefined \? \{\} : \{ decision: data\.decision \}/);
    // ...and rendered from the turn, per message.
    expect(page).toMatch(/message\.decision\.intent/);
    expect(page).toMatch(/message\.decision\.executionPath/);
    expect(page).toMatch(/message\.decision\.confidence/);
  });

  it('shows whether the cloud LLM was required, and which layer decided', () => {
    const page = bare();
    expect(page).toMatch(/lastDecision\.requires_cloud_llm/);
    // Needle 3 with its confidence, the fallback with its code, and the
    // disabled state — the three sources the contract can carry.
    expect(page).toMatch(/Needle 3, confidence/);
    expect(page).toMatch(/deterministic fallback \(/);
    expect(page).toMatch(/router disabled/);
    expect(page).toMatch(/Decision router/);
  });

  it('keeps the Agent Runtime status and the run id visible beside the decision', () => {
    const page = bare();
    // The run record is what the status and run id come from — the decision
    // block is added to it, never instead of it.
    expect(page).toMatch(/runId: data\.run\.runId/);
    expect(page).toMatch(/runState: data\.run\.state/);
    expect(page).toMatch(/label="Agent status"|Agent status:/);
    expect(page).toMatch(/Last run/);
  });

  it('renders nothing about the decision that the page invented itself', () => {
    const page = source();
    // No fixture, no hard-coded classification: the only decision-shaped
    // literals in the page are labels for what the server sent. (The words
    // 'fallback', 'Needle 3' etc. appear only in strings describing fields.)
    expect(page).not.toMatch(/intent:\s*'/);
    expect(page).not.toMatch(/confidence:\s*\d/);
  });

  it('never composes a model path, a checkpoint name or an env var into the document', () => {
    const page = bare();
    expect(page).not.toMatch(/safetensors/);
    expect(page).not.toMatch(/checkpointPath/);
    expect(page).not.toMatch(/NEEDLE3_/);
    expect(page).not.toMatch(/import\.meta\.env/);
  });

  it('states the pipeline with the router in front of the runtime', () => {
    // The visible pipeline line names the layer order the phase specifies:
    // decision router first, then the unchanged Agent Loop and gateway.
    expect(source()).toMatch(/Decision Router → Agent Loop → LLM Gateway → Response/);
  });
});
