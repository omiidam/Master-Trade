/**
 * Validation layer (ADR-0015).
 *
 * Zod is the single runtime validator. Fastify's own body validation is
 * deliberately **disabled** so exactly one schema decides whether a request is
 * well-formed — two validators that can disagree are an authorization-adjacent
 * risk, and Ajv schemas cannot be inferred into TypeScript types.
 *
 * Rules:
 * - one schema per payload, beside the route that uses it;
 * - static types come from `z.infer`, so shape and check cannot drift;
 * - unknown keys are rejected (`.strict`), because a silently-ignored field is a
 *   field a client will eventually rely on;
 * - issue messages are safe to return (field + reason), never a stack trace or
 *   an echoed payload.
 */

import { z } from 'zod';
import { portfolioDocumentInputSchema } from '../portfolio/model.js';
import {
  DECISION_EVALUATION_REASONS,
  DECISION_KINDS,
  decisionRecordSchema,
} from '../decisions/model.js';
import { FIELD_KEYS, tradingContextSchema } from '../profile/model.js';
import { ANALYSIS_TYPES } from '../quality/readiness.js';
import { MAX_MOVEMENT } from '../usage/credits.js';
import { FEATURE_IDS } from '../usage/features.js';
import { PLAN_IDS, SUBSCRIPTION_STATUSES } from '../usage/plans.js';
import {
  GUIDANCE_DETAILS,
  GUIDANCE_NOTES,
  GUIDANCE_STRUCTURES,
  GUIDANCE_TERMINOLOGY,
  GUIDANCE_TONES,
} from '../language/guidance.js';
import { RESPONSE_LANGUAGES } from '../types.js';
import type { ValidationResult } from './contracts.js';

export const MAX_MESSAGE_LENGTH = 8_000;
export const MAX_ID_LENGTH = 128;
export const MAX_TEXT_LENGTH = 4_000;

/**
 * The two closed vocabularies, presented to Zod as tuples.
 *
 * `z.enum` needs a non-empty tuple and these arrays are the single source of the
 * vocabulary, so the cast is the price of not writing the list a second time — which
 * is the alternative that actually drifts. Declared before the schemas that use them,
 * because a schema is built when the module loads.
 */
const ANALYSIS_TYPES_AS_ENUM = [...ANALYSIS_TYPES] as [
  (typeof ANALYSIS_TYPES)[number],
  ...(typeof ANALYSIS_TYPES)[number][],
];
const FEATURE_IDS_AS_ENUM = [...FEATURE_IDS] as [
  (typeof FEATURE_IDS)[number],
  ...(typeof FEATURE_IDS)[number][],
];
const PLAN_IDS_AS_ENUM = [...PLAN_IDS] as [
  (typeof PLAN_IDS)[number],
  ...(typeof PLAN_IDS)[number][],
];
const SUBSCRIPTION_STATUSES_AS_ENUM = [...SUBSCRIPTION_STATUSES] as [
  (typeof SUBSCRIPTION_STATUSES)[number],
  ...(typeof SUBSCRIPTION_STATUSES)[number][],
];
const FIELD_KEYS_AS_ENUM = [...FIELD_KEYS] as [
  (typeof FIELD_KEYS)[number],
  ...(typeof FIELD_KEYS)[number][],
];
const RESPONSE_LANGUAGES_AS_ENUM = [...RESPONSE_LANGUAGES] as [
  (typeof RESPONSE_LANGUAGES)[number],
  ...(typeof RESPONSE_LANGUAGES)[number][],
];
const GUIDANCE_TONES_AS_ENUM = [...GUIDANCE_TONES] as [
  (typeof GUIDANCE_TONES)[number],
  ...(typeof GUIDANCE_TONES)[number][],
];
const GUIDANCE_DETAILS_AS_ENUM = [...GUIDANCE_DETAILS] as [
  (typeof GUIDANCE_DETAILS)[number],
  ...(typeof GUIDANCE_DETAILS)[number][],
];
const GUIDANCE_TERMINOLOGY_AS_ENUM = [...GUIDANCE_TERMINOLOGY] as [
  (typeof GUIDANCE_TERMINOLOGY)[number],
  ...(typeof GUIDANCE_TERMINOLOGY)[number][],
];
const GUIDANCE_STRUCTURES_AS_ENUM = [...GUIDANCE_STRUCTURES] as [
  (typeof GUIDANCE_STRUCTURES)[number],
  ...(typeof GUIDANCE_STRUCTURES)[number][],
];
/**
 * The note ids, as a tuple.
 *
 * The *keys* of the catalogue rather than a second list of them: an id that has no note text cannot be
 * sent, because it cannot be written down here, and a note that no id reaches cannot be applied by any
 * caller. The two halves of the contract are therefore one list.
 */
