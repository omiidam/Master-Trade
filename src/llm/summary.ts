/**
 * Structured summary contract.
 *
 * This is the **only** shape model output may take on its way into the product.
 * A model answers with a JSON object conforming to `OUTPUT_CONTRACT`; anything
 * else is refused. Three properties are enforced here rather than requested of
 * the model:
 *
 *   1. **No chain-of-thought.** Deliberation is not accepted, in any of its
 *      disguises: not as a JSON field, not as a `<thinking>` block inside a
 *      statement. A provider that sends it gets a policy error, and the run
 *      surfaces nothing rather than a partial answer.
 *   2. **The model cannot label its own claims as fact.** A `fact` statement must
 *      cite at least one source; an unsourced assertion is a validation error.
 *      Facts in this system come from deterministic tools, so a model that claims
 *      one without a source is making exactly the mistake the system exists to
 *      prevent.
 *   3. **Uncertainty is a first-class field.** An answer that knows it does not
 *      know says so in `uncertainty`, which the interface renders — it is not
 *      something a model can quietly leave out.
 *
 * `structure` and `label` are deliberately separate concerns: this module decides
 * what the model is allowed to hand over, `src/agent/*` decides what may be done
 * with it.
 */

import { AppError } from '../core/errors.js';
import type { EpistemicKind } from '../types.js';
import type { LlmToolCall } from './provider.js';

export const EPISTEMIC_KINDS: readonly EpistemicKind[] = [
  'fact',
  'analysis',
  'hypothesis',
  'uncertainty',
];

/** The four fields an answer may contain, and nothing else. */
export const SUMMARY_KEYS = ['headline', 'statements', 'uncertainty', 'toolRequests'] as const;

/** The three fields a statement may contain, and nothing else. */
export const STATEMENT_KEYS = ['kind', 'text', 'sources'] as const;

/** A tool request may contain exactly these. */
export const TOOL_REQUEST_KEYS = ['toolName', 'arguments', 'purpose'] as const;

/** True when `key` is one of the names used for hidden reasoning. */
export function isReasoningKey(key: string): boolean {
  return (FORBIDDEN_REASONING_KEYS as readonly string[]).includes(
    key.toLowerCase().replace(/[- ]/g, '_'),
  );
}

/**
 * Field names that mean "here is my private reasoning". They are rejected by
 * name so the failure is explicit and greppable, not a generic shape error.
 */
export const FORBIDDEN_REASONING_KEYS = [
  'reasoning',
  'reasoning_content',
  'reasoningcontent',
  'reasoning_details',
  'chain_of_thought',
  'chainofthought',
  'cot',
  'thinking',
  'thoughts',
  'scratchpad',
  'internal_monologue',
] as const;

/** Inline deliberation markup some models emit inside a normal text field. */
export const REASONING_BLOCK_PATTERN = /<(thinking|analysis|scratchpad|reasoning)>[\s\S]*?<\/\1>/gi;

export interface StructuredSummaryStatement {
  kind: EpistemicKind;
  text: string;
  /** Deterministic sources backing the statement (tool names, section ids…). */
  sources: string[];
}

export interface StructuredSummaryToolRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  /** Why the model wants it. Null when the provider sent a bare tool call. */
  purpose: string | null;
}

export interface StructuredSummary {
  headline: string;
  statements: StructuredSummaryStatement[];
  uncertainty: string[];
  toolRequests: StructuredSummaryToolRequest[];
}

export const MAX_HEADLINE_LENGTH = 300;
export const MAX_STATEMENT_LENGTH = 2_000;
export const MAX_STATEMENTS = 12;
export const MAX_UNCERTAINTY = 12;

