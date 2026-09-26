/**
 * Phase 7.2 — the component system, as a contract rather than a stylesheet.
 *
 * Phase 7.1 named every value a screen may use. This phase spends them: it rebuilds the controls,
 * the content surfaces and the feedback surfaces so that each one is *composed* from those tokens
 * instead of approximating them, and gives the product a visual identity that a generic dashboard
 * does not have — layered surfaces, a lit top edge, a controlled accent.
 *
 * The rules below are the ones that make that identity hold together rather than drift:
 *
 *   1. **One control face per job.** Button variants are a closed set, and only two of them are
 *      *filled*. Filled means "this commits"; a status control is tinted, so a status never
 *      outranks the action beside it.
 *   2. **Glow is spent, not sprinkled.** Two button variants may glow and one card emphasis may,
 *      because those are the two decisions the theme reserves glow for.
 *   3. **A control is lit; a well is recessed.** Controls carry `--shadow-control` (a lit inset top
 *      edge plus a drop), wells carry `--shadow-control-inset`, and neither is two shadow utilities
 *      at once — `box-shadow` is one property, so the second would silently replace the first.
 *   4. **One feedback primitive.** `ErrorState`, `RealtimeNotification` and every toast render
 *      `Alert`; the six tones therefore cannot drift into six slightly different panels, and a
 *      seventh tone cannot be invented in a page.
 *   5. **Feedback never carries a payload.** No feedback surface can inject markup, and every one
 *      of them takes prose and typed codes rather than an exception, a response body or a prompt.
 *   6. **The new surfaces are actually rendered.** A component nobody mounts is a component nobody
 *      has looked at, so the exhibit that exercises the six tones and the toasts is asserted to be
 *      wired into a real screen.
 *
 * Everything here is read from the source, so the suite is offline and needs no browser.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALERT_TONES, ALERT_TONE_ROLE, TOAST_DURATIONS } from '../web/src/design/components.js';

const COMPONENTS = join('web', 'src', 'components');
const BARREL = join(COMPONENTS, 'index.ts');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * A source file with its block comments removed.
 *
 * The `not.toMatch` rules below are about code, and this repository's comments name the constructs
 * they explain — a doc block that says "`focus:outline-none` was removed deliberately" is prose
 * about a decision, not the decision. Reading only the code is what keeps the rule honest in both
 * directions.
 */
