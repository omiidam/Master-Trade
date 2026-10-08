/**
 * Generate the Needle 3 runtime training dataset (Phase 2.14.B).
 *
 * `training-data/decision-router.jsonl` is the Phase 2.12-A artefact and
 * stays exactly as it is: its `instruction` / `input` / `output{intent,
 * route, requires_llm}` shape is the taxonomy contract, validated by
 * `parseDecisionRouterJsonl`, and nothing here rewrites it.
 *
 * The fine-tune needs the same labels in the shape the Cactus CLI trains
 * and runs in — `query` plus `answers`, where the answer carries the full
 * six-field decision the runtime schema requires (`confidence` and
 * `reason` included, which the taxonomy record does not carry). This tool
 * derives that file, so the runtime dataset is reproducible from the
 * protected one rather than hand-maintained beside it.
 *
 *     node tools/needle3-router-dataset.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = join(root, 'training-data', 'decision-router.jsonl');
const target = join(root, 'training-data', 'decision-router-needle.jsonl');

/** The two flags each route implies — the same table `ROUTE_FLAGS` carries. */
const ROUTE_FLAGS = {
  LOCAL_RESPONSE: [false, false],
  MEMORY_RETRIEVAL: [false, false],
  TOOL_REQUIRED: [false, true],
  LLM_GATEWAY: [true, false],
  BLOCK: [false, false],
};

/** One short, bounded reason per intent: a machine justification, never an answer. */
const REASON = {
  NON_TRADING: 'Greeting or unrelated request.',
  TRADING_EDUCATION: 'Educational question about trading.',
  MARKET_ANALYSIS: 'Analysis of the market itself.',
  PORTFOLIO_ANALYSIS: 'Question about a portfolio.',
  RISK_MANAGEMENT: 'Risk discipline question.',
  TRADE_JOURNAL: 'Review of recorded trades.',
  MARKET_DATA_REQUEST: 'Request for market data.',
  SYSTEM_REQUEST: 'AI Workplace system request.',
};

/** The confidence the curated labels carry; above the runtime's safety threshold. */
const CONFIDENCE = 90;

const lines = readFileSync(source, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '');

const records = lines.map((line, index) => {
  const record = JSON.parse(line);
  const { intent, route, requires_llm: requiresLlm } = record.output;
  const flags = ROUTE_FLAGS[route];
  if (flags === undefined) throw new Error(`line ${index + 1}: unknown route ${route}`);
  if (flags[0] !== requiresLlm) {
    throw new Error(`line ${index + 1}: requires_llm contradicts route ${route}`);
  }
  const reason = REASON[intent];
  if (reason === undefined) throw new Error(`line ${index + 1}: unknown intent ${intent}`);
  return JSON.stringify({
    query: record.input,
    tools: [],
    answers: {
      intent,
      route,
      confidence: CONFIDENCE,
      reason,
      requires_llm: flags[0],
      requires_tool: flags[1],
    },
  });
});

writeFileSync(target, `${records.join('\n')}\n`);
console.log(`wrote ${records.length} records to ${target}`);
