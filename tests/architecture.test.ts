import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAFETY_PROFILE,
  InMemoryStore,
  Orchestrator,
  ToolRegistry,
  defaultToolRegistry,
  loadInstructions,
  scriptedModelAdapter,
  type ModelStatement,
  type SafetyProfile,
  type Tool,
} from '../src/index.js';
import { DEFAULT_CONFIG, resolveConfig, assertSafeConfig } from '../src/core/config.js';
import {
  ERROR_STATUS,
  PolicyViolationError,
  toAppError,
} from '../packages/shared/src/core/errors.js';
import {
  ALL_OPERATION_IDS,
  OPERATIONS,
  assertNoHardlineOperations,
  authorize,
  type Principal,
} from '../packages/shared/src/auth/model.js';
import {
  API_ROUTES,
  findRoute,
  guardRoute,
  validateEnvelope,
} from '../packages/shared/src/api/contracts.js';
import {
  NAV_ITEMS,
  assertNoExecutionControls,
  provenanceLabel,
} from '../packages/shared/src/frontend/viewModels.js';
import {
  assertDesktopHost,
  memoryDesktopHost,
  listMissingCapabilities,
} from '../packages/shared/src/desktop/host.js';

/**
 * The instant these assertions judge.
 *
 * `authorize` requires a clock, so a test states which instant it is judging
 * instead of inheriting the wall clock. A session built from `Date.now()` and
 * checked against a defaulted clock is a test whose meaning depends on when it
 * runs — this was the one live instance of exactly that mistake.
 */
const NOW = Date.parse('2026-09-20T09:00:00.000Z');

const principal = (roles: Principal['roles'], id = 'user_1'): Principal => ({
  id,
  roles,
  session: {
    id: 'sess_1',
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
  },
});

describe('configuration safety', () => {
  it('ships a safe default configuration', () => {
    expect(() => assertSafeConfig(DEFAULT_CONFIG)).not.toThrow();
    expect(resolveConfig().safety.liveTradingEnabled).toBe(false);
  });

  it('refuses configurations that could reach live trading or leak secrets', () => {
    const unsafe: SafetyProfile = {
      ...DEFAULT_SAFETY_PROFILE,
      liveTradingEnabled: true,
    } as unknown as SafetyProfile;
    expect(() => resolveConfig({ safety: unsafe })).toThrow(PolicyViolationError);

    expect(() =>
      resolveConfig({ marketData: { ...DEFAULT_CONFIG.marketData, allowedProvenance: ['live'] } }),
    ).toThrow(/live data/i);

    expect(() =>
      resolveConfig({
        storage: { ...DEFAULT_CONFIG.storage, allowSensitiveFiles: true as unknown as false },
      }),
    ).toThrow(/allowSensitiveFiles/i);

    expect(() =>
      resolveConfig({
        observability: {
          ...DEFAULT_CONFIG.observability,
          redactSecrets: false as unknown as true,
        },
      }),
    ).toThrow(/redactSecrets/i);
  });

  it('maps every error code to a stable status', () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(toAppError(new PolicyViolationError('x')).code).toBe('POLICY_VIOLATION');
      expect(typeof code).toBe('string');
    }
  });
});

describe('authorization invariants', () => {
  it('defines no operation that could trade', () => {
    expect(() => assertNoHardlineOperations()).not.toThrow();
    expect(ALL_OPERATION_IDS.some((id) => /(broker|execute|live)/i.test(id))).toBe(false);
  });

  it('denies everything without an explicit role grant', () => {
    expect(authorize(null, 'agent.chat', NOW).allowed).toBe(false);
    expect(authorize(principal(['observer']), 'agent.chat', NOW).allowed).toBe(false);
    const allowed = authorize(principal(['student']), 'agent.chat', NOW);
    expect(allowed.allowed).toBe(true);
  });

  it('rejects expired sessions', () => {
    const expired: Principal = {
      ...principal(['owner']),
      session: {
        id: 's',
        issuedAt: new Date(0).toISOString(),
        expiresAt: new Date(NOW - 1_000).toISOString(),
      },
    };
    expect(authorize(expired, 'agent.chat', NOW).allowed).toBe(false);
    // The same session is accepted one second earlier: the gate answers the
    // question the caller asked, and it is the caller's clock that decides.
    expect(authorize(expired, 'agent.chat', NOW - 2_000).allowed).toBe(true);
  });

  it('flags critical operations as approval-gated', () => {
    const decision = authorize(principal(['owner']), 'rule.activate', NOW);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.approvalRequired).toBe(true);
    expect(OPERATIONS['rule.activate'].sensitivity).toBe('critical');
  });
});