function code(path: string): string {
  return read(path).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** One component, by file name under `web/src/components`. */
function component(name: string): string {
  return read(join(COMPONENTS, `${name}.tsx`));
}

/** One component, with its block comments removed. */
function componentCode(name: string): string {
  return code(join(COMPONENTS, `${name}.tsx`));
}

/** The whitespace-separated class tokens in a map entry, quotes and concatenation removed. */
function classTokens(body: string): string[] {
  return body.replace(/['+]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * The body of one entry in a `Record`-shaped literal.
 *
 * Entries are located by their own key at the object's indent and run to the next such key, so an
 * assertion about a variant's classes does not depend on how the line happened to be wrapped. The
 * test above each map is what proves the map is complete; this only reads one member of it.
 */
function entry(source: string, key: string): string {
  const keys = [...source.matchAll(/\n {2}([A-Za-z][A-Za-z0-9]*):/g)].map((match) => ({
    name: match[1] ?? '',
    at: match.index ?? 0,
  }));
  const index = keys.findIndex((candidate) => candidate.name === key);
  expect(index, `${key} is not declared as an entry of this map`).toBeGreaterThan(-1);
  const start = keys[index]?.at ?? 0;
  const end = keys[index + 1]?.at ?? source.length;
  return source.slice(start, end);
}

/** Every `.tsx` under a component directory, so a new file is covered the day it is added. */
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

/* ------------------------------------------------------------------------ */
/* Task 1 — controls                                                        */
/* ------------------------------------------------------------------------ */

describe('Task 1 — the control family', () => {
  it('declares a closed set of button variants, with exactly two of them filled', () => {
    const button = component('Button');
    const variants = [
      'primary',
      'secondary',
      'ghost',
      'subtle',
      'danger',
      'success',
      'warning',
      'info',
    ];
    for (const variant of variants) {
      expect(button, `${variant} is not a button variant`).toMatch(
        new RegExp(`\\n {2}${variant}:`),
      );
    }

    // Filled means commit. Only the accent action and the destructive one get a solid tone face
    // (`bg-primary` / `bg-danger`); every other variant is a tinted well, a raised neutral or
    // nothing at all, which is what keeps a screen from carrying five competing buttons. Compared
    // token by token, because `bg-primary-soft` is a *tinted* face and must not read as filled.
    const filled = variants.filter((variant) =>
      classTokens(entry(button, variant)).some(
        (token) => token === 'bg-primary' || token === 'bg-danger',
      ),
    );
    expect(filled).toEqual(['primary', 'danger']);

    // And a filled control is lit from above: the face is the gradient, not the flat colour.
    expect(entry(button, 'primary')).toMatch(/control-accent/);
    expect(entry(button, 'danger')).toMatch(/control-danger/);
    // A neutral control shares the one sheen rather than inventing a gradient of its own.
    expect(entry(button, 'secondary')).toMatch(/control-sheen/);
    expect(entry(button, 'ghost')).not.toMatch(/control-(sheen|accent|danger)/);
  });

  it('spends the glow on the primary action and the destructive one, and stops there', () => {
    const button = component('Button');
    const glowing = [
      'primary',
      'secondary',
      'ghost',
      'subtle',
      'danger',
      'success',
      'warning',
      'info',
    ].filter((variant) => /shadow-glow/.test(entry(button, variant)));
    expect(glowing).toEqual(['primary', 'danger']);
    // The reason the destructive one exists as its own role: a filled red face carrying the green
    // control's shadow would read as the same weight as the green one.
    expect(entry(button, 'primary')).toMatch(/shadow-glow-control/);
    expect(entry(button, 'danger')).toMatch(/shadow-glow-danger/);
    // The status variants stay soft, so a status never reads as the committing action.
    for (const variant of ['success', 'warning', 'info']) {
      expect(entry(button, variant), variant).toMatch(/bg-(success|warning|info)-soft/);
      expect(entry(button, variant), variant).not.toMatch(/shadow-glow/);
    }
  });

  it('makes every control a lit face and every field a recess', () => {
    const button = component('Button');
    // A control's lighting is one stack, not a lift plus a separate edge: the resting shadow
    // already contains its lit top edge, so no variant needs two shadow utilities.
    expect(entry(button, 'secondary')).toMatch(/shadow-control\b/);

    const input = component('Input');
    // One face, declared once, used by the input, the textarea and the select: the twelve-class
    // string that used to be copy-pasted into three screens is gone.
    expect(input).toMatch(/const FIELD =/);
    expect(input.match(/shadow-control-inset/g)?.length).toBeGreaterThanOrEqual(2);
    expect(input).toMatch(/appearance-none/);
  });

  it('leaves one select implementation in the tree', () => {
    // The duplication this phase removed, asserted as an absence: a second copy of the control
    // class string is how the three copies drifted apart the first time (one had hover feedback,
    // two did not).
    const offenders = uiSources().filter((path) => read(path).includes('SELECT_CLASS'));
    expect(offenders).toEqual([]);
    // And the shared one is a real `<select>`, so the option list, keyboard behaviour and form
    // semantics are still the platform's.
    const input = component('Input');
    expect(input).toMatch(/<select/);
    expect(input).toMatch(/SelectHTMLAttributes/);
  });

  it('keeps the page-wide focus ring on a field instead of suppressing it', () => {
    // A text field is entered by keyboard, so replacing the ring with a border tint would remove
    // the only cue a keyboard user gets. The tint is added *alongside* focus-visible, not instead.
    const input = componentCode('Input');
    expect(input).not.toMatch(/focus:outline-none/);
    expect(input).toMatch(/focus:border-primary/);
    const css = read(join('web', 'src', 'styles', 'global.css'));
    expect(css).toMatch(/:focus-visible\s*\{/);
  });
});

/* ------------------------------------------------------------------------ */
/* Task 2 — content components                                              */
/* ------------------------------------------------------------------------ */

describe('Task 2 — content components', () => {
  it('gives a card a layered surface rather than a flat container', () => {
    const card = component('Card');
    for (const tone of ['default', 'raised', 'sunken']) {
      expect(card, `${tone} is not a card tone`).toMatch(new RegExp(`\\n {2}${tone}:`));
    }
    // The face is the entry's own value, not the slice up to the next key: the map's neighbours are
    // separated by comments that name the utilities, and a comment is not a class on the surface.
    // The slice opens on the newline that precedes the key, so the entry itself is the second line.
    const faceOf = (tone: string): string => (entry(card, tone).split('\n')[1] ?? '').trim();
    // A panel is lit: the surface, the panel gradient and the lit top edge travel together.
    for (const tone of ['default', 'raised']) {
      const body = faceOf(tone);
      expect(body, tone).toMatch(/shadow-panel/);
      expect(body, tone).toMatch(/panel-gradient/);
      expect(body, tone).toMatch(/edge-highlight/);
    }
    // A well is the inverse — recessed, and therefore not lit.
    expect(faceOf('sunken')).toMatch(/shadow-control-inset/);
    expect(faceOf('sunken')).not.toMatch(/edge-highlight/);
  });

  it('marks one card as the emphasis, and only that one glows', () => {
    const card = component('Card');
    const emphases = ['none', 'accent', 'success', 'warning', 'danger', 'info', 'ai'];
    for (const emphasis of emphases) {
      expect(card, `${emphasis} is not a card emphasis`).toMatch(new RegExp(`\\n {2}${emphasis}:`));
    }
    // Every non-neutral emphasis states its tone with an edge, which is what makes a state card
    // readable at a glance in a grid.
    for (const emphasis of ['success', 'warning', 'danger', 'info', 'ai', 'accent']) {
      expect(entry(card, emphasis), emphasis).toMatch(/border-[a-z]+-border/);
    }
    // Elevation level 3 is one accent surface that asks to be acted on, so `accent` is the only
    // emphasis that may reach for the accent glow — which is what this asserts, rather than the
    // name of the local it happens to be compared against: the glow is chosen once, and only
    // behind an `accent` test.
    const glowChoices = componentCode('Card')
      .split('\n')
      .filter((line) => line.includes("'shadow-glow'"));
    expect(glowChoices).toHaveLength(1);
    expect(glowChoices[0]).toMatch(/'accent' \?/);
    expect(componentCode('Card')).not.toMatch(/shadow-glow-danger|shadow-glow-control/);
  });

  it('gives a success badge a fill of its own', () => {
    const badge = component('Badge');
    // `success` used to borrow the brand teal's fill, so an "ok" pill and a brand pill were the
    // same object with two text colours. The tones must be distinguishable, not just ordered.
    expect(entry(badge, 'success')).toMatch(/bg-success-soft/);
    expect(entry(badge, 'success')).toMatch(/border-success-border/);
    // Two shapes, two jobs: a label and an identifier.
    expect(badge).toMatch(/BadgeShape/);
    expect(entry(badge, 'tag')).toMatch(/radius-mark/);
    expect(entry(badge, 'pill')).toMatch(/radius-pill/);
  });

  it('marks the active tab as a raised face on a recessed rail', () => {
    const tabs = component('Tabs');
    // The track is a well…
    expect(tabs).toMatch(/shadow-control-inset/);
    // …and the selection stands on it, with the accent rail as the one accent mark it gets.
    expect(tabs).toMatch(/group-data-\[state=active\]:opacity-100/);
    expect(tabs).toMatch(/data-\[state=active\]:shadow-control/);
    expect(tabs).toMatch(/bg-primary/);
    // The gradient layers are always present and toggled by opacity, because `control-sheen` is a
    // plain class and a plain class cannot take a `data-[state=…]:` variant.
    expect(tabs).toMatch(/control-sheen[\s\S]{0,120}group-data-\[state=active\]/);
  });

  it('keeps a tooltip in the same depth language as everything else', () => {
    const tooltip = component('Tooltip');
    // The smallest surface in the product is a raised surface too: same three tokens as a card.
    expect(tooltip).toMatch(/bg-surface-raised/);
    expect(tooltip).toMatch(/panel-gradient/);
    expect(tooltip).toMatch(/edge-highlight/);
    expect(tooltip).toMatch(/shadow-popover/);
  });

  it('draws the lit edge once, as a utility rather than everywhere', () => {
    // The signature detail of the whole phase. It is one rule, so a change to it changes every
    // raised surface together; components ask for it by name.
    const css = read(join('web', 'src', 'styles', 'global.css'));
    expect(css).toMatch(/\.edge-highlight::before\s*\{/);
    expect(css).toMatch(/background-image:\s*var\(--gradient-edge\)/);
    const users = uiSources().filter((path) => read(path).includes('edge-highlight'));
    // Cards, alerts, tooltips and the dialog: at least four surfaces share it, and none of them
    // reimplements a highlight of its own.
    expect(users.length).toBeGreaterThanOrEqual(4);
  });
});

/* ------------------------------------------------------------------------ */
/* Task 3 — feedback and overlays                                           */
/* ------------------------------------------------------------------------ */

describe('Task 3 — feedback and overlays', () => {
  it('keeps the six tones in one place, and the manifest agrees with them', () => {
    const alert = component('Alert');
    const declared = [
      ...alert.matchAll(/^ {2}(neutral|info|success|warning|error|destructive):/gm),
    ].map((match) => match[1] ?? '');
    expect([...new Set(declared)].sort()).toEqual([...ALERT_TONES].sort());
    // A tone is only a tone if it says which tones interrupt: three of them state a fact and three
    // of them ask the reader to stop.
    for (const tone of ALERT_TONES) {
      expect(ALERT_TONE_ROLE[tone], `${tone} has no role`).toMatch(/^(status|alert)$/);
    }
    expect(ALERT_TONES.filter((tone) => ALERT_TONE_ROLE[tone] === 'status')).toEqual([
      'neutral',
      'info',
      'success',
    ]);
    // Only the decision glows.
    expect(alert).toMatch(/'shadow-glow-danger'/);
    expect(alert.match(/shadow-glow/g)?.length).toBe(1);
  });

  it('never lets into a feedback surface anything but prose and a typed code', () => {
    const surfaces = ['Alert', 'Toast', 'ErrorState', 'realtime/RealtimeNotification'];
    for (const name of surfaces) {
      const source = componentCode(name);
      expect(source, `${name} can inject markup`).not.toMatch(/dangerouslySetInnerHTML/);
      expect(source, `${name} renders an exception`).not.toMatch(/\.(message|stack)\b/);
    }
    // The toast API takes a sentence, not a thrown thing.
    expect(component('Toast')).toMatch(/description\?: ReactNode/);
    expect(component('Toast')).not.toMatch(/error:\s*Error/);
  });

  it('renders one feedback primitive rather than four lookalike panels', () => {
    // `ErrorState` and a realtime notice are the failure tone of the same component now.
    expect(component('ErrorState')).toMatch(/<Alert/);
    expect(component('realtime/RealtimeNotification')).toMatch(/<Alert/);
    expect(component('Toast')).toMatch(/<Alert/);
    // So the tone vocabulary is imported from one module, not restated per surface.
    for (const name of ['ErrorState', 'Toast', 'realtime/RealtimeNotification']) {
      expect(component(name), name).toMatch(/from '\.\.?\/Alert'|from '\.\.\/Alert'/);
    }
  });

  it('gives each toast tone its own lifetime and never dismisses a decision', () => {
    const toast = component('Toast');
    // The times are not uniform because the tones are not: a confirmation is glanced at, a failure
    // has to be read. Those defaults live in the manifest so the contract is inspectable.
    expect([...Object.keys(TOAST_DURATIONS)].sort()).toEqual([...ALERT_TONES].sort());
    // A destructive prompt waits for a decision; every other tone eventually leaves.
    expect(TOAST_DURATIONS.destructive).toBe(0);
    for (const tone of ALERT_TONES) {
      if (tone === 'destructive') continue;
      expect(TOAST_DURATIONS[tone], `${tone} never leaves`).toBeGreaterThan(0);
    }
    expect(toast).toMatch(/options\.duration \?\? TOAST_DURATIONS\[tone\]/);
    // And reading it is not racing it.
    expect(toast).toMatch(/onMouseEnter=\{\(\) => setPaused\(true\)\}/);
    expect(toast).toMatch(/onFocusCapture=\{\(\) => setPaused\(true\)\}/);
  });

  it('announces each toast once', () => {
    const toast = component('Toast');
    // The container is a region, not a live region: every toast already carries `role="status"`
    // or `role="alert"`, and a live region wrapping live regions says everything twice.
    expect(toast).toMatch(/role="region"/);
    expect(componentCode('Toast')).not.toMatch(/aria-live/);
    expect(component('Alert')).toMatch(/role=\{alertRole\(tone\)\}/);
  });

  it('floats a toast above the dialog layer without blocking the page', () => {
    const toast = component('Toast');
    expect(toast).toMatch(/z-\[var\(--z-toast\)\]/);
    // A fixed container across the bottom of every screen is otherwise a dead zone.
    expect(toast).toMatch(/pointer-events-none/);
    expect(toast).toMatch(/pointer-events-auto/);
    // One provider, mounted once, so the queue is per application and not per page.
    expect(read(join('web', 'src', 'App.tsx'))).toMatch(/<ToastProvider>/);
  });

  it('opens a dialog one elevation level up, without a glow of its own', () => {
    const modal = component('Modal');
    // The scrim darkens *and* carries a faint brand wash, so a dialog opens inside the workstation
    // rather than on top of a plain grey sheet.
    expect(modal).toMatch(/bg-overlay/);
    expect(modal).toMatch(/overlay-veil/);
    // Level 2 of the elevation ladder: the raised surface and the popover shadow.
    expect(modal).toMatch(/bg-surface-raised/);
    expect(modal).toMatch(/shadow-popover/);
    // A dialog is neither the accent nor a destructive decision, so it spends no glow — a glowing
    // dialog would make the one accent surface on a screen ambiguous.
    expect(modal).not.toMatch(/shadow-glow/);
    expect(modal).toMatch(/edge-highlight/);
  });

  it('sizes the dialog fluidly rather than per device', () => {
    const modal = component('Modal');
    // No width is written for a device; the panel is a viewport fraction capped at an elevation
    // size, and the scroll region is capped in viewport units so a long form never exceeds the
    // screen it is on.
    expect(modal).toMatch(/w-\[92vw\]/);
    expect(modal).toMatch(/max-h-\[55vh\][^']*sm:max-h-\[62vh\]/);
    expect(modal).toMatch(/SIZES = \{ sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' \}/);
  });

  it('hangs a menu outside the box that holds its trigger, and inside the window', () => {
    const menu = component('AnchoredMenu');
    // Portalled, because the box a menu hangs over is usually a scroller. `overflow-x: auto`
    // computes `overflow-y` to `auto`, so a table's sideways scroll container clips its own rows
    // *vertically*: the panel was cut off at the container's bottom edge, and the container — which
    // has no vertical content — grew a scrollbar to reach the part of the menu it was hiding.
    // Nothing about the table is loosened to make room; the menu leaves instead.
    expect(menu).toMatch(/createPortal/);
    expect(menu).toMatch(/,\s*document\.body,/);
    expect(menu).toMatch(/'fixed z-\[var\(--z-modal\)\]/);
    // Placed from the trigger's own box, measured after the panel is in the DOM and before the
    // browser paints, so it is never drawn at a guessed position and then moved.
    expect(menu).toMatch(/useLayoutEffect/);
    expect(menu).toMatch(/anchor\.getBoundingClientRect\(\)/);
    expect(menu).toMatch(/panel\.getBoundingClientRect\(\)/);
    expect(menu).toMatch(/visibility: 'hidden'/);
    // The trigger's *end* edge, resolved rather than assumed — the same menu in either writing
    // direction — and the window's margin where that edge would take the panel off screen.
    expect(menu).toMatch(/getComputedStyle\(anchor\)\.direction === 'rtl'/);
    expect(menu).toMatch(/clamp\(left, VIEWPORT_MARGIN/);
    expect(menu).toMatch(/clamp\(top, VIEWPORT_MARGIN/);
    // And it opens upwards where downwards would leave the window, so the last row of a table
    // needs no special case.
    expect(menu).toMatch(/trigger\.top - height - TRIGGER_GAP/);
    // The anchor scrolls with the table it is in, so the panel is re-placed from the row's live box
    // rather than left behind — and the menu is dismissed only once that row has left the window.
    // Closing on the first scroll would be simpler, and it is the version that flashes and vanishes:
    // a scroll event from the interaction before the press arrives after the panel opens.
    expect(menu).toMatch(/addEventListener\('scroll', follow, true\)/);
    expect(menu).toMatch(/addEventListener\('resize', follow\)/);
    expect(menu).toMatch(/const onScreen =/);
    expect(menu).toMatch(/if \(!onScreen\) \{\s*closeRef\.current\(\);/);
    expect(menu).not.toMatch(/addEventListener\('scroll', close, true\)/);
  });

  it('keeps the journal’s row menu out of its own row', () => {
    const row = read(join('web', 'src', 'components', 'journal', 'TradeRow.tsx'));
    // The defect, asserted against coming back: the panel was an `absolute` child of the row.
    expect(row).not.toMatch(/absolute end-0 top-8/);
    expect(row).toMatch(/<AnchoredMenu/);
    // The trigger is the control that was pressed, so the panel is placed against the button
    // rather than against the cell — which is far wider than the button is.
    expect(row).toMatch(/setMenuAnchor\(event\.currentTarget\)/);
    expect(row).toMatch(/aria-haspopup="menu"/);
  });
});

/* ------------------------------------------------------------------------ */
/* The exhibit that keeps the new surfaces rendered                         */
/* ------------------------------------------------------------------------ */

describe('the feedback surfaces have a real consumer', () => {
  it('exhibits every tone, and is wired into a screen', () => {
    const exhibit = component('FeedbackStates');
    expect(exhibit).toMatch(/FeedbackStatesPanel/);
    // All six tones, taken from the manifest rather than retyped.
    expect(exhibit).toMatch(/ALERTS/);
    for (const tone of ALERT_TONES) {
      expect(exhibit, `${tone} is not exhibited`).toContain(`'${tone}'`);
    }
    // It raises real toasts through the shared provider, so the component is exercised and not
    // just imported.
    expect(exhibit).toMatch(/useToast\(\)/);
    expect(exhibit).toMatch(/toast\(\{/);
    // And the accent emphasis card is rendered rather than described: an unused emphasis is a
    // prop nobody has looked at, and the accent glow is the claim most worth eyeballing.
    expect(exhibit).toMatch(/<Card emphasis="accent">/);

    const settings = read(join('web', 'src', 'pages', 'SettingsPage.tsx'));
    expect(settings).toMatch(/<FeedbackStatesPanel/);
  });

  it('keeps every component in the single import surface', () => {
    const barrel = read(BARREL);
    for (const name of [
      'Alert',
      'alertRole',
      'Toast',
      'ToastProvider',
      'ToastViewport',
      'useToast',
      'Select',
      'FeedbackStatesPanel',
    ]) {
      expect(barrel, `${name} is missing from the component barrel`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
    }
    // And nothing was dropped while the family grew.
    for (const name of [
      'Button',
      'Card',
      'Badge',
      'Modal',
      'Input',
      'Tooltip',
      'Tabs',
      'Skeleton',
      'EmptyState',
      'ErrorState',
    ]) {
      expect(barrel, `${name} disappeared from the barrel`).toMatch(new RegExp(`\\b${name}\\b`));
    }
    // `Select` deliberately lives in `Input.tsx` rather than in a file of its own: it is a form
    // control, it wears the same field face, and splitting it out would have meant exporting that
    // face as a public constant for a second file to import.
    for (const file of ['Alert', 'Toast', 'FeedbackStates']) {
      expect(existsSync(join(COMPONENTS, `${file}.tsx`)), `${file}.tsx is missing`).toBe(true);
    }
    expect(component('Input')).toMatch(/export function Select/);
  });
});
