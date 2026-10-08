/**
 * Chat policy — the basic validation hooks that run before a request is
 * sent to the LLM (Phase 2.13, AI Workplace Alpha Chat).
 *
 * This is deliberately **not** a policy engine. The phase's rule is to
 * connect existing permission points and add only the smallest hook
 * that answers one question: *should this message reach the model at
 * all?* Everything else — operation authorization (`agent.chat`), the
 * analysis readiness gate, capability plans, metering, the permission
 * gate on tools, the response pipeline's output policy — stays where it
 * already lives, and this hook runs alongside them, immediately before
 * the model would be consulted.
 *
 * Four rules, each a closed list of patterns rather than a heuristic:
 *
 *   1. **System manipulation → reject.** Attempts to override the
 *      instructions, reveal the prompt, extract credentials, escalate
 *      roles or flip safety policy are refused outright. The model is
 *      never consulted, so there is nothing to argue with.
 *   2. **Execution requests → reject.** This product never places
 *      orders, connects brokers or trades live; a request to do so is
 *      answered with the same fact the deterministic safety path
 *      states, not with a model's interpretation of it.
 *   3. **Greetings and casual conversation → redirect.** A short
 *      whole-message greeting gets a friendly redirect naming what the
 *      workspace is for. It costs nothing, and it keeps casual traffic
 *      off a paid gateway.
 *   4. **Out-of-scope topics → redirect.** A closed list of clearly
 *      unrelated topics (jokes, weather, sport, recipes…) is redirected
 *      with a sentence naming the scope. Anything not explicitly
 *      refused is **allowed** — the lists are closed on purpose, so a
 *      message this hook does not recognise can never be blocked by a
 *      guess, and Persian or technical phrasing passes through to the
 *      model unchanged.
 *
 * A refusal is returned as data, never thrown: the caller shapes it
 * into the same blocked turn every other gate produces, tracked and
 * metered exactly like any other non-completed turn.
 */

/** The verdict: allow the message to reach the model, or answer without it. */
export type ChatPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      /**
       * `reject` — the request violates a rule (manipulation, execution)
       * and is refused. `redirect` — the request is merely out of scope
       * and is pointed at what the workspace is for.
       */
      kind: 'reject' | 'redirect';
      /** The user-facing answer. The model is never consulted for it. */
      reply: string;
      /** Machine-readable rule name, for logs and tests. */
      rule: string;
    };

/** Attempts to override, subvert or interrogate the system itself. */
const MANIPULATION_PATTERNS: readonly { rule: string; pattern: RegExp }[] = [
  {
    rule: 'override-instructions',
    pattern: /ignore (?:your|all|these|my previous) (?:rules|instructions|guidelines|prompts?)/i,
  },
  {
    rule: 'reveal-prompt',
    pattern:
      /(?:reveal|show|print|repeat|leak) (?:me )?(?:your|the|this) (?:system )?(?:prompt|instructions?|guidelines)/i,
  },
  {
    rule: 'extract-credentials',
    pattern: /\b(?:credentials?|api[ _-]?keys?|passwords?|access tokens?|secrets?)\b/i,
  },
  {
    rule: 'privilege-escalation',
    pattern:
      /\b(?:escalate (?:my|the) roles?|make me (?:an? )?(?:admin|owner)|grant (?:me )?(?:admin|owner)|bypass (?:your|the) permissions?|hidden admin tools)\b/i,
  },
  {
    rule: 'safety-flip',
    pattern:
      /(?:enable|turn on|remember:|store this:|switch on).{0,40}(?:live trading|broker execution|real (?:money )?trading)/i,
  },
];

/**
 * Execution the product never performs. Anchored on concrete phrases so
 * `order flow` (a market-structure concept) can never be caught by the
 * `order` in `place an order`.
 */
const EXECUTION_PATTERNS: readonly RegExp[] = [
  /\bplace (?:an?|the) order\b/i,
  /\bexecute (?:an?|the|this)?\s*(?:order|trade|strategy)\b/i,
  /\b(?:buy|sell) \d+(?:\.\d+)?\s*(?:shares?|units?|lots?|contracts?)\b/i,
  /\bconnect (?:my|a|the) broker\b/i,
  /\bgo live\b/i,
];

/** A greeting, as a whole message — never a greeting buried in a question. */
const GREETING_PATTERN =
  /^(?:hi+|hello+|hey+|yo|sal(?:a|ā)m|سلام|good (?:morning|afternoon|evening|day)|how(?:'s| is| are you|'s it going)|how are you|thanks?|thank you(?: so much| a lot)?|thx|bye+|goodbye|see you|ok(?:ay)?|cool|nice|wow|lol|haha)[!?.\s]*$/i;

/** A closed list of clearly unrelated topics. */
const OUT_OF_SCOPE_PATTERN =
  /\b(?:jokes?|weather|forecast|recipes?|cooking|baking|football|soccer|nba|nfl|celebrity|gossip|movies?|films?|netflix|song|lyrics|capital of|president of|horoscope|zodiac|dating|girlfriend|boyfriend)\b/i;

const GREETING_REDIRECT =
  'This is the Master Trade AI Workplace — an alpha training environment for traders. ' +
  'Ask about trading concepts, market structure, risk management, your portfolio, market data, or the workspace itself.';

const OUT_OF_SCOPE_REDIRECT =
  'That is outside what this workspace is for. Master Trade is a trading training system: ' +
  'ask about trading concepts, market analysis, risk management, your portfolio, or the AI Workplace.';

const EXECUTION_REFUSAL =
  'Trade execution is disabled by design in Master Trade. This system is for training only — ' +
  'it never places orders, connects brokers, or trades live.';

/**
 * Decide whether one user message may reach the LLM.
 *
 * Order matters: manipulation is refused before anything else is
 * considered, execution before scope, and the closed lists fall through
 * to `allowed: true`. Same input, same decision — there is no state,
 * no clock and no model in this function.
 */
export function validateChatMessage(message: string): ChatPolicyDecision {
  for (const { rule, pattern } of MANIPULATION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        allowed: false,
        kind: 'reject',
        rule,
        reply:
          'That request is refused by policy. The AI Workplace does not reveal its instructions, ' +
          'share credentials, change safety configuration, or grant roles — the model is never consulted for it.',
      };
    }
  }

  if (EXECUTION_PATTERNS.some((pattern) => pattern.test(message))) {
    return { allowed: false, kind: 'reject', rule: 'execution-request', reply: EXECUTION_REFUSAL };
  }

  if (GREETING_PATTERN.test(message.trim())) {
    return { allowed: false, kind: 'redirect', rule: 'greeting', reply: GREETING_REDIRECT };
  }

  if (OUT_OF_SCOPE_PATTERN.test(message)) {
    return { allowed: false, kind: 'redirect', rule: 'out-of-scope', reply: OUT_OF_SCOPE_REDIRECT };
  }

  return { allowed: true };
}