const GUIDANCE_NOTE_IDS_AS_ENUM = Object.keys(GUIDANCE_NOTES) as [
  keyof typeof GUIDANCE_NOTES,
  ...(keyof typeof GUIDANCE_NOTES)[],
];

/**
 * The style a caller resolved for a turn (Phase 7.5.3.4.2).
 *
 * Strict, and documented here for the same reason the whole validation layer is: this object selects which
 * closed instructions the model reads, so an unknown key is not a field to ignore — it is a caller
 * believing it changed something. Every value is a member of a closed vocabulary and every note is an id
 * from `@shared/language/guidance`, which is what makes it impossible for a client to *author* wording: it
 * can choose, and the sentences it chooses between are ours.
 */
export const responseStyleBodySchema = z.strictObject({
  tone: z.enum(GUIDANCE_TONES_AS_ENUM),
  detail: z.enum(GUIDANCE_DETAILS_AS_ENUM),
  terminology: z.enum(GUIDANCE_TERMINOLOGY_AS_ENUM),
  structure: z.enum(GUIDANCE_STRUCTURES_AS_ENUM),
  /**
   * The notes to apply. A list rather than a set, because the order is the order a response stage should
   * read them in, and bounded because the catalogue is small: a caller sending more notes than exist is
   * sending something that is not a style.
   */
  notes: z.array(z.enum(GUIDANCE_NOTE_IDS_AS_ENUM)).max(Object.keys(GUIDANCE_NOTES).length),
});

export type ResponseStyleBody = z.infer<typeof responseStyleBodySchema>;

const identifier = z.string().trim().min(1).max(MAX_ID_LENGTH);

/** POST /v1/agent/messages */
export const agentChatBodySchema = z.strictObject({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  conversationId: identifier.optional(),
  /**
   * The analysis the message is asking for, when it is asking for one.
   *
   * Optional, and its absence changes nothing: without it the agent is not gated,
   * exactly as before. With it, the deterministic readiness gate runs first and a
   * blocked input set means no model is consulted at all (ADR-0044).
   */
  analysisType: z.enum(ANALYSIS_TYPES_AS_ENUM).optional(),
  /**
   * The declared capability the message is asking for, when it is asking for one (Phase 5.7).
   *
   * A plain bounded string rather than an enum, deliberately: an unknown id must reach the
   * registry and be refused there, because capabilities are deny-by-default and a schema that
   * rejected an undeclared id would answer "unknown capability" instead of "nobody declared
   * it". `tests/capabilities.test.ts` pins that distinction.
   *
   * Supplying it changes the pipeline: the registry resolves it, the input gate runs for the
   * analysis type it declares, the role table's answer for its own operation is checked, and its
   * entitlement is resolved — all before a model is consulted. A refusal becomes a blocked turn
   * carrying the stage that produced it.
   */
  capabilityId: z.string().trim().min(3).max(64).optional(),
  /**
   * The language the answer must be written in, when the caller resolved one (Phase 7.5.3.4).
   *
   * Optional, and its absence changes nothing at all: the prompt is built exactly as it was, and the
   * model writes in whichever language it would have written in. When it is present it is a *wording*
   * instruction to the model and nothing else — every fact, figure, tool result, permission, safety rule
   * and uncertainty note keeps its value, and a refusal stays a refusal.
   *
   * It is supplied by the caller because the signals that decide it are the caller's: the request inside
   * the message, the person's own language choice, what their previous turns showed, and the reading of
   * the message. Resolving it here would mean reading a person's preference on the server, which is the
   * one place it does not live.
   */
  responseLanguage: z.enum(RESPONSE_LANGUAGES_AS_ENUM).optional(),
  /**
   * How the answer must be worded, when the caller resolved a style (Phase 7.5.3.4.2).
   *
   * Optional, and its absence changes nothing: no style block is added to the prompt. When it is present it
   * is a set of choices from the product's own closed catalogues — a tone, a depth, a terminology style, a
   * structure and the ids of the notes to apply — so the caller selects the wording instructions and cannot
   * write one. It is a wording instruction and nothing else: facts, calculations, tool results, permissions,
   * safety rules, trading restrictions and uncertainty keep their exact values, whatever the style says.
   */
  responseStyle: responseStyleBodySchema.optional(),
  /**
   * The caller's own name for *this attempt*, when it may be retried.
   *
   * A turn costs a credit, so a retry must be recognisable as the same attempt rather
   * than a second one. Supplying the same key twice resolves to the first attempt — the
   * reservation is reused and nothing is charged again. It is in the body rather than a
   * header because the request pipeline validates bodies and does not read headers, and a
   * header nobody validates is a value nobody can rely on.
   */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

/** POST /v1/academy/lessons/:lessonId/complete */
export const lessonCompleteBodySchema = z.strictObject({
  lessonId: identifier,
  score: z.number().min(0).max(100).optional(),
});

/** POST /v1/rules/proposals */
export const ruleProposeBodySchema = z.strictObject({
  ruleText: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  hypothesis: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});

/** POST /v1/rules/proposals/:proposalId/activate */
export const ruleActivateBodySchema = z.strictObject({
  proposalId: identifier,
});

/**
 * PUT /v1/profile
 *
 * The whole context document, not a patch. A merge would mean "fields you did not
 * mention are unchanged", and a client that forgot a field would then be silently
 * keeping an old value — the exact silent-fill the profile rules forbid. Sending the
 * document makes the statement explicit.
 *
 * `version` and `createdAt` are omitted deliberately: the version is assigned by the
 * repository from the current row, so a client can neither choose nor replay it.
 */
export const profileContextBodySchema = z.strictObject({
  context: tradingContextSchema.omit({ version: true, createdAt: true }),
});

/** Path parameters (validated before the handler sees them). */
export const lessonParamsSchema = z.strictObject({
  lessonId: identifier,
});

export const proposalParamsSchema = z.strictObject({
  proposalId: identifier,
});

/** Background jobs (Phase 3.7). */
export const jobParamsSchema = z.strictObject({
  jobId: identifier,
});

/** Recorded decisions (Phase 5.6). */
export const decisionParamsSchema = z.strictObject({
  decisionId: identifier,
});

/**
 * `GET /v1/decisions` filters. `limit` is bounded for the same reason the job list's is:
 * an unbounded read is a way to make the server do unbounded work.
 */
export const decisionListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
  symbol: z.string().trim().min(1).max(20).optional(),
  kind: z.enum(DECISION_KINDS).optional(),
});

