/**
 * Agent chat handler.
 *
 * Thin by design: validate (the pipeline already did), call the agent service,
 * shape the response. The reply carries its epistemic label and the model that
 * produced it, so the client can never present model text as a tool result.
 */

import type { AgentChatBody } from '../../api/schemas.js';
import type { AgentService, AgentTurn } from '../../agent/service.js';
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
}

const OFFLINE_NOTE =
  'Answered by the offline deterministic adapter. No hosted model provider is configured in this phase.';

export function agentChatHandler(
  service: AgentService,
): RouteHandler<AgentChatBody, AgentChatResponseData> {
  return ({ context, body }) => {
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
