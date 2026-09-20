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
import type { ValidationResult } from './contracts.js';

export const MAX_MESSAGE_LENGTH = 8_000;
export const MAX_ID_LENGTH = 128;
export const MAX_TEXT_LENGTH = 4_000;

const identifier = z.string().trim().min(1).max(MAX_ID_LENGTH);

/** POST /v1/agent/messages */
export const agentChatBodySchema = z.strictObject({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  conversationId: identifier.optional(),
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
