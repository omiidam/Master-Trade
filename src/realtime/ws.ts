/**
 * WebSocket transport — the socket, and nothing else.
 *
 * Everything interesting lives in the hub (`hub.ts`) and in the protocol
 * (`protocol.ts`); this module's whole job is to turn a Fastify socket into a
 * `RealtimeTransport`, apply the **same** gates an HTTP request passes through,
 * and hand the connection to the hub.
 *
 * The gates, in order — the order matters, because each one assumes the previous:
 *
 *   1. **Access policy** (`assertAllowed`): loopback only, plus the per-launch
 *      shell token when one is configured. A socket is a request; it gets the same
 *      treatment as any other (ADR-0022).
 *   2. **Protocol version**: the `mt.rt.v1` subprotocol, when the client offers
 *      one, must be the one we speak. A client that negotiates a subprotocol we do
 *      not understand is refused rather than served a different protocol.
 *   3. **Authentication**: a bearer token from `Authorization` when the client can
 *      set one, otherwise the first frame within a deadline. Until then the socket
 *      receives nothing at all.
 *
 * Shutdown is wired to Fastify's own lifecycle, so a closing server closes the
 * sockets with code 1001 ("going away") rather than dropping TCP and leaving
 * clients to guess whether it was a crash.
 */

import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { AppError } from '../core/errors.js';
import type { Logger } from '../core/logging.js';
import type { AccessPolicy } from '../server/access.js';
import { bearerToken } from '../auth/sessions.js';
import type { RealtimeHub, RealtimeLimits, RealtimeTransport } from './hub.js';
import { CLOSE_CODES, REALTIME_PROTOCOL_VERSION, REALTIME_SUBPROTOCOL } from './protocol.js';

/** The socket route, named so route coverage and tests can refer to it. */
export const REALTIME_ROUTE = {
  id: 'system.realtime',
  path: '/ws',
  /** The operation a principal must hold to open the stream. */
  operation: 'realtime.connect' as const,
  summary: 'Authenticated real-time event stream (WebSocket).',
};

export interface RealtimeTransportOptions {
  app: FastifyInstance;
  hub: RealtimeHub;
  access: AccessPolicy;
  logger?: Logger;
  /** Path to mount; defaults to `/ws` (config `realtime.path`). */
  path?: string;
  limits?: Partial<RealtimeLimits>;
}

/** Minimal shape of a `ws` socket; avoids depending on the library's types. */
interface SocketLike {
  readyState: number;
  send(data: string, callback?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...args: never[]) => void): void;
}

const OPEN = 1;

function isOpen(socket: SocketLike): boolean {
  return socket.readyState === OPEN;
}

/**
 * Mount the WebSocket route.
 *
 * The route is registered **inside a plugin that first awaits the WebSocket
 * plugin**. That ordering is load-bearing: `websocket: true` is understood only
 * because the WebSocket plugin adds an `onRoute` hook that wraps such handlers,
 * and a route registered before that hook exists is compiled as an ordinary HTTP
 * route whose upgrade never happens — the client simply hangs. Registering both
 * inside one plugin makes the order explicit and guaranteed.
 *
 * Returns the route descriptor. Socket coverage is asserted when the instance is
 * ready (see `assertSocketCoverage`), because that is the first moment the route
 * is guaranteed to exist.
 */
export function registerRealtimeTransport(
  options: RealtimeTransportOptions,
): typeof REALTIME_ROUTE {
  const path = options.path ?? REALTIME_ROUTE.path;

  // The plugin is registered at the root so its decorators (`injectWS`, the
  // websocket server) belong to the instance every caller holds; the route is
  // registered in a *later* plugin, which Fastify loads after the first, so the
  // plugin's `onRoute` hook exists by the time the route is compiled.
  void options.app.register(websocket, {
    options: {
      // Keep the frame cap small: realtime frames are summaries, not documents.
      maxPayload: 16 * 1024,
      // Protocols we speak; when the client offers none, none is selected and the
      // connection proceeds — a protocol is required only if the client asks.
      handleProtocols: (protocols: Set<string>) =>
        protocols.has(REALTIME_SUBPROTOCOL) ? REALTIME_SUBPROTOCOL : false,
    },
  });

  void options.app.register(async (scope) => {
    scope.get(
      path,
      {
        websocket: true,
        // Marks the route as pipeline-covered: coverage refuses a route without
        // this, so the socket cannot silently skip the access gate below.
        config: { mtRouteId: REALTIME_ROUTE.id },
      },
      (socket: SocketLike, request: { ip?: string; headers: Record<string, unknown> }) => {
        const openSocket = socket as unknown as SocketLike;
        const close = (code: number, reason: string): void => {
          try {
            if (isOpen(openSocket)) openSocket.close(code, reason);
          } catch {
            // Closing a socket that is already gone is not an error worth raising.
          }
        };

        // 1. Same access policy as every HTTP request, applied before anything else.
        try {
          options.access.assertAllowed({
            ip: request.ip ?? null,
            headers: request.headers as Record<string, string | string[] | undefined>,
          });
        } catch (error) {
          const message = error instanceof AppError ? error.message : 'access refused';
          options.logger?.warn(
            'realtime connection refused by the access policy',
            { ip: request.ip ?? null, message },
            'realtime.refused',
          );
          close(CLOSE_CODES.UNAUTHORIZED, message.slice(0, 120));
          return;
        }

        // 2. Protocol negotiation already happened in the handshake: `handleProtocols`
        // answers `false` for an unknown protocol, which fails the upgrade rather
        // than serving a client a protocol it did not ask for.

        const transport: RealtimeTransport = {
          send: (text) => {
            if (!isOpen(openSocket)) return;
            openSocket.send(text);
          },
          close,
          isOpen: () => isOpen(openSocket),
        };

        // 3. Authenticate. A native client can present a bearer header; a browser
        // WebSocket cannot, so the first frame is accepted instead.
        const headerToken = bearerToken(
          (request.headers.authorization as string | undefined) ?? null,
        );
        const connection = options.hub.accept(transport, { token: headerToken });

        socket.on('message', (data: unknown) => {
          const text =
            typeof data === 'string'
              ? data
              : Buffer.isBuffer(data)
                ? data.toString('utf8')
                : String(data);
          connection.handle(text);
        });

        socket.on('close', () => {
          connection.close('client closed the connection');
        });

        socket.on('error', (error: unknown) => {
          options.logger?.warn(
            'realtime socket error',
            {
              connectionId: connection.id,
              message: error instanceof Error ? error.message : String(error),
            },
            'realtime.socket.error',
          );
          connection.fail(CLOSE_CODES.GOING_AWAY, 'transport error');
        });

        options.logger?.info(
          'realtime connection accepted',
          { connectionId: connection.id, authenticated: headerToken !== null, path },
          'realtime.accepted',
        );
      },
    );
  });

  // Graceful shutdown: tell clients the server is going away so they reconnect
  // rather than interpret a dropped socket as a crash.
  options.app.addHook('onClose', async () => {
    options.hub.closeAll('the server is shutting down');
  });

  return REALTIME_ROUTE;
}

export { REALTIME_PROTOCOL_VERSION, REALTIME_SUBPROTOCOL };
