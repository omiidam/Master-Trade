/**
 * Agent chat handler.
 *
 * Thin by design: validate (the pipeline already did), call the agent service,
 * shape the response. The reply carries its epistemic label and the model that
 * produced it, so the client can never present model text as a tool result.
 */

import type { AgentChatBody } from '../../../packages/shared/src/api/schemas.js';
import type { AgentAsyncTurn, AgentService, AgentTurn } from '../../agent/service.js';
import type { AnalysisReadinessDecision } from '../../../packages/shared/src/quality/readiness.js';
import type { EventBus } from '../../../packages/shared/src/realtime/events.js';
import type { Logger } from '../../../packages/shared/src/core/logging.js';
import type { RouteHandler } from '../context.js';

export interface AgentChatResponseData {
  reply: string;
  epistemicKind: string;
  correlationId: string;
  status: 'completed' | 'blocked';
  agentState: string;
  model: string;
  toolResultCount: number;
  statements: AgentTurn['statements'];
  note: string;
  /**
   * The quality gate's verdict, present only when the request named an analysis type.
   *
   * Sent even when the turn succeeded: a `READY_WITH_LIMITATIONS` decision carries
   * limitations the answer must be read against.
   */
  readiness?: AgentAsyncTurn['readiness'];
}

const OFFLINE_NOTE =
  'Answered by the offline deterministic adapter. No hosted model provider is configured in this phase.';

export function agentChatHandler(
  service: AgentService,
  bus?: EventBus,
  decide?:
    | ((userId: string, analysisType: string) => Promise<AnalysisReadinessDecision | null>)
    | undefined,
): RouteHandler<AgentChatBody, AgentChatResponseData> {
  return async ({ context, body }) => {
    /*
     * A request that names an analysis is gated before anything answers it.
     *
     * The gate needs the stored context, which is a read the agent layer cannot do, so
     * the decision is made here — and the *service* refuses on a refusal, so the
     * ordering guarantee does not depend on this handler remembering to check.
     *
     * A gate that cannot be evaluated yields `null`, which the service refuses too. A
     * server with no store must not answer an analysis request as though it had gated
     * it; that would make "the model never sees what the gate refused" false on exactly
     * the deployments least able to afford it.
     */
    if (body.analysisType !== undefined) {
      const principal = context.principal;
      const readiness =
        decide === undefined || principal === null
          ? null
          : await decide(principal.id, body.analysisType);
      const turn = service.run(body.message, { readiness });
      context.logger.info(
        'gated agent turn completed',
        {
          status: turn.status,
          analysisType: body.analysisType,
          readiness: turn.readiness?.readiness ?? null,
          classification: turn.readiness?.classification ?? null,
          decidedBy: turn.readiness?.decidedBy ?? null,
          engineConsulted: turn.status === 'completed',
        },
        'agent.turn.gated',
      );
      return {
        data: {
          reply: turn.reply,
          epistemicKind: turn.epistemicKind,
          correlationId: context.correlationId,
          status: turn.status,
          agentState: turn.agentState,
          model: turn.model,
          toolResultCount: turn.toolResultCount,
          statements: turn.statements,
          note: OFFLINE_NOTE,
          readiness: turn.readiness ?? null,
        },
      };
    }

    const turn = service.run(body.message);
    context.logger.info(
      'agent turn completed',
      {
        status: turn.status,
        epistemicKind: turn.epistemicKind,
        toolResultCount: turn.toolResultCount,
        agentState: turn.agentState,
      },
      'agent.turn.completed',
    );
    // The turn is announced on the bus so other views of the workstation see the
    // same answer, with the same epistemic labels the HTTP response carries.
    if (bus !== undefined) {
      publishTurn(bus, turn, context.correlationId, context.logger);
    }
    return {
      data: {
        reply: turn.reply,
        epistemicKind: turn.epistemicKind,
        correlationId: context.correlationId,
        status: turn.status,
        agentState: turn.agentState,
        model: turn.model,
        toolResultCount: turn.toolResultCount,
        statements: turn.statements,
        note: OFFLINE_NOTE,
      },
    };
  };
}

/**
 * Publish an agent answer as an event.
 *
 * The source is `agent` (never `tool`, even when tools ran): the statement is the
 * model's, and the tool results it cites are named in `sources`. Chain-of-thought
 * has no field here — the event carries the same structured statements the API
 * returns, which is what the output contract already guarantees.
 */
function publishTurn(bus: EventBus, turn: AgentTurn, correlationId: string, logger: Logger): void {
  try {
    bus.publish({
      type: 'agent.message',
      source: { kind: 'agent', id: turn.model },
      correlationId,
      payload: {
        conversationId: `conv_${correlationId.slice(-24)}`,
        state: turn.agentState,
        statements: turn.statements.map((statement) => ({
          kind: statement.kind,
          text: statement.text.slice(0, 2_000),
          sources: [...statement.sources].slice(0, 20),
        })),
        uncertainty:
          turn.status === 'blocked' && turn.reason !== undefined
            ? [turn.reason.slice(0, 2_000)]
            : [],
      },
    });
  } catch (error) {
    // The answer is already on its way to the caller; a refused event is a
    // contract drift that must be loud, not a failed request.
    logger.error(
      'refused to publish an agent message event',
      { message: (error as Error).message },
      'realtime.publish.refused',
    );
  }
}
