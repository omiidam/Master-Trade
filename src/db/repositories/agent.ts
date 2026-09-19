/**
 * Agent repository — owner: `agent`.
 *
 * Conversation threads and their turns. A turn is stored with the things that
 * make it defensible rather than merely replayable: its **epistemic label**, the
 * **sources** (deterministic tool outputs and memory references) it leaned on,
 * and the **instruction version** in force when it was produced. A later prompt
 * change therefore cannot silently rewrite the meaning of a past answer.
 *
 * Turns are append-only. A user may delete a thread (which cascades to its
 * messages — the one place a cascade is the *desired* behaviour, because the user
 * asked for the data to go), but nothing edits a message.
 */

import { AppError } from '../../core/errors.js';
import { ids } from '../../core/ids.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import { EPISTEMIC_KINDS, type TableName } from '../schema.js';

export const OWNER: Owner = 'agent';
export const OWNED_TABLES: readonly TableName[] = ['conversations', 'messages'];

export type MessageRole = 'user' | 'agent' | 'tool' | 'system';
export type EpistemicKind = (typeof EPISTEMIC_KINDS)[number];

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  epistemic_kind: EpistemicKind;
  content: string;
  tool_calls: unknown | null;
  sources: unknown;
  instructions_version: string;
  correlation_id: string;
  created_at: string;
}

export interface AgentRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface AppendMessageInput {
  conversationId: string;
  role: MessageRole;
  epistemicKind: EpistemicKind;
  content: string;
  /** Tool calls the orchestrator actually ran, with their provenance. */
  toolCalls?: unknown;
  /** Where the answer came from: tool results, memory ids, lesson ids. */
  sources?: readonly unknown[];
  instructionsVersion: string;
  correlationId: string;
}

export class AgentRepository {
  private readonly conversations: Table<ConversationRow>;
  private readonly turns: Table<MessageRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: AgentRepositoryOptions = {}) {
    this.conversations = new Table<ConversationRow>(db, 'conversations');
    this.turns = new Table<MessageRow>(db, 'messages');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }

  createConversation(input: { userId: string; title?: string }): Promise<ConversationRow> {
    return this.conversations.insert({
      id: this.newId('conv'),
      user_id: input.userId,
      title: input.title ?? 'Training session',
      created_at: this.iso(),
    });
  }

  conversation(id: string): Promise<ConversationRow | null> {
    return this.conversations.findById(id);
  }

  conversationsFor(userId: string): Promise<ConversationRow[]> {
    return this.conversations.findMany(
      { user_id: userId },
      { orderBy: 'created_at', direction: 'desc', limit: 200 },
    );
  }

  /**
   * Append a turn. The instruction version is required: an answer whose
   * instruction set cannot be named is an answer that cannot be audited.
   */
  async appendMessage(input: AppendMessageInput): Promise<MessageRow> {
    if (input.content.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A message needs content');
    }
    if (input.instructionsVersion.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A message must record the instruction version');
    }
    if (input.correlationId.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A message must record its correlation id');
    }
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation) {
      throw new AppError('NOT_FOUND', `Conversation ${input.conversationId} was not found`);
    }
    return this.turns.insert({
      id: this.newId('msg'),
      conversation_id: input.conversationId,
      role: input.role,
      epistemic_kind: input.epistemicKind,
      content: input.content,
      tool_calls: input.toolCalls ?? null,
      sources: [...(input.sources ?? [])],
      instructions_version: input.instructionsVersion,
      correlation_id: input.correlationId,
      created_at: this.iso(),
    });
  }

  /** Turns of a thread, oldest first — the order the user experienced them. */
  messages(conversationId: string, limit = 500): Promise<MessageRow[]> {
    return this.turns.findMany(
      { conversation_id: conversationId },
      { orderBy: 'created_at', direction: 'asc', limit },
    );
  }

  /** Every turn produced under one correlation id, for a support question. */
  messagesByCorrelation(correlationId: string): Promise<MessageRow[]> {
    return this.turns.findMany(
      { correlation_id: correlationId },
      { orderBy: 'created_at', direction: 'asc', limit: 200 },
    );
  }

  /** User-requested deletion: the thread and its turns go together. */
  async deleteConversation(id: string): Promise<boolean> {
    return this.conversations.deleteById(id);
  }

  async messageCount(conversationId: string): Promise<number> {
    return this.turns.count({ conversation_id: conversationId });
  }
}

export function createAgentRepository(
  db: SqlExecutor,
  options: AgentRepositoryOptions = {},
): AgentRepository {
  return new AgentRepository(db, options);
}
