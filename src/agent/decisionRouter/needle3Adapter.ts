/**
 * The Needle 3 adapter (Phase 2.14).
 *
 * This is the only file that knows a Needle 3 model exists. Everything
 * downstream — the routing policy, the chat handler, the response — speaks
 * to the `Needle3Classifier` interface, so the runtime can later replace
 * the local checkpoint with a served model, a quantized engine or nothing
 * at all without `agent.chat` changing a line.
 *
 * The local integration runs the checkpoint that is actually installed on
 * this machine through the Cactus `needle` CLI (`needle run --checkpoint …
 * --query …`), as a short-lived subprocess with a hard timeout:
 *
 *   - the prompt is exactly the fine-tune's own chat template: the raw
 *     user message with the empty tool list (`--tools`), which is how
 *     `training-data/decision-router-needle.jsonl` taught the model to
 *     classify — so inference and training share one prompt shape;
 *   - the completion must be the strict decision JSON the Phase 2.12-A
 *     contract defines — parsed by `parseRouterDecision`, validated for
 *     intent/route coherence with `isRouteAllowedForIntent`;
 *   - every failure is a typed error the policy maps to a visible fallback
 *     code: unavailable (nothing to execute), timeout, invalid output.
 *     Nothing here throws past the policy, and nothing here logs a model
 *     path or a raw completion into a response.
 */

import { ChildTimeoutError, execOnce } from '../../desktop/child-process.js';
import {
  isRouteAllowedForIntent,
  parseRouterDecision,
  type RouterDecision,
} from '../../training/decisionRouter.js';

/** How the adapter invokes the local model — injectable so tests stay hermetic. */
export interface Needle3Runner {
  run(args: {
    /** Absolute or PATH-resolved executable. */
    command: string;
    /** Arguments passed to the executable, argv-style (no shell). */
    args: readonly string[];
    timeoutMs: number;
  }): Promise<{ stdout: string }>;
}

/**
 * The default runner: the Cactus `needle` CLI as a short-lived subprocess,
 * through `execOnce` — the single process-spawning port `src/` is allowed
 * to use (`process.single-spawner.typescript`, security gate SEC-082).
 */
export const processRunner: Needle3Runner = {
  async run({ command, args, timeoutMs }) {
    try {
      return await execOnce({ command, args, timeoutMs });
    } catch (error) {
      // A killed child is the timeout speaking; anything else is the runtime
      // refusing to run (missing binary, nonzero exit).
      if (error instanceof ChildTimeoutError) {
        throw new Needle3TimeoutError();
      }
      throw new Needle3UnavailableError(error instanceof Error ? error.message : String(error));
    }
  },
};

/**
 * The rendered prompt the fine-tune was trained on, built here rather than
 * left to the CLI: the model's chat template with the empty tool list the
 * decision router always has (`<tools>[]</tools>`), the raw user message,
 * and the assistant turn left open. The CLI's own `--tools` path cannot
 * produce it — it falls back to the bare query when the tool list is empty
 * (`if not tools: return query`) — so the template is applied here, exactly
 * as `render_example` in the training pipeline renders it.
 */
export function routerPrompt(message: string): string {
  return `<|im_start|>user\n<tools>[]</tools>\n${message}<|im_end|>\n<|im_start|>assistant\n`;
}

/** The classifier interface everything downstream depends on. */
export interface Needle3Classifier {
  classify(input: { message: string }): Promise<RouterDecision>;
}

/** Typed failures the policy maps to visible fallback codes — never thrown past it. */
export class Needle3UnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'Needle3UnavailableError';
  }
}

export class Needle3TimeoutError extends Error {
  constructor() {
    super('the Needle 3 classification did not answer within its budget');
    this.name = 'Needle3TimeoutError';
  }
}

export class Needle3InvalidOutputError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super('the Needle 3 output was not a valid decision');
    this.name = 'Needle3InvalidOutputError';
    this.issues = issues;
  }
}

export interface Needle3AdapterOptions {
  /** Path to the installed checkpoint (`.safetensors`). Never logged or sent anywhere. */
  checkpointPath: string;
  /** The Cactus CLI executable. Default `needle` (PATH); the installed venv path wins when set. */
  cliPath?: string;
  /** Hard budget for one classification, in milliseconds. */
  timeoutMs: number;
  /** Injection point for tests; defaults to the real subprocess runner. */
  runner?: Needle3Runner;
}

/**
 * The generation budget, in tokens: a decision is short JSON (`~50` tokens),
 * and the bound is tight because every token costs CPU time on the real
 * local checkpoint — a runaway generation would only be discarded.
 */
const MAX_LEN_TOKENS = 96;

export class CactusNeedle3Classifier implements Needle3Classifier {
  private readonly runner: Needle3Runner;

  constructor(private readonly options: Needle3AdapterOptions) {
    this.runner = options.runner ?? processRunner;
  }

  /**
   * Classify one user message. Resolves with a valid, coherent decision or
   * rejects with one of the three typed errors — the policy's whole surface.
   */
  async classify({ message }: { message: string }): Promise<RouterDecision> {
    const { stdout } = await this.runner.run({
      command: this.options.cliPath ?? 'needle',
      args: [
        'run',
        '--checkpoint',
        this.options.checkpointPath,
        // The rendered training template, so a real classification reads
        // exactly the prompt shape the fine-tune learned (see
        // `routerPrompt` for why the CLI's `--tools` cannot build it).
        '--query',
        routerPrompt(message),
        '--temperature',
        '0',
        '--max-len',
        String(MAX_LEN_TOKENS),
      ],
      timeoutMs: this.options.timeoutMs,
    });

    const decision = parseCompletion(stdout);
    if (!isRouteAllowedForIntent(decision.intent, decision.route)) {
      throw new Needle3InvalidOutputError([
        `route ${decision.route} is not expected for intent ${decision.intent}`,
      ]);
    }
    return decision;
  }
}

/**
 * Extract a decision from a completion. The CLI may echo the prompt or wrap
 * the completion in whitespace, so the parse is anchored on the outermost
 * JSON object in the output — and then the strict contract does the rest.
 */
export function parseCompletion(stdout: string): RouterDecision {
  // The CLI echoes the rendered prompt (which contains the user's message,
  // possibly with braces) before generating, so the scan is anchored on the
  // tool-call marker the fine-tune opens its answer with — and falls back to
  // the first JSON object for a checkpoint that answers bare JSON.
  const marker = stdout.indexOf('<tool_call>');
  const region = marker === -1 ? stdout : stdout.slice(marker + '<tool_call>'.length);
  const start = region.indexOf('{');
  const end = region.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Needle3InvalidOutputError(['the completion contained no JSON object']);
  }
  const parsed = parseRouterDecision(region.slice(start, end + 1));
  if (!parsed.ok) {
    throw new Needle3InvalidOutputError(parsed.issues);
  }
  return parsed.decision;
}
