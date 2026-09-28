/**
 * The shell's half of the session history — Phase 8.2.4.
 *
 * `pageHistory.ts` is the *model*: it reads and writes entries, it is the only file in the tree that
 * touches the History API, and `connectPageHistory` is the whole of the wiring. This hook exists for the
 * wiring's *lifetime*, which is the part a module cannot own: the store subscription and the traversal
 * listener must go when the component that asked for them goes, and an effect is where a lifetime is
 * expressed.
 *
 * It is a hook of one line on purpose. Everything with a decision in it — what an entry is, what may be
 * recorded, what a traversal is allowed to do — is in the module, where the node suite can call it with
 * a fake session history and a fake window rather than through a renderer.
 */

import { useEffect } from 'react';
import { connectPageHistory } from './pageHistory';

export function usePageHistory(): void {
  useEffect(() => connectPageHistory(), []);
}
