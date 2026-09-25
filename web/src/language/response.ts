/**
 * Response language control — Phase 7.5.3.4, Task 1.
 *
 * Every module under this directory so far answers a question about a *message*: what it is written in
 * (7.5.3.1), what kind of turn it is and how to word the answer (7.5.3.2). This one is the join, and it
 * exists because the four signals that decide the language of an answer live in four different places and
 * only one order between them is correct:
 *
 *   1. **A request inside the message** (`به انگلیسی جواب بده`) — made now, in words, for this turn.
 *   2. **The person's explicit choice** — the switch in Settings, which 7.5.3.3 also made the interface's
 *      language. A setting is a statement, not an inference.
 *   3. **What previous turns showed** — the learned store's language counts (`learnedLanguage`). A habit,
 *      which is real evidence about a person and none at all about the sentence in front of them — so it
 *      outranks the reading of one message and never outranks a choice.
 *   4. **The reading of the message** — the larger script in a mix, Persian for Finglish, and the
 *      product's own language when the message carries no letters at all.
 *
 * `resolveLanguage` holds that order, and this module is the one call that feeds all four into it: it
 * reads the message once, takes the preference and the learned store from where they are kept, and returns
 * the resolved language *with* 7.5.3.2's guidance for the same turn — and, from 7.5.3.4.2, with the same
 * decision in the shape the response pipeline is handed (`style`). A response stage therefore has one thing
 * to apply rather than three to assemble, and cannot apply the language of one reading to the wording of
 * another.
 *
 * What it deliberately is not
 * --------------------------
 *   - **Not a second detection.** The message is read by `detectLanguage`, exactly once, and the reading
 *     is passed to both the profile and the guidance.
 *   - **Not a second resolution.** The precedence lives in `resolveLanguage`; this module supplies inputs.
 *   - **Not a store.** The preference and the observations are read through the modules that own them —
 *     the keys, the validation and the storage access stay where they already were, and a caller that has
 *     already read them passes them in.
 *   - **Not a prompt.** Nothing here writes an instruction, a sentence for a model, or a translation. It
 *     resolves *which language* an answer is owed in and *how* it should be worded; the response pipeline
 *     is what turns that into an instruction, and `docs/persian-language.md` is where the split is written
 *     down.
 *
 * One more property, asserted by the suite: nothing here can change what an answer *says*. The value it
 * returns carries a language, a source, a reason, ids from closed catalogues and the invariant list — no
 * field a figure, a tool result, a permission or an uncertainty note could travel in.
 */

import {
  communicationProfile,
  readCommunicationObservations,
  type CommunicationObservations,
  type CommunicationProfile,
  type CommunicationProfileOptions,
} from './communication.js';
import { detectLanguage } from './detect.js';
import { responseGuidance, responseStyle, type ResponseGuidance } from './guidance.js';
import {
  preferenceStorage,
  readLanguagePreference,
  type LanguagePreference,
  type PreferenceStorage,
} from './preference.js';
import type { LanguageReply } from './profile.js';
import type { ResponseStyle } from '@shared/language/guidance';

/**
 * The version of the control, bumped when a returned value means something different than it did.
 *
 * A response stage that caches or logs a control has to know which rules produced it, for the same reason
 * the profile and the guidance carry their own version.
 */
export const RESPONSE_CONTROL_VERSION = 1;

/** What a response stage applies to one turn: the language, and how to word the answer in it. */
export interface ResponseControl {
  readonly version: number;
  /** The language the answer is written in, with the source that decided it and why. */
  readonly reply: LanguageReply;
  /**
   * How to word it — tone, depth, terminology, structure, the notes to apply, and the invariant list.
   *
   * This is the value a person reads when they disagree with an answer's *style*, which is why it carries
   * the `reason` and the evidence behind each dimension.
   */
  readonly guidance: ResponseGuidance;
  /**
   * The same decision in the shape that crosses the process divide — Phase 7.5.3.4.2.
   *
   * A projection of `guidance` (`responseStyle`), carried here so a caller that resolves a turn has the
   * value to send as well as the value to explain, and neither of them has to be assembled by hand.
   */
  readonly style: ResponseStyle;
  /** How many previous turns informed the resolution. Zero means nothing has been learned yet. */
  readonly observedSamples: number;
}

export interface ResponseControlOptions extends CommunicationProfileOptions {
  /** What previous turns showed, read by the caller that owns the store. `null` is "nothing learned". */
  readonly observations?: CommunicationObservations | null;
}

/**
 * Resolve one turn: what language the answer is owed in, and how to word it.
 *
 * Pure and total — every message produces a control, including one with no letters in it — and
 * deterministic: the same message with the same signals produces the same control, twice.
 */
export function responseControl(
  text: string,
  options: ResponseControlOptions = {},
): ResponseControl {
  const detection = options.detection ?? detectLanguage(text, options);
  const observations = options.observations ?? null;
  const profile: CommunicationProfile = communicationProfile(text, {
    ...options,
    detection,
    observations,
  });
  const guidance = responseGuidance(profile);
  return {
    version: RESPONSE_CONTROL_VERSION,
    reply: profile.language,
    guidance,
    style: responseStyle(guidance),
    observedSamples: profile.observedSamples,
  };
}

/** The two persisted signals, both read from the modules that own them and from nowhere else. */
export interface StoredResponseOptions {
  readonly preference: LanguagePreference;
  readonly observations: CommunicationObservations | null;
}

/**
 * What this person has chosen and what their previous turns showed, or the answers for somebody who has
 * used the product for the first time.
 *
 * This is the seam between the running application and this module, and it mirrors `storedProfileOptions`:
 * the switch writes the preference through `preference.ts` and the learned store through
 * `communication.ts`, and a response stage calls this rather than reading storage itself. Neither side
 * knows about the other — a stage that read the keys directly would duplicate them, and a module that read
 * the interface store would make the language layer depend on React.
 *
 * An unreadable store is not an error: it produces `auto` and nothing learned, which is what somebody who
 * has chosen nothing and typed nothing has.
 */
export function storedResponseOptions(
  storage: PreferenceStorage | null = preferenceStorage(),
): StoredResponseOptions {
  const learned = readCommunicationObservations(storage);
  return {
    preference: readLanguagePreference(storage).preference,
    // `stored: false` means a real store answered and held nothing, which is nothing learned — `null`
    // rather than an empty store, so a caller can tell "no history" from "a history that happened to be
    // empty" and record this turn against the right one.
    observations: learned.stored ? learned.observations : null,
  };
}
