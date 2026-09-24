/**
 * Phase 7.2.4 — the card *surfaces*, as a contract.
 *
 * Phase 7.2.2 gave the product one card and four knobs. That was right and it left one problem
 * standing: every screen took the defaults, so a page of twelve cards was twelve copies of one
 * plate and the only variety in the tree was whatever a page had added by hand. A metric card, a
 * chart, a dataset, a notice and a calculator all rendered as the same object, and a reader could
 * not tell — before reading a word — which was which.
 *
 * This phase adds one word to a card, `surface`, and the rules below are what keep the six of them
 * from collapsing back into one:
 *
 *   1. **Six, named, and distinct.** Each surface is a *name for a combination* of the four knobs,
 *      so two of them resolving to the same combination would be one kind of card wearing two
 *      names. That is asserted rather than assumed.
 *   2. **Every surface has a face.** A surface with no face of its own would silently take the
 *      generic one, which is the whole failure this phase set out to fix.
 *   3. **The faces differ from each other.** Pairwise distinct is the minimum for "controlled
 *      variety" to be a fact about the product rather than a claim in a comment.
 *   4. **`info` is the default, exactly.** A card with no surface must render what
 *      `surface="info"` renders, or the two would drift and the fall-through would become a
 *      seventh, undocumented treatment.
 *   5. **No typo can pass for a surface.** Every `surface="…"` in the tree must name a declared
 *      surface: an unknown one falls through to the default in the component, so a misspelling
 *      would render — looking deliberate — as a plain panel.
 *   6. **The effects stay in the box.** A face and a border may only name fills, shadows, gradient
 *      utilities and border colours. That is not a style preference: Phase 7.2.1 shipped a
 *      sideways-scrolling card because a decorative element was positioned outside its host, so the
 *      closed set here is the standing guard against the same class of defect.
 *   7. **One paint per face.** `background-image` is one property, so a face naming two gradient
 *      utilities would show whichever the stylesheet happened to order last.
 *
 * Everything is read from the source, so the suite is offline and needs no browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const CARD_PATH = join('web', 'src', 'components', 'Card.tsx');
const STYLESHEET_PATH = join('web', 'src', 'styles', 'global.css');

/** A source file with its comments removed, so prose about a value is not a declaration of it. */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

const CARD = readFileSync(CARD_PATH, 'utf8');
const CARD_CODE = strip(CARD);
const CSS = strip(readFileSync(STYLESHEET_PATH, 'utf8'));

/** The lines of a `{ … }` block, found by the line its header is declared on. */
function block(source: string, header: string): string {
  const start = source.indexOf(header);
  expect(start, `${header} is not declared`).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`${header} is not closed`);
}

/** The six surface names, from the union rather than from the preset table. */
const SURFACE_NAMES = (CARD_CODE.match(/export type CardSurface =([^;]+);/)?.[1] ?? '')
  .split('|')
  .map((name) => name.trim().replace(/'/g, ''))
  .filter(Boolean);

/** `name: 'value',` pairs, for a block whose entries are one line each. */
function stringEntries(source: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const match of source.matchAll(/^\s*(\w+):\s*'([^']*)',/gm)) {
    entries[match[1] as string] = match[2] as string;
  }
  return entries;
}

/** `{ tone: 'raised', variant: 'plain', … },` per surface, one entry per line. */
function surfacePresets(): Record<string, Record<string, string>> {
  const presets: Record<string, Record<string, string>> = {};
  const body = block(CARD_CODE, 'export const CARD_SURFACES');
  for (const match of body.matchAll(/^\s*(\w+):\s*\{([^}]*)\}/gm)) {
    const knobs: Record<string, string> = {};
    for (const knob of match[2]!.matchAll(/(\w+):\s*'([^']*)'/g)) {
      knobs[knob[1] as string] = knob[2] as string;
    }
    presets[match[1] as string] = knobs;
  }
  return presets;
}

const TONES = stringEntries(block(CARD_CODE, 'const TONES'));
const FLOOD = CARD_CODE.match(/const FLOOD = '([^']+)'/)?.[1] ?? '';

