/**
 * Phase 7.2.1 — the agent surface, as a contract rather than a stylesheet.
 *
 * The agent surface is the one place in the product where a *machine* is talking to you, and the
 * design says that with light. It is the only part of the interface whose surfaces are lit from
 * below: the composer is framed by a ring lit from its upper-left corner, and the cards glow up
 * from their feet. Everything else — panels, controls, wells — is lit from above, which is what
 * makes these two families recognisable in a screenshot.
 *
 * The rules below are the ones that keep that identity from decaying into decoration:
 *
 *   1. **A gradient stroke is padding, never `border-image`.** `border-image` ignores
 *      `border-radius` and squares off the corners, so any radiused element that needs a gradient
 *      edge draws it as a padded frame whose background shows through the uncovered band. Both
 *      primitives here depend on this, and the rule is asserted product-wide so it cannot be
 *      reintroduced by whichever surface needs a gradient edge next.
 *   2. **Light has a direction, and the agent surface's is upward.** The panel gradient runs
 *      180deg with its sheen at the top; the agent ring and glow run 0deg with their light at the
 *      bottom. A card that copied the panel's angle would still look fine and would stop being
 *      part of this family, so the direction is asserted rather than the colours.
 *   3. **Clipped, always.** The travelling light on an active ring is a 200%-wide absolutely
 *      positioned box. Clipped it is a band crossing a 1px frame; unclipped it paints across the
 *      page *and* counts toward the document's scroll width, which is a decorative animation
 *      turning into a horizontally scrolling viewport.
 *   4. **The sweep is spent on one card.** It means "this is the thing waiting for you", so a
 *      second one on the same screen is a second answer to where to look.
 *   5. **A composer that cannot send says so.** The field and the send control disable together,
 *      the reason is visible prose and the control's description, and a tool that is unavailable
 *      carries the reason that makes it unavailable — a disabled control with nothing to say is a
 *      dead end, and one that silently does nothing is worse.
 *   6. **Nothing here talks to anything.** These are visual primitives: no fetch, no state, no
 *      message handling. The composer takes a value and reports a change, which is exactly the
 *      seam the existing surface already had.
 *
 * Everything is read from the source, so the suite is offline and needs no browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = join('web', 'src', 'styles', 'global.css');
const AGENT = join('web', 'src', 'components', 'agent');
const PAGE = join('web', 'src', 'pages', 'AgentWorkspacePage.tsx');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * A source file with its block comments removed.
 *
 * The rules below are about code, and this repository's comments name the constructs they explain:
 * `MessageComposer` documents at length that it does *not* use `border-image`, and reading that
 * sentence as a violation would make the honest documentation of the decision the thing the test
 * fails on.
 */
function bare(path: string): string {
  return read(path).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `.tsx`/`.ts` file under `web/src`, as forward-slashed paths. */
function uiSources(): string[] {
  const walk = (directory: string): string[] => {
    const found: string[] = [];
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, name.name);
      if (name.isDirectory()) found.push(...walk(path));
      else if (name.name.endsWith('.tsx') || name.name.endsWith('.ts')) found.push(path);
    }
    return found;
  };
  return walk(join('web', 'src')).map((path) => path.split(sep).join('/'));
}

/** The declarations of one CSS rule, comments removed and whitespace collapsed. */
function rule(selector: string): string {
  const source = read(STYLES);
  const start = source.indexOf(`\n  ${selector} {`);
  expect(start, `${selector} is not declared as a rule in global.css`).toBeGreaterThan(-1);
  const end = source.indexOf('\n  }', start);
  expect(end, `${selector} has no closing brace`).toBeGreaterThan(start);
  return source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ');
}

/** The declared value of one custom property, whitespace collapsed. */
function token(name: string): string {
  const match = new RegExp(`--${name}:([\\s\\S]*?);`).exec(read(STYLES));
  expect(match, `--${name} is not declared in global.css`).not.toBeNull();
  // Collapsed, and with the newline a multi-line gradient leaves just inside the paren removed,
  // so `linear-gradient(\n  0deg,` reads as the function call it is.
  return (match?.[1] ?? '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').trim();
}

