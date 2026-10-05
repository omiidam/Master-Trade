/**
 * Prompt parts — the static, trusted blocks the prompt engine composes.
 *
 * Re-exported from `prompt.ts` so the engine has exactly one import point
 * and `prompt.ts` remains the home of the existing turn-builder the
 * adapter uses. `OUTPUT_CONTRACT` is re-exported under an explicit alias
 * to keep the engine's import list self-documenting.
 */

export {
  DECISION_POLICY,
  MAX_USER_INPUT_CHARS,
  renderContextSection,
  responseDirectiveBlock,
} from './prompt.js';
export { OUTPUT_CONTRACT as OUTPUT_CONTRACT_REEXPORT } from './summary.js';
