/**
 * Local sign-in (Phase 9.2.1).
 *
 * The one route that hands out a credential, and only when the deployment says so.
 *
 * Why it exists: every other route requires a session, and until now the only thing that
 * could obtain one was the desktop shell — it holds the keychain secret and talks to the
 * API over the in-process bridge. A browser preview therefore had no session at all, so
 * every authenticated surface (the dashboard first among them) could only report that it
 * had none. This route closes that gap without inventing a second authorization model: it
 * calls the same `SessionService.issue` the shell path does, so the token it returns is an
 * ordinary session that expires, carries roles, and is scoped to one account.
 *
 * The gate is the deployment's, not the caller's:
 *
 *   - `auth.allowAnonymousLocalLogin` is **off by default** and configurable only through
 *     `MASTER_TRADE_ALLOW_ANONYMOUS_LOCAL_LOGIN`. With it off, this handler refuses with
 *     `FORBIDDEN` and issues nothing, which is the state the product ships in.
 *   - The API binds loopback and refuses non-loopback callers before any handler runs, so
 *     "local" is enforced by the transport, not asserted by the request.
 *
 * No subject parameter exists: the caller can only ever be issued the workstation account's
 * own session, so "sign in as someone else" is not expressible.
 */

import type { AppConfig } from '../../core/config.js';
import { AppError } from '../../../packages/shared/src/core/errors.js';
import type { Role } from '../../../packages/shared/src/auth/model.js';
import type { SessionService } from '../../auth/sessions.js';
import type { RouteHandler } from '../context.js';
import type { LocalSessionData } from '../../../packages/shared/src/api/contracts.js';

/**
 * The workstation account a local session belongs to.
 *
 * One local user owns one local database, so this is a constant rather than a setting: a
 * deployment that could name a different user here would be a deployment where the local
 * session reads someone else's rows.
 */
export const LOCAL_ACCOUNT_ID = 'local-owner';

/** The roles the workstation account carries. The owner owns this machine's records. */
export const LOCAL_ACCOUNT_ROLES: readonly Role[] = ['owner'];

export interface LocalSessionHandlerDeps {
  sessions: SessionService;
  config: AppConfig;
  /**
   * Make the account a local session will belong to exist before the session
   * does, when this deployment has a store to hold it.
   *
   * A session without its account is readable but unwritable: every
   * owner-scoped table references `users`, so the first *write* — a metered
   * chat turn, a recorded progress — would fail on the missing row. Absent
   * only on deployments with no database at all, where nothing can fail
   * against one.
   */
  ensureUser?: (userId: string) => Promise<unknown>;
}

export function localSessionHandler(
  deps: LocalSessionHandlerDeps,
): RouteHandler<never, LocalSessionData> {
  return async () => {
    if (!deps.config.auth.allowAnonymousLocalLogin) {
      throw new AppError(
        'FORBIDDEN',
        'This deployment does not allow local sign-in. Start the API with ' +
          'MASTER_TRADE_ALLOW_ANONYMOUS_LOCAL_LOGIN=true to let a browser preview start a session, ' +
          'or open the desktop shell, which signs in through the keychain.',
      );
    }

    // The account before the session: a refusal here must fail the sign-in,
    // not be swallowed into issuing a credential that cannot write.
    if (deps.ensureUser !== undefined) {
      await deps.ensureUser(LOCAL_ACCOUNT_ID);
    }

    const issued = deps.sessions.issue({
      userId: LOCAL_ACCOUNT_ID,
      roles: LOCAL_ACCOUNT_ROLES,
    });

    return {
      data: {
        token: issued.token,
        principal: { id: issued.principal.id, roles: [...issued.principal.roles] },
        issuedAt: issued.principal.session.issuedAt,
        expiresAt: issued.principal.session.expiresAt,
        note:
          'The token is returned once and never stored in the clear. Send it as ' +
          'Authorization: Bearer on every subsequent call; it expires with the session TTL.',
      },
    };
  };
}