/** The instruction text injected into the system prompt. */
export const OUTPUT_CONTRACT = [
  'OUTPUT CONTRACT — you must obey all of it:',
  '1. Reply with a single JSON object and nothing else. No prose around it, no code fence.',
  '2. Its keys are exactly: "headline" (string), "statements" (array), "uncertainty" (array of strings), "toolRequests" (array).',
  '3. Each statement is {"kind": "fact" | "analysis" | "hypothesis" | "uncertainty", "text": string, "sources": string[]}.',
  '   A statement labelled "fact" MUST cite at least one source and that source must be a deterministic',
  '   tool result or a retrieved record — never your own recollection. If you have no source, label it analysis.',
  '4. List what you do not know, cannot verify or are unsure about in "uncertainty". Leaving it empty when you are',
  '   unsure is a failure, not a style choice.',
  '5. To use a tool, put {"toolName": string, "arguments": object, "purpose": string} in "toolRequests".',
  '   You may only REQUEST a tool. You cannot execute one: an external component checks permissions and runs it.',
  '   Never state a result you have not received.',
  '6. Never include your reasoning, deliberation, plan, scratchpad or chain of thought — not as a field, not in',
  '   text, not in <thinking> tags. Only the four keys above. A response containing reasoning is rejected in full.',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Remove inline deliberation markup, reporting whether anything was removed. */
export function stripReasoningBlocks(text: string): { text: string; stripped: boolean } {
  const cleaned = text.replace(REASONING_BLOCK_PATTERN, '');
  return { text: cleaned.trim(), stripped: cleaned !== text };
}

/**
 * Text fields must be free of deliberation markup. The block is removed and the
 * response is refused — quietly stripping it would hide a contract violation and
 * reward the wrong behaviour.
 */
function assertNoReasoningText(raw: string, field: string): string {
  const { text, stripped } = stripReasoningBlocks(raw);
  if (stripped) {
    throw new AppError(
      'POLICY_VIOLATION',
      `model output carried chain-of-thought in "${field}"; reasoning is never accepted or exposed`,
      { details: { field } },
    );
  }
  return text;
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_FAILED', `summary field "${field}" must be a string`, {
      details: { field },
    });
  }
  const text = assertNoReasoningText(value, field);
  if (text.length === 0) {
    throw new AppError('VALIDATION_FAILED', `summary field "${field}" must not be empty`, {
      details: { field },
    });
  }
  if (text.length > maxLength) {
    throw new AppError(
      'VALIDATION_FAILED',
      `summary field "${field}" exceeds ${maxLength} characters`,
      {
        details: { field, length: text.length },
      },
    );
  }
  return text;
}

function parseStatements(value: unknown): StructuredSummaryStatement[] {
  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_FAILED', 'summary field "statements" must be an array');
  }
  if (value.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'an answer must contain at least one statement');
  }
  if (value.length > MAX_STATEMENTS) {
    throw new AppError('VALIDATION_FAILED', `too many statements (max ${MAX_STATEMENTS})`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new AppError('VALIDATION_FAILED', `statements[${index}] must be an object`);
    }
    for (const key of Object.keys(entry)) {
      if (STATEMENT_KEYS.includes(key as (typeof STATEMENT_KEYS)[number])) continue;
      if (isReasoningKey(key)) {
        throw new AppError(
          'POLICY_VIOLATION',
          `statement contains chain-of-thought field "${key}"; reasoning is never accepted or exposed`,
          { details: { field: `statements[${index}].${key}` } },
        );
      }
      throw new AppError('VALIDATION_FAILED', `statements[${index}] has unknown field "${key}"`, {
        details: { field: `statements[${index}].${key}` },
      });
    }
    const kind = entry.kind;
    if (typeof kind !== 'string' || !EPISTEMIC_KINDS.includes(kind as EpistemicKind)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `statements[${index}].kind must be one of: ${EPISTEMIC_KINDS.join(', ')}`,
        { details: { field: `statements[${index}].kind` } },
      );
    }
    const text = requireString(entry.text, `statements[${index}].text`, MAX_STATEMENT_LENGTH);
    const rawSources = entry.sources ?? [];
    if (!Array.isArray(rawSources)) {
      throw new AppError('VALIDATION_FAILED', `statements[${index}].sources must be an array`);
    }
    const sources = rawSources.map((source, position) => {
      if (typeof source !== 'string' || source.trim().length === 0) {
        throw new AppError(
          'VALIDATION_FAILED',
          `statements[${index}].sources[${position}] must be a non-empty string`,
        );
      }
      return source.trim();
    });
    if (kind === 'fact' && sources.length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        `statements[${index}] claims to be a fact without a source; deterministic sources are required for facts`,
        { details: { field: `statements[${index}].sources` } },
      );
    }
    return { kind: kind as EpistemicKind, text, sources };
  });
}

function parseUncertainty(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new AppError(
      'VALIDATION_FAILED',
      'summary field "uncertainty" must be an array of strings',
    );
  }
  if (value.length > MAX_UNCERTAINTY) {
    throw new AppError('VALIDATION_FAILED', `too many uncertainty notes (max ${MAX_UNCERTAINTY})`);
  }
  return value.map((entry, index) =>
    requireString(entry, `uncertainty[${index}]`, MAX_STATEMENT_LENGTH),
  );
}