/** The class tokens of a face expression, with the file's two shorthands resolved. */
function faceTokens(expression: string): string[] {
  return expression
    .replace(/\bFLOOD\b/g, FLOOD)
    .replace(/TONES\.(\w+)/g, (_, tone: string) => TONES[tone] ?? '')
    .replace(/cn\(|\)|'/g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
}

/** Every surface's face, as tokens. */
function surfaceFaces(): Record<string, string[]> {
  const faces: Record<string, string[]> = {};
  const body = block(CARD_CODE, 'const SURFACE_FACE');
  for (const match of body.matchAll(/^\s*(\w+):\s*(.+?),?$/gm)) {
    faces[match[1] as string] = faceTokens(match[2] as string);
  }
  return faces;
}

const BORDERS = stringEntries(block(CARD_CODE, 'const SURFACE_BORDER'));

/** Every `.ts`/`.tsx` file under the UI, comments removed, with forward-slash paths. */
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

/** Every `surface="…"` asked for in the tree, with the file that asked. */
function requestedSurfaces(): { name: string; file: string }[] {
  const requested: { name: string; file: string }[] = [];
  for (const file of uiSources()) {
    const source = strip(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/surface="([\w-]*)"/g)) {
      requested.push({ name: match[1] as string, file });
    }
  }
  return requested;
}

/**
 * The closed set a face or a border may be built from.
 *
 * A fill, a depth, a paint or a border colour — and nothing else. There is deliberately no room
 * here for a width, a height, a position, a transform, an overflow rule or an animation: a card's
 * appearance may not touch its box, because the box belongs to the layout that placed it.
 */
const ALLOWED_TOKEN =
  /^(bg-[\w-]+|shadow-[\w-]+|border-[\w-]+|panel-gradient|face-corner|face-lintel|agent-glow|edge-highlight|edge-under)$/; /**
 * Anything that would move or resize the card, or paint outside it.
 *
 * `^-?inset-` rather than `inset`: `shadow-control-inset` is a depth token and contains the word by
 * accident, which is exactly the kind of near-miss a substring rule gets wrong in both directions.
 */
const LEAVES_THE_BOX =
  /overflow|absolute|fixed|sticky|relative|translate|scale-|rotate|^-?inset-|^-?(top|right|bottom|left)-|^[wh]-|^z-|animate|transition/;

/** The utilities that paint the card's own `background-image`. */
const PAINTS = ['panel-gradient', 'face-corner', 'face-lintel', 'agent-glow'];

describe('the six card surfaces, as one closed set', () => {
  it('names exactly six surfaces, and says what each is for', () => {
    expect(SURFACE_NAMES).toEqual(['featured', 'metric', 'data', 'info', 'action', 'utility']);
    // Every name is a word a reader can act on, not an abbreviation of a CSS property.
    expect(CARD).toMatch(/export type CardSurface = 'featured' \| 'metric' \| 'data'/);
  });

  it('is a name for a combination of the four knobs, and not a fifth one', () => {
    // The claim `surface` makes is that it is a *name for a combination*: if it ever acquired a
    // knob of its own, this is the assertion that would fail and say so.
    const presets = surfacePresets();
    expect(Object.keys(presets).sort()).toEqual([...SURFACE_NAMES].sort());
    for (const [name, knobs] of Object.entries(presets)) {
      expect(Object.keys(knobs).sort(), `${name} is not four knobs`).toEqual([
        'density',
        'emphasis',
        'tone',
        'variant',
      ]);
    }
  });

  it('gives every surface a combination no other surface has', () => {
    // Two names that resolved to the same four values would be one card wearing two names, and a
    // call site asking for the second would be asking for nothing.
    const presets = surfacePresets();
    const seen = new Map<string, string>();
    for (const [name, knobs] of Object.entries(presets)) {
      const signature = ['tone', 'variant', 'emphasis', 'density']
        .map((knob) => knobs[knob])
        .join('/');
      const already = seen.get(signature);
      expect(already, `${name} is ${already} under another name`).toBeUndefined();
      seen.set(signature, name);
    }
  });

  it('only uses knob values the knob actually declares', () => {
    // A typo here would be silent: the preset would type-check against `Record<string, string>` in
    // the parsers above and the card would simply fall back, so the values are checked against the
    // unions the component declares.
    const unions: Record<string, string[]> = {
      tone: ['default', 'raised', 'sunken'],
      variant: ['plain', 'accent'],
      emphasis: ['none', 'accent', 'success', 'warning', 'danger', 'info', 'ai'],
      density: ['compact', 'cozy', 'spacious'],
    };
    for (const union of Object.keys(unions)) {
      const declared = CARD_CODE.match(new RegExp(`export type Card\\w+ =([^;]+);`));
      expect(declared, `${union} has no declared union`).not.toBeNull();
    }
    for (const [name, knobs] of Object.entries(surfacePresets())) {
      for (const [knob, value] of Object.entries(knobs)) {
        expect(unions[knob], `${knob} is not a knob`).toBeDefined();
        expect(unions[knob], `${name}.${knob} = '${value}' is not a ${knob}`).toContain(value);
      }
    }
  });
});