describe('API contracts', () => {
  it('validates the envelope and rejects unknown versions', () => {
    expect(validateEnvelope({ version: 'v1', correlationId: 'c1', routeId: 'agent.chat' }).ok).toBe(
      true,
    );
    const bad = validateEnvelope({ version: 'v2', correlationId: 'c1', routeId: 'agent.chat' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.join(' ')).toMatch(/version/i);
  });

  it('validates route bodies', () => {
    const route = findRoute('agent.chat');
    expect(route).toBeDefined();
    expect(route?.validateBody({ message: 'hi' }).ok).toBe(true);
    const invalid = route?.validateBody({});
    expect(invalid?.ok).toBe(false);
  });

  it('guards protected routes before any backend work', () => {
    const chat = findRoute('agent.chat');
    expect(chat).toBeDefined();
    if (!chat) return;

    const anonymous = guardRoute(chat, null, NOW);
    expect(anonymous.allowed).toBe(false);
    if (!anonymous.allowed) {
      expect(anonymous.status).toBe(401);
      expect(anonymous.error.code).toBe('UNAUTHENTICATED');
    }

    const forbidden = guardRoute(chat, principal(['observer']), NOW);
    expect(forbidden.allowed).toBe(false);
    if (!forbidden.allowed) expect(forbidden.status).toBe(403);

    const allowed = guardRoute(chat, principal(['student']), NOW);
    expect(allowed.allowed).toBe(true);
  });

  it('marks approval-gated routes', () => {
    const activate = findRoute('rule.activate');
    expect(activate).toBeDefined();
    if (!activate) return;
    const decision = guardRoute(activate, principal(['owner']), NOW);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.approvalRequired).toBe(true);
  });

  it('exposes only v1 routes', () => {
    expect(API_ROUTES.every((route) => route.version === 'v1')).toBe(true);
  });
});

describe('frontend and desktop invariants', () => {
  it('never exposes execution controls in navigation', () => {
    expect(() => assertNoExecutionControls(NAV_ITEMS.map((item) => item.label))).not.toThrow();
    expect(() => assertNoExecutionControls(['Place Order'])).toThrow(PolicyViolationError);
  });

  it('labels synthetic data explicitly', () => {
    expect(provenanceLabel('synthetic')).toMatch(/not real market data/i);
  });

  it('requires secure-store and offline capabilities from the desktop shell', () => {
    expect(listMissingCapabilities(memoryDesktopHost())).toEqual([]);
    expect(() => assertDesktopHost(memoryDesktopHost({ capabilities: ['notifications'] }))).toThrow(
      /secure-store/,
    );
  });
});

describe('model / tools separation still holds', () => {
  it('blocks statements that reference a capability the model does not have', () => {
    const registry = new ToolRegistry();
    const backtestTool: Tool<{ symbol: string }, string> = {
      descriptor: {
        name: 'backtest.runner',
        category: 'backtesting',
        capabilities: ['backtest.run'],
        semantics: { epistemicKind: 'fact', hasSideEffects: false },
        description: 'placeholder',
        version: '0.0.0',
      },
      run: (input) => input.symbol,
    };
    registry.register(backtestTool);
    for (const tool of defaultToolRegistry().list()) registry.register(tool);

    const model = {
      respond(): ModelStatement[] {
        return [{ kind: 'analysis', text: 'run a backtest', sources: ['backtest.runner'] }];
      },
    };

    const orchestrator = new Orchestrator({
      tools: registry,
      instructions: loadInstructions(),
      memory: new InMemoryStore(),
      safety: DEFAULT_SAFETY_PROFILE,
      model,
    });
    const outcome = orchestrator.run('backtest this idea');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') expect(outcome.reason).toMatch(/Permission denied/);
  });

  it('still refuses an execution request end to end', () => {
    const orchestrator = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory: new InMemoryStore(),
      safety: DEFAULT_SAFETY_PROFILE,
      model: scriptedModelAdapter,
    });
    const outcome = orchestrator.run('Buy 100 shares of AAPL and place an order');
    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.statements[0]?.text).toMatch(/disabled by design/);
    }
  });
});
