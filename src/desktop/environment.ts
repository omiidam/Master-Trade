/**
 * Which environment the desktop shell is running in — and what that forbids.
 *
 * The shell has three genuinely different modes and used to have no name for any of them.
 * That is a quiet problem: the difference between a development launch and a shipped build
 * is not cosmetic. A development build may carry a placeholder update key, an unpackaged
 * sidecar and a developer keychain; a production build may carry none of those things, and
 * nothing in the repository said which one it was looking at.
 *
 * The rule this module exists to enforce
 * --------------------------------------
 * **An environment is either declared or it is `development`.** There is no value that
 * means "probably production", because the failure mode of guessing is shipping a
 * development build as a release and only discovering it when the updater cannot verify a
 * signature. An unrecognised value is refused rather than coerced, and the verifier treats
 * a refusal as an error — see `docs/desktop-architecture.md` §7.
 *
 * The variable follows the existing convention for this project (`ENV_PREFIX`,
 * `src/config/loader.ts`), so it sits alongside `MASTER_TRADE_*` rather than inventing a
 * second spelling of the same idea.
 *
 * What this deliberately is not
 * -----------------------------
 * It is not a second permission system. Safety is unaffected by it: `liveTradingEnabled`
 * and `brokerExecutionEnabled` are typed as the literal `false` and `assertSafeConfig`
 * refuses a boot that sets them, in every environment including `test`. An environment can
 * make an *assurance* stricter; it can never make a safeguard looser.
 */

/** The three modes. `test` is separate because `NODE_ENV=test` is not a deployment. */
export type DesktopEnvironment = 'development' | 'test' | 'production';

export const DESKTOP_ENVIRONMENTS = ['development', 'test', 'production'] as const;

/** The variable that declares the mode. */
export const DESKTOP_ENVIRONMENT_VAR = 'MASTER_TRADE_ENVIRONMENT';

export interface DesktopEnvironmentResolution {
  environment: DesktopEnvironment;
  /**
   * True only when the variable was set to a recognised value.
   *
   * Load-bearing: a production build must *say* it is production. Relying on the default
   * would mean this process's mode depends on whether someone remembered to export a
   * variable, which is exactly the accident the refusal rules catch.
   */
  declared: boolean;
  /** Problems that make the declaration unusable. Empty when it is sound. */
  violations: string[];
}

/**
 * Resolve the environment from an injected `env`, so this is testable without touching
 * `process.env` and so the verifier can check a hypothetical launch instead of its own.
 */
export function resolveDesktopEnvironment(
  env: Record<string, string | undefined> = process.env,
): DesktopEnvironmentResolution {
  const raw = env[DESKTOP_ENVIRONMENT_VAR];
  const value = (raw ?? '').trim().toLowerCase();

  if (value === '') {
    return {
      environment: 'development',
      declared: false,
      violations: [],
    };
  }

  const match = DESKTOP_ENVIRONMENTS.find((candidate) => candidate === value);
  if (!match) {
    return {
      environment: 'development',
      declared: false,
      violations: [
        `${DESKTOP_ENVIRONMENT_VAR}="${raw}" is not one of ${DESKTOP_ENVIRONMENTS.join(', ')}; ` +
          'refusing to guess, and treating this run as development',
      ],
    };
  }

  return { environment: match, declared: true, violations: [] };
}

/** True for the mode where an assurance may be relaxed. Nothing about safety changes. */
export function isDevelopment(environment: DesktopEnvironment): boolean {
  return environment === 'development';
}

/**
 * True for the mode in which every release-time assurance is required.
 *
 * Used by `desktop:verify` to promote a release blocker from a warning to an error, so the
 * mode is load-bearing rather than a label someone prints.
 */
export function isProduction(environment: DesktopEnvironment): boolean {
  return environment === 'production';
}