describe('every surface has a face of its own', () => {
  it('declares a face and a border for each of the six', () => {
    expect(Object.keys(surfaceFaces()).sort()).toEqual([...SURFACE_NAMES].sort());
    expect(Object.keys(BORDERS).sort()).toEqual([...SURFACE_NAMES].sort());
  });

  it('gives no two surfaces the same face', () => {
    const faces = surfaceFaces();
    const seen = new Map<string, string>();
    for (const [name, tokens] of Object.entries(faces)) {
      const signature = [...tokens].sort().join(' ');
      const already = seen.get(signature);
      expect(already, `${name} has the face of ${already}`).toBeUndefined();
      seen.set(signature, name);
    }
  });

  it('makes `info` exactly the panel a card with no surface renders', () => {
    // The fall-through is a documented behaviour, not an accident: `plainFace` is the answer for a
    // card that was given no surface, and `info` must be that same answer.
    expect(TONES['default']).toBe('bg-surface shadow-panel panel-gradient edge-highlight');
    expect(surfaceFaces()['info']).toEqual(
      faceTokens("'bg-surface shadow-panel panel-gradient edge-highlight'"),
    );
    expect(CARD_CODE).toMatch(/function plainFace\(/);
    expect(CARD_CODE).toMatch(/return TONES\[tone\];/);
    expect(BORDERS['info']).toBe('border-border');
  });

  it('reads its own face back off the DOM, so the contract is inspectable', () => {
    expect(CARD_CODE).toMatch(/'data-surface': surface/);
    expect(CARD_CODE).toMatch(/data-density=\{resolvedDensity\}/);
  });
});

describe('the effects are bounded by the card', () => {
  it('builds every face from fills, depths, paints and border colours only', () => {
    for (const [name, tokens] of Object.entries(surfaceFaces())) {
      for (const token of tokens) {
        expect(token, `${name} face: '${token}' is not a surface token`).toMatch(ALLOWED_TOKEN);
      }
    }
    for (const [name, border] of Object.entries(BORDERS)) {
      expect(border, `${name} border`).toMatch(/^border-[\w-]+$/);
    }
  });

  it('never lets a face move, resize or paint outside the card', () => {
    // The regression this exists for: a decorative element positioned outside its host counted
    // toward the document's scroll width and made the whole viewport scroll sideways.
    for (const [name, tokens] of Object.entries(surfaceFaces())) {
      for (const token of tokens) {
        expect(token, `${name} face: '${token}' leaves the card's box`).not.toMatch(LEAVES_THE_BOX);
      }
    }
  });

  it('names at most one gradient utility per face', () => {
    // `background-image` is a single property, so two paints would leave the winner to the
    // stylesheet's ordering rather than to the surface that asked for it.
    for (const [name, tokens] of Object.entries(surfaceFaces())) {
      const paints = tokens.filter((token) => PAINTS.includes(token));
      expect(paints.length, `${name} names ${paints.join(' + ')}`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the top hairline and the under-lit one apart', () => {
    for (const [name, tokens] of Object.entries(surfaceFaces())) {
      expect(
        tokens.includes('edge-highlight') && tokens.includes('edge-under'),
        `${name} is lit from above and below at once`,
      ).toBe(false);
    }
  });

  it('declares the two new utilities once each, over tokens that exist', () => {
    for (const utility of ['face-corner', 'face-lintel']) {
      const declarations = CSS.match(new RegExp(`\\.${utility} \\{`, 'g')) ?? [];
      expect(declarations.length, `.${utility} is declared ${declarations.length} times`).toBe(1);
    }
    for (const token of [
      '--gradient-corner',
      '--gradient-lintel',
      '--shadow-plate',
      '--shadow-frame',
    ]) {
      // Declared exactly once in the theme, so a second definition cannot quietly win.
      const declarations = CSS.match(new RegExp(`${token}:`, 'g')) ?? [];
      expect(declarations.length, `${token} is declared ${declarations.length} times`).toBe(1);
    }
    // The corner light and the lintel are pools and bands inside the element's own box: gradients,
    // never a positioned element, and both stops reachable without leaving the padding box.
    const corner = CSS.slice(CSS.indexOf('--gradient-corner:'), CSS.indexOf('--gradient-lintel:'));
    expect(corner).toMatch(/radial-gradient|linear-gradient/);
    expect(corner).not.toMatch(/absolute|position|translate/);
    const lintel = CSS.slice(
      CSS.indexOf('--gradient-lintel:'),
      CSS.indexOf('--gradient-lintel:') + 500,
    );
    expect(lintel).toMatch(/linear-gradient/);
    expect(lintel).toMatch(/--color-primary/);
    expect(lintel).not.toMatch(/absolute|position|translate/);
  });
});

describe('the variety is in the product, not only in the table', () => {
  it('asks for nothing but a declared surface', () => {
    const requested = requestedSurfaces();
    expect(requested.length).toBeGreaterThan(30);
    for (const { name, file } of requested) {
      expect(SURFACE_NAMES, `${file} asks for surface="${name}"`).toContain(name);
    }
  });

  it('uses every surface somewhere, so no name is documentation only', () => {
    const used = new Set(requestedSurfaces().map(({ name }) => name));
    // `info` is the one name that is used without being written: it *is* the fall-through, so every
    // card in the product without a `surface` is asking for it. `Card` reads it back as
    // `data-surface="info"` only when it is asked for by name, which is why the tree may not
    // mention it and why the rule below is about the other five.
    expect(used.has('info'), 'surface="info" is written out somewhere, which is redundant').toBe(
      false,
    );
    for (const name of SURFACE_NAMES.filter((candidate) => candidate !== 'info')) {
      expect(used.has(name), `nothing in the tree asks for surface="${name}"`).toBe(true);
    }
  });

  it('leaves most cards unannotated, because the default is a decision too', () => {
    // The failure this phase corrects is uniformity, and its cure is not to annotate everything:
    // a page where all twelve cards carry a surface has moved the uniformity, not removed it. The
    // informational panel stays the majority and this asserts that it does.
    const cards = uiSources().reduce((total, file) => {
      const source = strip(readFileSync(file, 'utf8'));
      return total + (source.match(/<Card\b[^>]*?(?:\/>|>)|<Card\b/g)?.length ?? 0);
    }, 0);
    const requested = requestedSurfaces().length;
    expect(requested / cards).toBeLessThan(0.6);
  });

  it('gives each surface to more than one card, so a treatment is a language', () => {
    const counts = new Map<string, number>();
    for (const { name } of requestedSurfaces()) counts.set(name, (counts.get(name) ?? 0) + 1);
    for (const name of ['featured', 'metric', 'data', 'utility']) {
      expect(counts.get(name) ?? 0, `surface="${name}" is spent once`).toBeGreaterThan(1);
    }
  });
});
