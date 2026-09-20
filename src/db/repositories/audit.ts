/**
 * Audit repository — owner: `audit`.
 *
 * Append-only by construction. This class has **no** update, no delete, no
 * upsert and no "replace" method, and the test suite asserts that: the audit
 * trail is evidence, and evidence that can be edited is not evidence. Expiry is a
 * future archival action, never an UPDATE of a row.
 *
 * Every record carries a correlation id, so "everything that happened for this
 * click" stays one query, and a payload that is a structured object rather than a
 * formatted string, so nothing has to be re-parsed to be queried. Payloads pass
 * through the same redaction rules as logs before they are stored (secrets never
 * reach the audit table either).
 */

import { redactValue } from '../../../packages/shared/src/core/logging.js';
import { AppError } from '../../../packages/shared/src/core/errors.js';
import { ids } from '../../../packages/shared/src/core/ids.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'audit';
export const OWNED_TABLES: readonly TableName[] = ['audit_records'];

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditRecordRow {
  id: string;
  correlation_id: string;
  actor_id: string | null;
  event: string;
  severity: AuditSeverity;
  payload: unknown;
  recorded_at: string;
}

export interface AuditRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface AppendAuditInput {
  /** Correlation id minted at the API boundary. */
  correlationId: string;
  /** User id, `system`, or null for an unattributed event. */
  actor: string | null;
  /** Stable event name, e.g. `rule.activate.approved`. */
  event: string;
  severity?: AuditSeverity;
  payload?: Record<string, unknown>;
}

/** Events the audit trail must always receive, whatever else logs them. */
export const AUDIT_CRITICAL_EVENTS: readonly string[] = [
  'rule.proposed',
  'rule.activated',
  'approval.submitted',
  'approval.decided',
  'memory.trust.changed',
  'memory.tombstoned',
  'auth.session.issued',
  'auth.session.revoked',
  'config.unsafe.refused',
];

export class AuditRepository {
  private readonly records: Table<AuditRecordRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: AuditRepositoryOptions = {}) {
    this.records = new Table<AuditRecordRow>(db, 'audit_records');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  /**
   * Append one record. Deliberately the only write path, and it is not
   * idempotent by design: two identical actions are two events.
   */
  async append(input: AppendAuditInput): Promise<AuditRecordRow> {
    if (input.correlationId.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'An audit record requires a correlation id');
    }
    if (input.event.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'An audit record requires an event name');
    }
    return this.records.insert({
      id: this.newId('audit'),
      correlation_id: input.correlationId,
      actor_id: input.actor,
      event: input.event,
      severity: input.severity ?? 'info',
      // Redaction runs here too: the audit trail is a second copy of the truth,
      // so a credential leaked into a payload would leak twice.
      payload: redactValue(input.payload ?? {}) as Record<string, unknown>,
      recorded_at: new Date(this.now()).toISOString(),
    });
  }

  /** Everything recorded for one correlation id, oldest first. */
  byCorrelation(correlationId: string, limit = 500): Promise<AuditRecordRow[]> {
    return this.records.findMany(
      { correlation_id: correlationId },
      { orderBy: 'recorded_at', direction: 'asc', limit },
    );
  }

  recent(limit = 100): Promise<AuditRecordRow[]> {
    return this.records.findMany({}, { orderBy: 'recorded_at', direction: 'desc', limit });
  }

  byEvent(event: string, limit = 100): Promise<AuditRecordRow[]> {
    return this.records.findMany({ event }, { orderBy: 'recorded_at', direction: 'desc', limit });
  }

  countBySeverity(): Promise<Record<AuditSeverity, number>> {
    return this.records.findMany({}, { limit: 10_000 }).then((rows) => {
      const counts: Record<AuditSeverity, number> = { info: 0, warning: 0, critical: 0 };
      for (const row of rows) counts[row.severity] += 1;
      return counts;
    });
  }

  /** Records that cite an event outside the required set — a coverage report. */
  async missingCriticalEvents(): Promise<string[]> {
    const events = new Set(
      (await this.records.findMany({}, { limit: 10_000 })).map((row) => row.event),
    );
    return AUDIT_CRITICAL_EVENTS.filter((event) => !events.has(event));
  }
}

export function createAuditRepository(
  db: SqlExecutor,
  options: AuditRepositoryOptions = {},
): AuditRepository {
  return new AuditRepository(db, options);
}
