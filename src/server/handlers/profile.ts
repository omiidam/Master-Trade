/**
 * Profile handlers.
 *
 * Thin by design: the pipeline already authenticated, authorized and validated, so the
 * handler reads or appends and shapes the response. It never accepts a subject — the
 * principal is the only subject there is.
 *
 * Three deliberate behaviours:
 *
 *   1. **An unset profile is not a 404.** A user who has declared nothing has a
 *      context whose every field is `null`, and the honest answer is that document
 *      plus the questions it implies. Returning an error would hide exactly the
 *      information the Profile surface exists to show.
 *   2. **The assessment is computed on read.** Completeness, staleness and the weakest
 *      field are derived from the stored document against the freshness policy in
 *      force now. A stored percentage would freeze the policy that produced it.
 *   3. **No store, no answer.** With no repository configured the handler refuses with
 *      `PROVIDER_UNAVAILABLE` naming the missing capability, rather than falling back
 *      to an in-memory profile that would silently vanish on restart.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type { ProfileData, ProfileWriteData } from '../../../packages/shared/src/api/contracts.js';
import type { ProfileContextBody } from '../../../packages/shared/src/api/schemas.js';
import {
  assessContext,
  clarifyingPrompts,
  emptyContext,
  type TradingContext,
} from '../../../packages/shared/src/profile/model.js';
import type { Repositories } from '../../db/repositories/index.js';
import type { RouteHandler } from '../context.js';

export interface ProfileHandlerDeps {
  /** Absent when the server runs without a database handle. */
  repositories?: Repositories | undefined;
  now?: (() => number) | undefined;
}

const READ_NOTE =
  'The context below is what the user has declared, field by field. A field with no value is reported as missing rather than defaulted, and a value that has aged out of its freshness window is reported as stale.';

const WRITE_NOTE =
  'A new version was appended. Earlier versions are never rewritten, so the context this answer was given from stays recoverable.';

function store(deps: ProfileHandlerDeps): Repositories {
  if (deps.repositories === undefined) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'The profile store is not configured: the server was started without a database handle, so a profile cannot be read or changed.',
      { details: { capability: 'profile.store' } },
    );
  }
  return deps.repositories;
}

export function profileReadHandler(
  deps: ProfileHandlerDeps,
): RouteHandler<Record<string, unknown> | undefined, ProfileData> {
  return async ({ context }) => {
    const repositories = store(deps);
    const principal = context.principal;
    if (principal === null) {
      throw new AppError('UNAUTHENTICATED', 'A profile belongs to an authenticated user.');
    }

    const user = await repositories.identity.findUser(principal.id);
    if (user === null) {
      throw new AppError('NOT_FOUND', 'No account exists for the authenticated principal.', {
        details: { userId: principal.id },
      });
    }

    const now = (deps.now ?? (() => Date.now()))();
    const current = await repositories.profile.current(user.id);
    const tradingContext = current?.context ?? emptyContext(new Date(now).toISOString());
    const assessment = assessContext(tradingContext, now);
    const history = await repositories.profile.versions(user.id, 20);

    context.logger.info(
      'profile read',
      {
        userId: user.id,
        contextSet: current !== null,
        version: current?.version ?? 0,
        completionPercent: assessment.completionPercent,
        weakest: assessment.weakest,
        gaps: assessment.gaps.length,
      },
      'profile.read',
    );

    return {
      data: {
        userId: user.id,
        displayName: user.display_name,
        timezone: user.timezone,
        contextSet: current !== null,
        version: current?.version ?? 0,
        context: tradingContext,
        assessment,
        prompts: clarifyingPrompts(assessment),
        history: history.map((row) => ({
          version: row.version,
          createdAt: row.created_at,
          changedBy: row.changed_by,
        })),
        note: READ_NOTE,
      },
    };
  };
}

export function profileWriteHandler(
  deps: ProfileHandlerDeps,
): RouteHandler<ProfileContextBody, ProfileWriteData> {
  return async ({ context, body }) => {
    const repositories = store(deps);
    const principal = context.principal;
    if (principal === null) {
      throw new AppError('UNAUTHENTICATED', 'A profile belongs to an authenticated user.');
    }

    const now = (deps.now ?? (() => Date.now()))();
    const iso = new Date(now).toISOString();

    // The version and creation time are supplied here and replaced by the repository
    // with the next version for this user, so a client can neither choose nor replay
    // either one.
    const document: TradingContext = { ...body.context, version: 1, createdAt: iso };

    const result = await repositories.profile.append({
      userId: principal.id,
      context: document,
      changedBy: principal.id,
    });

    const assessment = assessContext(result.row.context, now);
    context.logger.info(
      'profile context appended',
      {
        userId: principal.id,
        version: result.row.version,
        completionPercent: assessment.completionPercent,
        questions: result.questions.length,
      },
      'profile.write',
    );

    return {
      data: {
        version: result.row.version,
        context: result.row.context,
        assessment,
        questions: [...result.questions],
        note:
          result.questions.length === 0
            ? WRITE_NOTE
            : `${WRITE_NOTE} ${result.questions.length} declaration(s) do not fit together; the response lists them as questions rather than resolving them.`,
      },
    };
  };
}
