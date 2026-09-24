/**
 * Stage 11 — the presentation surface (Phase 7).
 *
 * Phase 7 built the product's UI layer: cards, tables, charts, indicators, and the responsive and
 * focus rules that hold them together. None of it takes input from the network, so the familiar
 * attack shapes — injection, authorization, exfiltration — have no target here, and saying that in
 * prose would be a claim. These twelve cases instead *attempt* the things this layer could still get
 * wrong, and each one fails loudly if the property it checks stops holding:
 *
 *   - **A value that selects a style.** The design system's knobs (`surface`, `emphasis`, `tone`,
 *     `density`, `as`) exist so a caller names an intent, not a utility. An open knob would let any
 *     value that reaches a component become a class name — which is how a "theme" prop becomes an
 *     element painted outside its card, or a `fixed inset-0` scrim nobody asked for.
 *   - **A content value that becomes code or a destination.** No markup sink, no dynamic evaluation,
 *     no navigation, and no class name flowing out of the domain modules.
 *   - **A cue that disappears.** Two of Phase 7's findings are in this stage: a focusable panel that
 *     drew no focus ring, and a 13px target. Neither is a remote exploit; both are ways a
 *     keyboard-only operator acts on a control they cannot see they selected.
 *   - **A figure that stops being a figure.** A signed number is a technical string, and in a
 *     right-to-left line a neutral sign moves to the wrong end of it.
 *
 * Ids continue the gate's sequence (`SEC-151`…): an attack id is a permanent handle, and the
 * knowledge base cites these for `VULN-007` and `VULN-008`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { observe, type Attack } from './harness.js';

/** Every `.ts`/`.tsx` file under the UI, with forward-slash paths. */
function uiSources(): string[] {
  const walk = (directory: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) found.push(...walk(path));
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(path);
    }
    return found;
  };
  return walk(join('web', 'src')).map((path) => path.split(sep).join('/'));
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** A source file with its comments removed: prose about a rule is not a declaration of one. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CARD = code('web/src/components/Card.tsx');
const TABS = code('web/src/components/Tabs.tsx');
const FRAME = code('web/src/components/charts/ChartFrame.tsx');
const BUTTON = code('web/src/components/Button.tsx');

/** Every file that carries product content rather than presentation. */
function contentSources(): string[] {
  return uiSources().filter(
    (file) => file.startsWith('web/src/mock/') || file.startsWith('web/src/api/'),
  );
}