function parseToolRequests(value: unknown): StructuredSummaryToolRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_FAILED', 'summary field "toolRequests" must be an array');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new AppError('VALIDATION_FAILED', `toolRequests[${index}] must be an object`);
    }
    for (const key of Object.keys(entry)) {
      if (TOOL_REQUEST_KEYS.includes(key as (typeof TOOL_REQUEST_KEYS)[number])) continue;
      if (isReasoningKey(key)) {
        throw new AppError(
          'POLICY_VIOLATION',
          `tool request contains chain-of-thought field "${key}"; reasoning is never accepted or exposed`,
          { details: { field: `toolRequests[${index}].${key}` } },
        );
      }
      throw new AppError('VALIDATION_FAILED', `toolRequests[${index}] has unknown field "${key}"`, {
        details: { field: `toolRequests[${index}].${key}` },
      });
    }
    const toolName = requireString(entry.toolName, `toolRequests[${index}].toolName`, 120);
    const args = entry.arguments ?? {};
    if (!isRecord(args)) {
      throw new AppError('VALIDATION_FAILED', `toolRequests[${index}].arguments must be an object`);
    }
    const purpose =
      typeof entry.purpose === 'string' && entry.purpose.trim().length > 0
        ? assertNoReasoningText(entry.purpose, `toolRequests[${index}].purpose`)
        : null;
    return { toolName, arguments: args, purpose };
  });
}

/** Strip a ```json fence if the model wrapped its answer in one. */
export function unfence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match?.[1] !== undefined ? match[1].trim() : trimmed;
}

/**
 * Parse a model answer into the summary contract. Every rejection is typed:
 * `POLICY_VIOLATION` for deliberation, `VALIDATION_FAILED` for shape, and an
 * unparseable body is a validation failure too — we never fall back to showing
 * the raw text, because the raw text is the thing the contract exists to filter.
 */
export function parseStructuredSummary(raw: string): StructuredSummary {
  if (typeof raw !== 'string') {
    throw new AppError('VALIDATION_FAILED', 'model output must be a string');
  }
  const body = unfence(raw);
  if (body.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'model output was empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new AppError(
      'VALIDATION_FAILED',
      'model output is not the agreed JSON summary; refusing to display free-form text',
    );
  }
  if (!isRecord(parsed)) {
    throw new AppError('VALIDATION_FAILED', 'model output must be a JSON object');
  }

  for (const key of Object.keys(parsed)) {
    if (SUMMARY_KEYS.includes(key as (typeof SUMMARY_KEYS)[number])) continue;
    if (isReasoningKey(key)) {
      throw new AppError(
        'POLICY_VIOLATION',
        `model output contains chain-of-thought field "${key}"; reasoning is never accepted or exposed`,
        { details: { field: key } },
      );
    }
    throw new AppError('VALIDATION_FAILED', `model output has unknown field "${key}"`, {
      details: { field: key },
    });
  }

  return {
    headline: requireString(parsed.headline, 'headline', MAX_HEADLINE_LENGTH),
    statements: parseStatements(parsed.statements),
    uncertainty: parseUncertainty(parsed.uncertainty),
    toolRequests: parseToolRequests(parsed.toolRequests),
  };
}

function dedupeToolRequests(
  requests: readonly StructuredSummaryToolRequest[],
): StructuredSummaryToolRequest[] {
  const seen = new Set<string>();
  const unique: StructuredSummaryToolRequest[] = [];
  for (const request of requests) {
    const key = `${request.toolName}:${JSON.stringify(request.arguments)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(request);
  }
  return unique;
}

/**
 * Turn a provider response into a summary.
 *
 * A turn that consists only of tool calls carries **no answer yet**: `statements`
 * is empty and `headline` is empty. That is deliberate — the deterministic result
 * is not in hand, and a model's guess at it would be the one thing this system
 * must never present.
 */
export function summarizeModelOutput(response: {
  text: string;
  toolCalls: readonly LlmToolCall[];
}): StructuredSummary {
  const providerRequests: StructuredSummaryToolRequest[] = response.toolCalls.map((call) => ({
    toolName: call.toolName,
    arguments: call.arguments,
    purpose: null,
  }));

  if (response.text.trim().length === 0) {
    if (providerRequests.length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'model returned neither an answer nor a tool request',
      );
    }
    return {
      headline: '',
      statements: [],
      uncertainty: [],
      toolRequests: providerRequests,
    };
  }

  const summary = parseStructuredSummary(response.text);
  return {
    ...summary,
    toolRequests: dedupeToolRequests([...summary.toolRequests, ...providerRequests]),
  };
}

/** True when the turn asked for tool work and produced no answer of its own. */
export function isToolOnlyTurn(summary: StructuredSummary): boolean {
  return summary.statements.length === 0 && summary.toolRequests.length > 0;
}