/** Why a fresh evaluation was asked for. A closed vocabulary, never free text. */
export const decisionEvaluateBodySchema = z.strictObject({
  reason: z.enum(DECISION_EVALUATION_REASONS).optional(),
});

/**
 * `GET /v1/jobs` filters. `limit` is bounded: the queue is long-lived, so an
 * unbounded read is a way to make the server do unbounded work.
 */
export const jobListQuerySchema = z.strictObject({
  kind: z.string().trim().min(1).max(120).optional(),
  status: z
    .enum(['queued', 'running', 'succeeded', 'failed', 'dead-letter', 'cancelled'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** `POST /v1/jobs/:jobId/cancel`. A reason is optional but recorded when given. */
export const jobCancelBodySchema = z.strictObject({
  reason: z.string().trim().max(500).optional(),
});

/**
 * Query parameters. `verbose=1` asks for health details and is only honoured for
 * an authenticated principal — anything else is answered with the coarse form.
 */
export const readinessQuerySchema = z.strictObject({
  verbose: z.enum(['0', '1']).optional(),
});

/**
 * POST /v1/quality/assess
 *
 * A body rather than a query, deliberately: `premises` is user-chosen context about
 * their own analysis, and anything in a URL ends up in access logs. The route is also
 * a POST because it *evaluates* rather than fetches — the shape of a decision depends
 * on the clock and on the server's own market-data capability, so it is not a
 * cacheable representation of a resource.
 */
export const qualityAssessBodySchema = z
  .strictObject({
    /** Absent means "assess every declared analysis type", which is what a panel wants. */
    analysisType: z.enum(ANALYSIS_TYPES_AS_ENUM).optional(),
    /**
     * Fields the user themselves declared a substitute for.
     *
     * Enumerated rather than free text: a premise is a declaration of intent, and the
     * wording the system uses for it is the system's own. Nothing user-written can
     * enter an assessment through this field.
     */
    premises: z.array(z.enum(FIELD_KEYS_AS_ENUM)).max(6).optional(),
  })
  .refine((body) => body.premises === undefined || body.analysisType !== undefined, {
    message:
      'premises name fields of a specific analysis, so they require analysisType to be given as well',
    path: ['premises'],
  });

/**
 * Usage and subscription (Phase 5.4).
 *
 * Every body here is **strict**, so a client cannot smuggle a balance, a plan or an
 * entitlement in alongside the fields the route reads. That is not defensiveness for its
 * own sake: the whole credit system rests on the server being the only thing that knows
 * what an account may spend, and a permissive schema would be the one place where a
 * client could try to say otherwise.
 */
export const usageHistoryQuerySchema = z.strictObject({
  /** Absent means every feature. Enumerated, so an unknown id is a validation error. */
  feature: z.enum(FEATURE_IDS_AS_ENUM).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * `POST /v1/usage/credits/adjust`
 *
 * `reference` is the decision the movement rests on and is required for that reason: an
 * adjustment with no stated basis is an unexplained change to somebody's allowance. The
 * route is approval-gated, so an operator also needs a recorded approval for it.
 */
export const usageAdjustBodySchema = z.strictObject({
  userId: identifier,
  amount: z
    .number()
    .int()
    .min(-MAX_MOVEMENT)
    .max(MAX_MOVEMENT)
    .refine((value) => value !== 0, { message: 'an adjustment of zero is not a movement' }),
  reference: z.string().trim().min(8).max(200),
});

/**
 * `POST /v1/usage/subscription`
 *
 * Changing a plan is the same class of act as adjusting credits — it changes what the
 * account may consume — so it carries the same requirement for a stated reference.
 */
export const usageSubscriptionBodySchema = z.strictObject({
  userId: identifier,
  planId: z.enum(PLAN_IDS_AS_ENUM),
  status: z.enum(SUBSCRIPTION_STATUSES_AS_ENUM),
  reference: z.string().trim().min(8).max(200),
});

/**
 * `PUT /v1/portfolio`
 *
 * The declaration of what the account holds. Strict, and for a sharper reason than
 * the usage bodies above: this document is the sole input to every figure the product
 * will show about a portfolio, so a key the schema ignored would be a user believing
 * they had recorded something the engine never read.
 *
 * Carried as a `PUT` rather than a `POST` because the composition is a single
 * document that is replaced as a whole — a redeclaration is a new version of the same
 * resource, not an append. There is no subject field: the portfolio belongs to the
 * authenticated principal.
 */
export const portfolioWriteBodySchema = portfolioDocumentInputSchema;

/**
 * `POST /v1/decisions` and `PUT /v1/decisions/:decisionId`
 *
 * The declaration of a decision. Strict for the same reason the portfolio document is,
 * and for one more: this record is what an evaluation is computed from, so a key the
 * schema ignored would be a user believing they had recorded evidence the engine never
 * read. There is no id, no status and no figure in the body — the server mints the id,
 * derives the status from the evaluation history, and computes every number. A client
 * that could send a result would be a client reporting its own performance.
 */
export const decisionWriteBodySchema = decisionRecordSchema;

/** GET routes carry no body; accept nothing but an empty object. */
export const emptyBodySchema = z.union([z.undefined(), z.record(z.string(), z.unknown())]);

export type AgentChatBody = z.infer<typeof agentChatBodySchema>;
export type LessonCompleteBody = z.infer<typeof lessonCompleteBodySchema>;
export type RuleProposeBody = z.infer<typeof ruleProposeBodySchema>;
export type RuleActivateBody = z.infer<typeof ruleActivateBodySchema>;
export type ReadinessQuery = z.infer<typeof readinessQuerySchema>;
export type JobParams = z.infer<typeof jobParamsSchema>;
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type JobCancelBody = z.infer<typeof jobCancelBodySchema>;
export type ProfileContextBody = z.infer<typeof profileContextBodySchema>;
export type QualityAssessBody = z.infer<typeof qualityAssessBodySchema>;
export type UsageHistoryQuery = z.infer<typeof usageHistoryQuerySchema>;
export type UsageAdjustBody = z.infer<typeof usageAdjustBodySchema>;
export type UsageSubscriptionBody = z.infer<typeof usageSubscriptionBodySchema>;
export type PortfolioWriteBody = z.infer<typeof portfolioWriteBodySchema>;
export type DecisionWriteBody = z.infer<typeof decisionWriteBodySchema>;
export type DecisionParams = z.infer<typeof decisionParamsSchema>;
export type DecisionListQuery = z.infer<typeof decisionListQuerySchema>;
export type DecisionEvaluateBody = z.infer<typeof decisionEvaluateBodySchema>;

/** Safe, stable text for one validation issue: `field: reason`. */
export function formatIssue(issue: { path: readonly PropertyKey[]; message: string }): string {
  const path = issue.path.length > 0 ? issue.path.join('.') : 'body';
  return `${path}: ${issue.message}`;
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(formatIssue);
}

/**
 * Adapt a Zod schema to the contract's `validateBody` shape, so the HTTP
 * transport and the in-process bridge run the *same* check.
 */
export function zodValidator<TSchema extends z.ZodType<unknown, unknown>>(
  schema: TSchema,
): (raw: unknown) => ValidationResult<z.output<TSchema>> {
  return (raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, issues: formatIssues(parsed.error) };
    return { ok: true, value: parsed.data };
  };
}