export const STAGE_11: readonly Attack[] = [
  {
    id: 'SEC-151',
    stage: 11,
    category: 'Presentation surface',
    target: 'Card — the `surface` knob',
    severity: 'HIGH',
    boundary: 'a component intent must select from a closed set, never become a class name',
    run: () =>
      observe({
        what: 'a caller supplies an arbitrary string as a card surface',
        detection: 'the knob resolves through a closed record and has a documented fall-through',
        seen: 'SURFACE_FACE / SURFACE_BORDER are records and the unknown case falls through to the plain face',
        held:
          /const SURFACE_FACE: Record<CardSurface, string>/.test(CARD) &&
          /const SURFACE_BORDER: Record<CardSurface, string>/.test(CARD) &&
          /bespoke\s*\?/.test(CARD),
      }),
  },
  {
    id: 'SEC-152',
    stage: 11,
    category: 'Presentation surface',
    target: 'Card — `emphasis`, `tone`, `variant`',
    severity: 'MEDIUM',
    boundary: 'every visual state is a named entry, so no value can name its own colour',
    run: () => {
      const maps = (CARD.match(/Record<[A-Za-z]+,\s*string>/g) ?? []).length;
      return observe({
        what: 'a caller supplies an arbitrary string as a state or a tone',
        detection: 'each state is a `Record<…>` lookup with no concatenated utility',
        seen: `${maps} closed style maps, and no template literal builds a utility from a value`,
        held: maps >= 6 && !/`(?:text|bg|border)-\$\{/.test(CARD),
      });
    },
  },
  {
    id: 'SEC-153',
    stage: 11,
    category: 'Presentation surface',
    target: 'Card — `density`, `as`',
    severity: 'MEDIUM',
    boundary: 'the element a card renders as is chosen from a list the component owns',
    run: () =>
      observe({
        what: 'a caller supplies a tag name or a size name the component does not know',
        detection: '`as` is a union of element names and each is mapped in the component',
        seen: 'the element name is a closed union and the size scale is a record',
        held:
          /as\?: 'div' \| 'section' \| 'figure' \| 'article'/.test(CARD) &&
          /const DENSITY/.test(CARD) &&
          !/createElement\(as\b/.test(CARD),
      }),
  },
  {
    id: 'SEC-154',
    stage: 11,
    category: 'Presentation surface',
    target: 'the domain modules — content as a source of style',
    severity: 'MEDIUM',
    boundary: 'a record can supply data, never a class name or a stylesheet fragment',
    run: () => {
      const offenders = contentSources().filter((file) =>
        /className|class=|\bstyle=/.test(read(file)),
      );
      return observe({
        what: 'a record carries a utility or an inline style into the render tree',
        detection: 'no module under a content directory mentions a class name or a style attribute',
        seen:
          offenders.length === 0
            ? `${contentSources().length} content modules, none of them carries presentation`
            : `presentation found in ${offenders.join(', ')}`,
        held: offenders.length === 0,
      });
    },
  },
  {
    id: 'SEC-155',
    stage: 11,
    category: 'Presentation surface',
    target: 'scroll containers — a reader-only string that escapes its box',
    severity: 'HIGH',
    boundary: 'a hidden label may not widen the document, whatever row it sits in',
    regression: 'VULN-009',
    run: () => {
      const unpositioned: string[] = [];
      let scrollers = 0;
      for (const file of uiSources()) {
        for (const [index, line] of code(file).split('\n').entries()) {
          if (!/overflow-(x-)?(auto|scroll)/.test(line)) continue;
          scrollers += 1;
          if (!/\brelative\b/.test(line)) unpositioned.push(`${file}:${index + 1}`);
        }
      }
      return observe({
        what: 'an `sr-only` label inside a horizontally scrolling row is positioned against the card behind it',
        detection:
          'every scroll container is positioned, so its own clip contains its absolute descendants',
        seen:
          unpositioned.length === 0
            ? `${scrollers} scroll containers, all positioned`
            : `unpositioned: ${unpositioned.join(', ')}`,
        held: scrollers > 2 && unpositioned.length === 0,
      });
    },
  },
  {
    id: 'SEC-156',
    stage: 11,
    category: 'Presentation surface',
    target: 'numeric readouts under `dir="rtl"`',
    severity: 'HIGH',
    boundary: 'a signed figure keeps its sign on the side the reader of a terminal expects',
    run: () => {
      const css = read('web/src/styles/global.css');
      const num = css.slice(css.indexOf('  .num {'), css.indexOf('  .panel-gradient'));
      return observe({
        what: 'right-to-left text is placed beside a figure, and the sign is a neutral character',
        detection: '`.num` declares its own bidi context and a left-to-right direction',
        seen: 'the numeric utility isolates and fixes the direction of every figure it is applied to',
        held: /unicode-bidi: isolate;/.test(num) && /direction: ltr;/.test(num),
      });
    },
  },
  {
    id: 'SEC-157',
    stage: 11,
    category: 'Presentation surface',
    target: 'ChartFrame — the time axis',
    severity: 'MEDIUM',
    boundary: 'a series is never mirrored by the document direction',
    run: () =>
      observe({
        what: 'the document is set to right-to-left and a time series is drawn in it',
        detection: 'the frame pins the plot to `direction: ltr`',
        seen: 'the plot declares its own direction, so the axis cannot reverse under the labels',
        held:
          /direction: 'ltr'/.test(FRAME) &&
          /direction: 'ltr'/.test(code('web/src/design/trend.ts') + FRAME),
      }),
  },
  {
    id: 'SEC-158',
    stage: 11,
    category: 'Presentation surface',
    target: 'the render tree — a markup sink',
    severity: 'HIGH',
    boundary: 'no content can be interpreted as markup',
    run: () => {
      const sinks = [
        'dangerouslySetInnerHTML',
        'innerHTML',
        'outerHTML',
        'insertAdjacentHTML',
        'srcdoc',
      ];
      const found = uiSources().flatMap((file) =>
        sinks.filter((sink) => code(file).includes(sink)).map((sink) => `${file} (${sink})`),
      );
      return observe({
        what: 'a record value is rendered through a markup sink',
        detection: 'the frontend contains no sink that interprets a string as markup',
        seen: found.length === 0 ? 'no markup sink in the UI tree' : found.join(', '),
        held: found.length === 0,
      });
    },
  },
  {
    id: 'SEC-159',
    stage: 11,
    category: 'Presentation surface',
    target: 'the render tree — dynamic evaluation',
    severity: 'HIGH',
    boundary: 'no string is executed as code',
    run: () => {
      const found = uiSources().filter((file) =>
        /\beval\(|new Function\(|setTimeout\(\s*['"`]/.test(code(file)),
      );
      return observe({
        what: 'a value reaches an evaluator instead of a renderer',
        detection: 'no `eval`, no `new Function`, no string timer in the UI tree',
        seen: found.length === 0 ? 'no dynamic evaluation in the UI tree' : found.join(', '),
        held: found.length === 0,
      });
    },
  },
  {
    id: 'SEC-160',
    stage: 11,
    category: 'Presentation surface',
    target: 'the shell — navigation from content',
    severity: 'HIGH',
    boundary: 'no record can send the window somewhere',
    run: () => {
      const offenders: string[] = [];
      for (const file of uiSources()) {
        const source = code(file);
        if (/href=\{\s*[a-zA-Z]/.test(source)) offenders.push(`${file} (href from a value)`);
        if (/target=/.test(source)) offenders.push(`${file} (target)`);
        if (/javascript:/.test(source)) offenders.push(`${file} (javascript:)`);
        if (/window\.(open|location)\s*=/.test(source))
          offenders.push(`${file} (window navigation)`);
      }
      return observe({
        what: 'a record supplies a destination to the window',
        detection: 'no data-driven href, no target, no javascript: URL, no window navigation',
        seen: offenders.length === 0 ? 'no navigation sink in the UI tree' : offenders.join(', '),
        held: offenders.length === 0,
      });
    },
  },
  {
    id: 'SEC-161',
    stage: 11,
    category: 'Accessibility',
    target: 'the focus indication — a control the keyboard cannot see',
    severity: 'HIGH',
    boundary: 'a focusable element must show that it has focus',
    regression: 'VULN-007',
    run: () => {
      const allowed = new Set([
        'web/src/components/decisions/EvaluationPanels.tsx',
        'web/src/components/realtime/CancelTaskControl.tsx',
        'web/src/components/journal/TradeForm.tsx',
        'web/src/components/Modal.tsx',
        'web/src/components/journal/FullscreenChartViewer.tsx',
      ]);
      const offenders: string[] = [];
      for (const file of uiSources()) {
        for (const [index, line] of code(file).split('\n').entries()) {
          if (!/outline-(none|hidden)/.test(line)) continue;
          const cue = /ring-|shadow-|border-(primary|focus|strong)|underline/.test(line);
          if (!cue && !allowed.has(file)) offenders.push(`${file}:${index + 1}`);
        }
      }
      return observe({
        what: 'a class list suppresses the focus ring and draws nothing in its place',
        detection: 'every suppression sits beside a different cue, or is a named dialog surface',
        seen:
          offenders.length === 0
            ? 'no unexplained suppression in the tree, and the shared panels no longer suppress one'
            : offenders.join(', '),
        held: offenders.length === 0 && !/focus-visible:outline-none/.test(TABS),
      });
    },
  },
  {
    id: 'SEC-162',
    stage: 11,
    category: 'Accessibility',
    target: 'interactive targets — a control too small to operate',
    severity: 'MEDIUM',
    boundary: 'every control is at least the touch minimum, and the product’s own floor is higher',
    regression: 'VULN-008',
    run: () => {
      const sizes = BUTTON.slice(
        BUTTON.indexOf('const SIZES'),
        BUTTON.indexOf('};', BUTTON.indexOf('const SIZES')),
      );
      const heights = [...sizes.matchAll(/h-(\d+(?:\.\d+)?)/g)].map(
        (match) => Number(match[1]) * 4,
      );
      const hint = code('web/src/components/journal/JournalStatCard.tsx');
      const hintSized = /h-7 w-7/.test(hint) && /-my-1\.5/.test(hint);
      return observe({
        what: 'a control is offered below the minimum size a thumb can hit',
        detection:
          'the smallest button is 32px, and the figure hint is a 28px box with negative margins',
        seen: `smallest button ${Math.min(...heights)}px; figure hint ${hintSized ? '28px' : 'not sized'}`,
        held: heights.length > 2 && Math.min(...heights) >= 32 && hintSized,
      });
    },
  },
];
