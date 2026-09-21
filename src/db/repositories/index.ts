/**
 * Repository bundle.
 *
 * Every table in the schema has exactly one owner repository, and this barrel is
 * where that claim is made checkable: the test suite asserts that the union of
 * `OWNED_TABLES` equals the schema, that no table is claimed twice, and that each
 * repository's tables match the owner declared in its ownership rule. A table
 * without a repository is data nobody owns; a table with two is data two contexts
 * write differently.
 */

import type { SqlExecutor } from '../executor.js';
import { AcademyRepository, createAcademyRepository } from './academy.js';
import { AuditRepository, createAuditRepository } from './audit.js';
import { createGovernanceRepository, GovernanceRepository } from './governance.js';
import { createIdentityRepository, IdentityRepository } from './identity.js';
import { createMarketDataRepository, MarketDataRepository } from './marketData.js';
import { createMemoryRepository, MemoryRepository } from './memory.js';
import { createPlatformRepository, PlatformRepository } from './platform.js';
import { createAgentRepository, AgentRepository } from './agent.js';
import { createProfileRepository, ProfileRepository } from './profile.js';
import { createUsageRepository, UsageRepository } from './usage.js';
import { OWNERSHIP_BY_TABLE, type Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export { AcademyRepository, createAcademyRepository } from './academy.js';
export { AuditRepository, createAuditRepository, AUDIT_CRITICAL_EVENTS } from './audit.js';
export { GovernanceRepository, createGovernanceRepository } from './governance.js';
export { IdentityRepository, createIdentityRepository } from './identity.js';
export { MarketDataRepository, createMarketDataRepository } from './marketData.js';
export { MemoryRepository, createMemoryRepository } from './memory.js';
export { PlatformRepository, createPlatformRepository } from './platform.js';
export { AgentRepository, createAgentRepository } from './agent.js';
export { ProfileRepository, createProfileRepository } from './profile.js';
export { UsageRepository, createUsageRepository } from './usage.js';
export type {
  ApplyCreditInput,
  ApplyCreditResult,
  CreditAccountRow,
  CreditLedgerRow,
  SubscriptionRow,
  UsageEventRow,
  UsageEventStatus,
  UpsertSubscriptionInput,
} from './usage.js';

/** Every repository module, with the owner it writes as. */
export const REPOSITORY_MODULES: readonly { owner: Owner; tables: readonly TableName[] }[] = [
  { owner: 'identity', tables: ['users', 'credentials', 'sessions'] },
  {
    owner: 'academy',
    tables: ['curricula', 'lessons', 'lesson_progress', 'exams', 'exam_attempts'],
  },
  { owner: 'agent', tables: ['conversations', 'messages'] },
  {
    owner: 'memory',
    tables: ['memory_records', 'memory_versions', 'memory_embeddings'],
  },
  { owner: 'governance', tables: ['trading_rules', 'rule_evaluations', 'approvals'] },
  { owner: 'audit', tables: ['audit_records'] },
  {
    owner: 'platform',
    tables: ['settings', 'files', 'jobs', 'job_scratch', 'market_data_bars'],
  },
  { owner: 'profile', tables: ['trading_context_versions'] },
  {
    owner: 'usage',
    tables: ['subscriptions', 'credit_accounts', 'credit_ledger', 'usage_events'],
  },
];

export interface Repositories {
  identity: IdentityRepository;
  academy: AcademyRepository;
  agent: AgentRepository;
  memory: MemoryRepository;
  governance: GovernanceRepository;
  audit: AuditRepository;
  platform: PlatformRepository;
  marketData: MarketDataRepository;
  profile: ProfileRepository;
  usage: UsageRepository;
}

export interface RepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
  approvalTtlMs?: number;
  jobLeaseMs?: number;
}

/**
 * Build every repository over one executor. Business logic receives this bundle
 * (or a single repository), never a driver or a raw SQL handle.
 */
export function createRepositories(db: SqlExecutor, options: RepositoryOptions = {}): Repositories {
  // Injected clock and id factory are shared by every repository, so a test can
  // drive the whole set deterministically.
  const shared = { now: options.now, newId: options.newId };
  return {
    identity: createIdentityRepository(db, shared),
    academy: createAcademyRepository(db, shared),
    agent: createAgentRepository(db, shared),
    memory: createMemoryRepository(db, shared),
    governance: createGovernanceRepository(db, {
      ...shared,
      defaultApprovalTtlMs: options.approvalTtlMs,
    }),
    audit: createAuditRepository(db, shared),
    platform: createPlatformRepository(db, { ...shared, defaultLeaseMs: options.jobLeaseMs }),
    marketData: createMarketDataRepository(db, shared),
    profile: createProfileRepository(db, shared),
    usage: createUsageRepository(db, shared),
  };
}

/** Sanity check used by tests and diagnostics: ownership ↔ repository coverage. */
export function repositoryCoverage(): {
  missing: TableName[];
  duplicated: TableName[];
  mismatched: { table: TableName; expected: Owner; declared: Owner }[];
} {
  const seen = new Map<TableName, number>();
  const mismatched: { table: TableName; expected: Owner; declared: Owner }[] = [];
  for (const module of REPOSITORY_MODULES) {
    for (const table of module.tables) {
      seen.set(table, (seen.get(table) ?? 0) + 1);
      const rule = OWNERSHIP_BY_TABLE[table];
      if (rule && rule.owner !== module.owner) {
        mismatched.push({ table, expected: rule.owner, declared: module.owner });
      }
    }
  }
  const declared = Object.keys(OWNERSHIP_BY_TABLE) as TableName[];
  return {
    missing: declared.filter((table) => !seen.has(table)),
    duplicated: declared.filter((table) => (seen.get(table) ?? 0) > 1),
    mismatched,
  };
}