/* ------------------------------------------------------------------------ */
/* Task 1 — the message composer                                            */
/* ------------------------------------------------------------------------ */

describe('Task 1 — the message composer', () => {
  it('draws its frame as padding, because a gradient stroke cannot follow a radius', () => {
    const frame = rule('.composer-frame');
    expect(frame).toMatch(/padding: 1\.5px/);
    expect(frame).toMatch(/border-radius: var\(--radius-panel\)/);
    expect(frame).toMatch(/background-image: var\(--gradient-ring\)/);
    // The specular gleam is the light the ring leaves in the corner it is lit from.
    expect(rule('.composer-frame::after')).toMatch(/background-image: var\(--gradient-specular\)/);
  });

  it('never reaches for border-image to draw a gradient edge, anywhere in the product', () => {
    // `border-image` ignores `border-radius`: the corners square off, which is the single detail
    // that makes a panel look like a div. Every gradient edge in this product is a padded frame,
    // and this is the rule that keeps the next one from being written the other way.
    const offenders = [...uiSources(), 'web/src/styles/global.css'].filter((path) =>
      /border-image/.test(bare(path)),
    );
    expect(offenders).toEqual([]);
  });

  it('cuts the field into the same well every other control is cut into', () => {
    const composer = bare(join(AGENT, 'MessageComposer.tsx'));
    expect(composer).toMatch(/bg-surface-sunken/);
    // One field, and it grows rather than scrolling a fixed box.
    expect(composer.match(/<textarea/g)).toHaveLength(1);
    expect(composer).toMatch(/resize-none/);
    expect(composer).toMatch(/min-h-\[52px\]/);
  });

  it('builds the send control from the shared control family', () => {
    const composer = bare(join(AGENT, 'MessageComposer.tsx'));
    // No hand-rolled <button>: the accent face, its states, its focus ring and its disabled
    // treatment are the ones every other control in the product already has.
    expect(composer).not.toMatch(/<button/);
    expect(composer).toMatch(/from '\.\.\/Button'/);
    expect(composer).toMatch(/variant="primary"/);
    // The glyph sits in an inset well — the reference's glass, minus the blur, because there is
    // nothing behind a smooth accent fill for a backdrop blur to resolve.
    expect(composer).toMatch(/rounded-\[var\(--radius-inset\)\]/);
  });

  it('disables a tool only when it can say why, and says it', () => {
    const composer = bare(join(AGENT, 'MessageComposer.tsx'));
    expect(composer).toMatch(/disabled=\{tool\.blockedReason !== undefined\}/);
    // The tooltip wraps the control: a disabled control is `pointer-events: none` and can never
    // open one itself, so the reason would be unreachable if it were attached to the button.
    expect(composer).toMatch(/content=\{tool\.blockedReason \?\? tool\.label\}/);
    expect(composer).toMatch(/<Tooltip[\s\S]*?<span>[\s\S]*?<IconButton/);
  });

  it('refuses to send without a provider, and states the reason', () => {
    const composer = bare(join(AGENT, 'MessageComposer.tsx'));
    expect(composer).toMatch(/const blocked = blockedReason !== undefined/);
    // Two ways to be unable to send, and both disable the control: a stated reason, or nowhere to
    // send at all. A send button that looks live and does nothing is the failure mode here.
    expect(composer).toMatch(/const sendDisabled = blocked \|\| onSubmit === undefined/);
    expect(composer).toMatch(/disabled=\{sendDisabled\}/);
    expect(composer).toMatch(/disabled=\{blocked\}/);
    // The reason is the field's description as well as visible prose, so it is announced with the
    // field rather than only sitting beside it.
    expect(composer).toMatch(/aria-describedby': hintId/);
    expect(composer).toMatch(/<p id=\{hintId\}/);
  });

  it('offers examples as labels, not as shortcuts', () => {
    const composer = bare(join(AGENT, 'MessageComposer.tsx'));
    const at = composer.indexOf('{examples.map(');
    expect(at).toBeGreaterThan(-1);
    const block = composer.slice(at, composer.indexOf('{blockedReason ?', at));
    expect(block).toMatch(/<Badge/);
    expect(block).toMatch(/shape="tag"/);
    // Nothing in that block acts. A chip that looks pressable and fills or sends nothing is the
    // exact affordance the rest of this file refuses to ship.
    expect(block).not.toMatch(/onClick|href|<button|onValueChange/);
    expect(block).not.toMatch(/cursor-pointer/);
  });

  it('holds no chat wiring of its own', () => {
    const composer = bare(join(AGENT, 'MessageComposer.tsx'));
    // The seam is a value and a change callback, exactly as the surface had before. All the
    // transport, retry and streaming behaviour stays where it lives.
    expect(composer).not.toMatch(/fetch\(|XMLHttpRequest|EventSource|WebSocket/);
    expect(composer).not.toMatch(/useState|useEffect|useReducer/);
    expect(composer).toMatch(/onValueChange\(/);
  });

  it('is mounted on the workspace it was built for', () => {
    const page = read(PAGE);
    expect(page).toMatch(/<MessageComposer/);
    // Reachable through a barrel — the library's or the family's own, the way the brand and
    // realtime families already are — and never through a component's file path.
    expect(page).toMatch(/from '\.\.\/components(\/agent)?'/);
    expect(page).not.toMatch(/from '\.\.\/components\/agent\/[A-Z]/);
  });
});

/* ------------------------------------------------------------------------ */
/* Task 2 — the agent cards                                                 */
/* ------------------------------------------------------------------------ */

describe('Task 2 — the agent card', () => {
  it('is lit from below, which is what makes it not a panel', () => {
    // The panel lights its own top edge; the agent ring and its floor glow light the bottom. The
    // direction is the family signature, so it is the direction that is asserted.
    expect(token('gradient-panel')).toMatch(/^linear-gradient\(180deg/);
    expect(token('gradient-agent-ring')).toMatch(/^linear-gradient\(0deg/);
    expect(token('gradient-agent-glow')).toMatch(/^linear-gradient\(0deg/);

    // And the accent pools sit below the card's own bottom edge, so the light reads as coming off
    // the floor rather than out of the middle.
    const poolY = [...token('gradient-agent-glow').matchAll(/at\s+[\d.]+%\s+([\d.]+)%/g)].map(
      (match) => Number(match[1]),
    );
    expect(poolY.length).toBeGreaterThanOrEqual(2);
    for (const y of poolY) expect(y).toBeGreaterThan(100);
  });

  it('lights the ring the same way as the composer frame: as a padded band', () => {
    const card = bare(join(AGENT, 'AgentCard.tsx'));
    expect(card).toMatch(/agent-ring[^']*p-px/);
    // Outer radius on the frame, inner radius derived from it. The 1px difference *is* the ring.
    expect(card).toMatch(/rounded-\[var\(--radius-panel\)\]/);
    expect(card).toMatch(/rounded-\[calc\(var\(--radius-panel\)-1px\)\]/);
    expect(card).toMatch(/agent-glow/);
    // No stroke on the frame: a flat 1px colour is exactly what a gradient edge exists to avoid.
    expect(card).not.toMatch(/\bborder-(?!0\b)/);
  });

  it('clips the sweep, so a decorative band cannot scroll the page', () => {
    const active = rule('.agent-ring-active');
    expect(active).toMatch(/overflow: hidden/);
    const sweep = rule('.agent-ring-active::before');
    expect(sweep).toMatch(/width: 200%/);
    expect(sweep).toMatch(/position: absolute/);
    expect(sweep).toMatch(/animation: agent-ring-sweep/);
    expect(sweep).toMatch(/background-image: var\(--gradient-agent-sheen\)/);
  });

  it('spends the sweep on exactly one card, and lets it be turned off', () => {
    const page = read(PAGE);
    expect(page.match(/ring="active"/g)).toHaveLength(1);
    // The animation is declared outside the layers, and the global reduced-motion rule reaches
    // `*::before` — which is where this one is drawn.
    const styles = read(STYLES);
    expect(styles).toMatch(/@keyframes agent-ring-sweep/);
    const reduced = styles.slice(styles.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/animation-duration: 0\.001ms !important/);
    expect(reduced).toMatch(/\*::before/);
  });

  it('picks the list element once, so a sequence is never drawn as results', () => {
    const card = bare(join(AGENT, 'AgentCard.tsx'));
    // A tool-request path is a sequence; a list of ticks would say each step had already happened.
    // The component chooses the tag, so a caller cannot get the semantics wrong by reaching for
    // the wrong one at a call site.
    expect(card).toMatch(/const Component = ordered \? 'ol' : 'ul'/);
    expect(card).not.toMatch(/<ul|<ol/);
  });

  it('treats a row mark as punctuation rather than content', () => {
    const card = bare(join(AGENT, 'AgentCard.tsx'));
    // The sentence is the content. A screen reader announcing "check" before every row of every
    // card is noise, so the mark is hidden once, at the definition both marks share.
    const badge = card.slice(card.indexOf('export function AgentBadge'));
    expect(badge.slice(0, badge.indexOf('export function AgentCheck'))).toMatch(/aria-hidden/);
    // And the tick is a glyph with no text of its own, so the hidden mark announces nothing.
    expect(card).toMatch(/<Check size=\{10\} strokeWidth=\{3\} \/>/);
    // The header glyph is decorative for the same reason: the title beside it is the content.
    expect(card).toMatch(/<span aria-hidden className="shrink-0 text-text-faint">/);
  });

  it('names the pill shape instead of writing a radius at the call site', () => {
    const button = bare(join('web', 'src', 'components', 'Button.tsx'));
    expect(button).toMatch(/pill: 'rounded-\[var\(--radius-pill\)\]'/);
    const page = read(PAGE);
    expect(page).toMatch(/shape="pill"/);
    expect(page).not.toMatch(/rounded-\[var\(--radius-pill\)\]/);
  });

  it('is one family, used by the page rather than copied into it', () => {
    const sources = uiSources();
    // The primitives only exist in one place, and the page composes them.
    expect(sources.filter((path) => path.endsWith('MessageComposer.tsx'))).toEqual([
      'web/src/components/agent/MessageComposer.tsx',
    ]);
    expect(sources.filter((path) => path.endsWith('AgentCard.tsx'))).toEqual([
      'web/src/components/agent/AgentCard.tsx',
    ]);
    // A surface class defined in the stylesheet and referenced from a page would be the
    // copy-pasted variant this phase exists to avoid.
    const referencing = sources.filter((path) =>
      /composer-frame|agent-ring|agent-glow/.test(bare(path)),
    );
    expect(referencing).toEqual([
      'web/src/components/agent/AgentCard.tsx',
      'web/src/components/agent/MessageComposer.tsx',
      // Phase 7.2.2 turned the agent's under-lit face into the card system's `accent` variant, so
      // the glow now has one more *reader* and still no second definition: `Card` names the same
      // `agent-glow` utility rather than restating the gradient.
      'web/src/components/Card.tsx',
      // The inventory, which is where a gradient is registered before it can be used.
      'web/src/design/tokens.ts',
    ]);
    // And every gradient these classes reach is in that inventory, so a stylesheet rule can never
    // name a gradient that the token suite does not know exists.
    expect(bare('web/src/design/tokens.ts')).toMatch(/'--gradient-agent-ring'/);
    expect(bare('web/src/design/tokens.ts')).toMatch(/'--gradient-agent-glow'/);
    expect(bare('web/src/design/tokens.ts')).toMatch(/'--gradient-agent-sheen'/);
    expect(bare('web/src/design/tokens.ts')).toMatch(/'--gradient-ring'/);
    expect(bare('web/src/design/tokens.ts')).toMatch(/'--gradient-specular'/);
  });

  it('carries no fixed width, so the surface reflows on a phone', () => {
    // The reference fixes the composer at 260px. A fixed track is the thing that turns a design
    // into a horizontal scrollbar on a narrow screen, so neither primitive declares one and the
    // layout stays the grid's business.
    for (const file of ['MessageComposer.tsx', 'AgentCard.tsx']) {
      expect(bare(join(AGENT, file))).not.toMatch(/max-w-\[|width: \d+px/);
    }
    // And the card action is full-width by the control's own flag rather than by a wrapper width.
    expect(read(PAGE)).toMatch(/<Button[\s\S]{0,200}?fullWidth/);
  });
});
