/**
 * HTTP header names shared by more than one side of the local boundary.
 *
 * They live here, in a module with no imports at all, because the frontend must be
 * able to name them: `src/server/access.ts` reaches `node:crypto` through the
 * session service, and a browser bundle that imported the header from there would
 * pull a Node built-in into the WebView. A string constant is not worth that.
 */

/**
 * The per-launch token the desktop shell injects into the sidecar's environment.
 *
 * It is what stops an unrelated local process from talking to the API just because
 * it can reach the port, so both sides must agree on the exact spelling.
 */
export const SHELL_TOKEN_HEADER = 'x-master-trade-shell-token';
