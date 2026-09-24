/**
 * Phase 7.2.2 — colour harmony, the semantic vocabulary, and the one card system.
 *
 * Phase 7.1 built the foundations and asserted the ladders were *ordered*; Phase 7.2 made a state's
 * fill and its edge a pair. Both left the same two questions open, and this suite is those two:
 *
 *   1. **Is the palette a harmony or a collection?** Every accent is placed on one wheel relative to
 *      one brand hue, and the relationship is not a comment — the suite re-derives each hue from the
 *      stylesheet and checks the angle the manifest declares. The defect this closes is concrete:
 *      `--color-primary` and `--color-success` were *seven degrees* apart, so the brand accent and
 *      the confirmation green were one colour with two names, and no amount of ordering would have
 *      caught it.
 *
 *   2. **Is a colour's meaning stated once?** `SEMANTIC_USAGE` names the token behind each state
 *      (a gain, a caution, an unavailable thing) and `CONTRAST_RULES` measures the pairs it creates,
 *      so "the palette is legible" is a measurement rather than a claim. Contrast is checked against
 *      every surface a token can actually sit on, because a caption that clears its floor on a panel
 *      and fails on a raised one is still unreadable half the time.
 *
 * And one structural rule the phase earned: **the card shell and the well may only be written in
 * `Card.tsx`.** Duplicating them by hand is what produced fifty-seven copies of one string, so the
 * suite fails on the literal rather than trusting a review to notice. The exceptions are listed with
 * their reasons — a control or a mark owns states a surface does not.
 *
 * Everything here is read from the source, so the suite is offline and needs no browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_FAMILIES,
  BRAND_HUE,
  CONTRAST_RULES,
  MIN_HUE_SEPARATION,
  NEUTRAL_AXIS,
  SEMANTIC_USAGE,
  STATE_ON_FILL_RULES,
} from '../web/src/design/tokens.js';

const STYLESHEET = join('web', 'src', 'styles', 'global.css');
const CSS = readFileSync(STYLESHEET, 'utf8');

/** The stylesheet with its comments removed, so a token named in prose is not a declaration. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

function themeBlock(css: string): string {
  const start = css.indexOf('@theme {');
  expect(start, 'the stylesheet declares no @theme block').toBeGreaterThan(-1);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error('the @theme block is not closed');
}

const DECLARED = new Map<string, string>();
for (const match of themeBlock(CODE).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  const name = match[1];
  const declaration = match[2];
  if (name !== undefined && declaration !== undefined) {
    DECLARED.set(name, declaration.trim());
  }
}

/** A hex token's value, or a failure naming the token that is missing. */
function value(token: string): string {
  const declared = DECLARED.get(token);
  expect(declared, `${token} is not declared in ${STYLESHEET}`).toBeDefined();
  expect(declared, `${token} is not a hex colour`).toMatch(/^#[0-9a-f]{6}$/);
  return declared ?? '';
}

function channels(hex: string): [number, number, number] {
  return [0, 2, 4].map((offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16)) as [
    number,
    number,
    number,
  ];
}

/** Hue, saturation and lightness of a hex colour, in degrees and percentages. */
function hsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const [r, g, b] = channels(hex).map((channel) => channel / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const span = max - min;
  let hue = 0;
  if (span !== 0) {
    if (max === r) hue = ((g - b) / span) % 6;
    else if (max === g) hue = (b - r) / span + 2;
    else hue = (r - g) / span + 4;
  }
  const saturation = span === 0 ? 0 : span / (1 - Math.abs(2 * lightness - 1));
  return {
    hue: Math.round((((hue * 60) % 360) + 360) % 360),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  };
}

/** The shorter way round the wheel between two hues, in degrees. */
function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) =>
    channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, always the lighter over the darker. */
function contrast(one: string, other: string): number {
  const [lighter, darker] = [luminance(one), luminance(other)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every `.ts`/`.tsx` under web/src, so a new file is covered the day it is added. */
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

describe('Task 1 — the accents are one harmony on one wheel', () => {
  it('declares each family with a base, a well and an edge that all exist', () => {
    // A family is a base and the two surfaces cut from it. `soft` and `border` are optional only
    // because a hue that is never a surface (the focus ring) does not get to invent a panel.
    expect(ACCENT_FAMILIES.length).toBeGreaterThanOrEqual(5);
    for (const family of ACCENT_FAMILIES) {
      expect(family.role.length, 'a family with no role is a colour').toBeGreaterThan(0);
      value(family.base);
      if (family.soft !== undefined) value(family.soft);
      if (family.border !== undefined) value(family.border);
      // A base without an edge is a text colour; a base with a well *must* have the edge, or the
      // fill is the muddy panel the token pair exists to prevent.
      if (family.soft !== undefined) {
        expect(family.border, `${family.role} has a well but no edge`).toBeDefined();
      }
    }
  });

  it('re-derives every declared hue from the stylesheet', () => {
    // The manifest saying `hue: 190` is worth nothing unless the stylesheet agrees, so the suite
    // reads the hex and computes it. A tolerance of 2 degrees absorbs rounding, not drift.
    for (const family of ACCENT_FAMILIES) {
      const measured = hsl(value(family.base)).hue;
      expect(
        Math.abs(measured - family.hue),
        `${family.base} is ${measured} degrees, the manifest says ${family.hue}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('has exactly one brand, at the hue the separation rule measures against', () => {
    const brands = ACCENT_FAMILIES.filter((family) => family.relationship === 'brand');
    expect(brands).toHaveLength(1);
    expect(brands[0]?.base).toBe('--color-primary');
    expect(brands[0]?.hue).toBe(BRAND_HUE);
    expect(hsl(value('--color-primary')).hue).toBe(BRAND_HUE);
  });

  it('keeps every other accent far enough from the brand to be its own colour', () => {
    // The defect this exists to prevent, in one number: brand and confirmation were seven degrees
    // apart. Twenty is the floor at which a state stops reading as the accent wearing a hat, and it
    // is a floor on the *pair*, so neither token can move closer without failing.
    const brand = hsl(value('--color-primary')).hue;
    for (const family of ACCENT_FAMILIES) {
      if (family.relationship === 'brand') continue;
      const gap = hueGap(hsl(value(family.base)).hue, brand);
      expect(
        gap,
        `${family.base} is ${gap} degrees from the brand (--color-primary)`,
      ).toBeGreaterThanOrEqual(MIN_HUE_SEPARATION);
    }
  });

  it('states each relationship as the angle it actually is', () => {
    // `analogous` is a neighbouring hue and `complementary` is one past the far side, so the word in
    // the manifest is checkable rather than editorial. This is what caught confirmation being
    // classified as complementary while sitting 38 degrees from the brand.
    const brand = hsl(value('--color-primary')).hue;
    for (const family of ACCENT_FAMILIES) {
      if (family.relationship === 'brand') continue;
      const gap = hueGap(hsl(value(family.base)).hue, brand);
      if (family.relationship === 'analogous') {
        expect(gap, `${family.base} is ${gap} degrees and is not analogous`).toBeLessThan(90);
      } else {
        expect(
          gap,
          `${family.base} is ${gap} degrees and is not complementary`,
        ).toBeGreaterThanOrEqual(90);
      }
    }
    // Both relationships are actually used, or one of them is a word with no meaning.
    const used = new Set(ACCENT_FAMILIES.map((family) => family.relationship));
    expect([...used].sort()).toEqual(['analogous', 'brand', 'complementary']);
  });

  it('builds the neutrals on one axis rather than scattering them', () => {
    // Every non-state surface, edge and ink shares a narrow band of hue and a bounded saturation:
    // that is what makes a dark interface read as one material. Widen either and the greys start
    // looking tinted against each other.
    const [lowHue, highHue] = NEUTRAL_AXIS.hue;
    const [lowSaturation, highSaturation] = NEUTRAL_AXIS.saturation;
    expect(NEUTRAL_AXIS.tokens.length).toBeGreaterThanOrEqual(10);
    for (const token of NEUTRAL_AXIS.tokens) {
      const { hue, saturation } = hsl(value(token));
      expect(hue, `${token} is ${hue} degrees, outside the neutral axis`).toBeGreaterThanOrEqual(
        lowHue,
      );
      expect(hue, `${token} is ${hue} degrees, outside the neutral axis`).toBeLessThanOrEqual(
        highHue,
      );
      expect(
        saturation,
        `${token} is ${saturation}% saturated, which is a tint and not a neutral`,
      ).toBeLessThanOrEqual(highSaturation);
      expect(saturation).toBeGreaterThanOrEqual(lowSaturation);
    }
  });
});

describe('Task 3 — the semantic vocabulary', () => {
  it('names a token for every state the interface can state', () => {
    const states = SEMANTIC_USAGE.map((usage) => usage.state);
    // The list Task 3 asks for, and it is a closed list: a new state means naming what it means.
    for (const required of [
      'positive',
      'negative',
      'neutral',
      'warning',
      'information',
      'error',
      'active',
      'inactive',
      'selected',
      'unselected',
      'unavailable',
    ]) {
      expect(states, `${required} has no meaning declared`).toContain(required);
    }
    expect(new Set(states).size).toBe(states.length);
    for (const usage of SEMANTIC_USAGE) {
      value(usage.ink);
      if (usage.fill !== undefined) value(usage.fill);
      if (usage.edge !== undefined) value(usage.edge);
      expect(usage.means.length, `${usage.state} says nothing about what it means`).toBeGreaterThan(
        0,
      );
    }
  });

  it('never gives a state a fill without an edge', () => {
    // One direction only, and deliberately: a tinted panel with a neutral rim reads as a rendering
    // mistake, so a fill implies its edge. The converse is not true and must not be asserted — an
    // unselected option and an unavailable one are *outlined* states, and a border around nothing
    // is exactly how "offered but not active" is drawn.
    for (const usage of SEMANTIC_USAGE) {
      if (usage.fill === undefined) continue;
      expect(usage.edge, `${usage.state} has a fill but no edge to pair with it`).toBeDefined();
    }
    const surfaces = SEMANTIC_USAGE.filter((usage) => usage.fill !== undefined);
    expect(surfaces.length).toBeGreaterThanOrEqual(5);
    const outlined = SEMANTIC_USAGE.filter(
      (usage) => usage.fill === undefined && usage.edge !== undefined,
    );
    expect(outlined.length, 'an outlined state is part of the vocabulary').toBeGreaterThanOrEqual(
      2,
    );
  });

  it('never lets a state wear the brand accent unless the state *is* the accent', () => {
    // `active` and `selected` are the accent on purpose — they mean "the current thing". An outcome
    // (`positive`, `negative`, `error` …) wearing the accent is the confusion the palette fix exists
    // to end, and it is stated here as a rule rather than left to whoever writes the next panel.
    const accentStates = new Set(['active', 'selected']);
    const accentTokens = new Set(['--color-primary', '--color-primary-soft']);
    for (const usage of SEMANTIC_USAGE) {
      if (accentStates.has(usage.state)) continue;
      expect(accentTokens.has(usage.ink), `${usage.state} is inked with the brand accent`).toBe(
        false,
      );
    }
    // And the pair that started it: confirmation and loss must not be the brand's colour.
    for (const state of ['positive', 'negative', 'error']) {
      const usage = SEMANTIC_USAGE.find((candidate) => candidate.state === state);
      expect(usage, `${state} is missing`).toBeDefined();
      expect(usage?.ink, state).not.toBe('--color-primary');
    }
  });

  it('keeps every state distinguishable from the brand, not merely different', () => {
    // "Different token" is not "different colour". Every outcome state is measured on the wheel
    // against the brand's hue, so a state that drifted back towards the accent fails here.
    const brand = hsl(value('--color-primary')).hue;
    for (const state of ['positive', 'negative', 'warning', 'information']) {
      const usage = SEMANTIC_USAGE.find((candidate) => candidate.state === state);
      const gap = hueGap(hsl(value(usage?.ink ?? '--color-text')).hue, brand);
      expect(gap, `${state} sits ${gap} degrees from the brand`).toBeGreaterThanOrEqual(
        MIN_HUE_SEPARATION,
      );
    }
  });
});

describe('Task 3 — contrast and readability', () => {
  it('clears the floor on every pair the interface actually renders', () => {
    // One row per reading a person does: body text on the page and on both card layers, secondary
    // and annotation text on each, ink on a filled control, the focus ring, and the two edges.
    expect(CONTRAST_RULES.length).toBeGreaterThanOrEqual(12);
    for (const rule of CONTRAST_RULES) {
      const measured = contrast(value(rule.ink), value(rule.ground));
      expect(
        measured,
        `${rule.subject}: ${rule.ink} on ${rule.ground} is ${measured.toFixed(2)}:1, needs ${rule.min}:1`,
      ).toBeGreaterThanOrEqual(rule.min);
    }
  });

  it('checks the annotation ink against every surface it can land on', () => {
    // A caption is only legible if it is legible everywhere it appears. This is the assertion that
    // moved `--color-text-faint` up the ladder: it was 3.37:1 on a card and 3.15:1 on a raised one.
    const surfaces = ['--color-surface', '--color-surface-raised', '--color-surface-sunken'];
    const inks = ['--color-text', '--color-text-muted', '--color-text-faint'];
    const checked: string[] = [];
    for (const ink of inks) {
      for (const surface of surfaces) {
        const measured = contrast(value(ink), value(surface));
        expect(measured, `${ink} on ${surface} is ${measured.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          4.5,
        );
        checked.push(`${ink} on ${surface}`);
      }
    }
    expect(checked).toHaveLength(9);
  });

  it('measures each state ink on the well it is stated on', () => {
    // Derived from the semantic list rather than written out again, so a state that gains a fill is
    // measured the moment it gains one.
    expect(STATE_ON_FILL_RULES.length).toBeGreaterThanOrEqual(5);
    for (const rule of STATE_ON_FILL_RULES) {
      const measured = contrast(value(rule.ink), value(rule.ground));
      expect(
        measured,
        `${rule.subject} is ${measured.toFixed(2)}:1, needs ${rule.min}:1`,
      ).toBeGreaterThanOrEqual(rule.min);
    }
  });

  it('keeps a state edge visible against both its own well and the page', () => {
    // An edge is a non-text indicator, so 3:1 is the AA floor for the *strongest* case, but a state
    // panel's rim is deliberately quiet — the floor here is the one that matters in practice: the
    // rim has to resolve against the fill it encloses, and against the page when it is the card's
    // own edge. Loss is the closest pair and the reason the floor is 1.15 rather than a rounder
    // number.
    const page = value('--color-bg');
    const rims = SEMANTIC_USAGE.filter(
      (usage) => usage.edge !== undefined && usage.fill !== undefined,
    );
    expect(rims.length).toBeGreaterThanOrEqual(5);
    for (const usage of rims) {
      const onItsWell = contrast(value(usage.edge ?? ''), value(usage.fill ?? ''));
      expect(
        onItsWell,
        `${usage.edge} on ${usage.fill} is ${onItsWell.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(1.15);
      const onThePage = contrast(value(usage.edge ?? ''), page);
      expect(
        onThePage,
        `${usage.edge} on the page is ${onThePage.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(1.15);
    }
  });

  it('never makes colour the only signal', () => {
    // Every state in the vocabulary is described as a *meaning*, and the components carry that
    // meaning in words. The probe is the vocabulary itself: no state is named after a hue.
    const hues = ['red', 'green', 'blue', 'amber', 'yellow', 'purple', 'cyan', 'teal'];
    for (const usage of SEMANTIC_USAGE) {
      const wording = `${usage.state} ${usage.means}`.toLowerCase();
      for (const hue of hues) {
        expect(
          wording,
          `${usage.state} names the hue "${hue}" rather than the meaning`,
        ).not.toMatch(new RegExp(`\\b${hue}\\b`));
      }
    }
  });
});

describe('Task 2 — the shell and the well have one home', () => {
  /** The literal shapes this phase replaced. A copy of either is a card that drifted. */
  const SHELLS: readonly { pattern: RegExp; what: string }[] = [
    {
      pattern: /rounded-\[var\(--radius-panel\)\]\s*border\s+border-border\s+bg-surface\b/,
      what: 'a hand-written card shell',
    },
    {
      pattern: /rounded-\[var\(--radius-control\)\]\s*border\s+border-border\s+bg-surface-sunken/,
      what: 'a hand-written well',
    },
  ];

  /**
   * The surfaces that are allowed to write the shell themselves, each for a reason a card cannot
   * cover. A list with reasons rather than a looser pattern, because the point of the rule is that
   * the next exception has to be argued for in this file.
   */
  /** The one home. Not an exception: the shell is written here, on purpose. */
  const HOME = 'web/src/components/Card.tsx';

  const EXCEPTIONS: readonly { file: string; why: string }[] = [
    {
      file: 'web/src/components/Input.tsx',
      why: 'a form control owns its own focus ring and invalid state; it is not a surface',
    },
    {
      file: 'web/src/components/Tabs.tsx',
      why: 'a segmented rail is a control that scrolls, not a card',
    },
    {
      file: 'web/src/components/journal/TradeForm.tsx',
      why: 'the field controls inside the form',
    },
    {
      file: 'web/src/components/journal/TradeTable.tsx',
      why: 'the row page-size control',
    },
    {
      file: 'web/src/components/realtime/CancelTaskControl.tsx',
      why: 'a fixed-height control with its own focus-visible treatment',
    },
    {
      file: 'web/src/pages/AcademyPage.tsx',
      why: 'a fixed-size numbered mark, which is a figure and not a surface',
    },
    {
      file: 'web/src/pages/ExamsPage.tsx',
      why: 'a fixed-size numbered mark, which is a figure and not a surface',
    },
  ];

  it('writes the card shell and the well in exactly one place', () => {
    const allowed = new Set([HOME, ...EXCEPTIONS.map((exception) => exception.file)]);
    const offenders: string[] = [];
    for (const path of uiSources()) {
      if (allowed.has(path)) continue;
      const source = readFileSync(path, 'utf8');
      for (const { pattern, what } of SHELLS) {
        const match = source.match(pattern);
        if (match !== null) offenders.push(`${path}: ${what} (${match[0]})`);
      }
    }
    expect(
      offenders,
      'a card or well written by hand: use Card, CardTile, or add a reasoned exception',
    ).toEqual([]);
  });

  it('keeps every exception real, so the list cannot rot', () => {
    // An allowlist for a file that no longer needs it is how an allowlist becomes a loophole. The
    // home is not checked: it composes its shell from parts, so the literal never appears in it.
    for (const exception of EXCEPTIONS) {
      const source = readFileSync(exception.file, 'utf8');
      const matches = SHELLS.some(({ pattern }) => pattern.test(source));
      expect(matches, `${exception.file} is listed but no longer writes a shell by hand`).toBe(
        true,
      );
      expect(exception.why.length, `${exception.file} has no reason`).toBeGreaterThan(0);
    }
  });

  it('exposes the four knobs the system is, and no more', () => {
    // The card's variety comes from tone, variant, emphasis, density and the state wash. The rule
    // the suite holds is that the list is *closed*: a new knob is a new decision, argued in the
    // component where it can be reviewed.
    const card = readFileSync('web/src/components/Card.tsx', 'utf8');
    for (const knob of ['tone', 'variant', 'emphasis', 'density', 'wash', 'as']) {
      expect(card, `${knob} is not a card prop`).toMatch(new RegExp(`\\n  ${knob}\\?:`));
    }
    // Deliberately absent: a metric card and a form card are a density and an emphasis, not shapes.
    for (const refused of ['metric', 'form', 'stat', 'chart']) {
      expect(card, `variant="${refused}" would be a second card system`).not.toMatch(
        new RegExp(`CardVariant = '[^']*\\|\\s*'${refused}'`),
      );
    }
    // Every emphasis states itself in an edge, and every edge it names exists in the stylesheet.
    for (const emphasis of ['accent', 'success', 'warning', 'danger', 'info', 'ai']) {
      const token = emphasis === 'accent' ? '--color-primary-border' : `--color-${emphasis}-border`;
      expect(DECLARED.has(token), `${emphasis} names no edge`).toBe(true);
    }
  });

  it('keeps the two spacing scales ascending, so a step is a step', () => {
    // Density and a tile's spacing are the same kind of decision at two scales, and both were
    // drift before this phase: seven near-identical paddings on tiles, and a card padding written
    // per call site. A density step is a set of part paddings, so each entry is an object; a tile
    // step is one padding string, so each entry is a literal. Both shapes are read.
    const card = readFileSync('web/src/components/Card.tsx', 'utf8');

    /** The declaration's body, read from `const NAME` to the closing brace that ends it. */
    const body = (name: string): string => {
      const at = card.indexOf(`const ${name}`);
      expect(at, `${name} is not declared`).toBeGreaterThan(-1);
      const end = card.indexOf('\n};', at);
      expect(end, `${name} is not closed`).toBeGreaterThan(at);
      return card.slice(at, end);
    };

    /**
     * One entry per step of the scale, as the padding values it names.
     *
     * `pt-` and `pb-` count: a header's top padding and a footer's bottom padding are steps of the
     * scale too, and reading only `px`/`py`/`p` would silently skip the one entry that uses them.
     */
    const steps = (name: string): number[][] =>
      [...body(name).matchAll(/\n {2}[a-z-]+: (?:\{([^}]*)\}|'([^']*)')/g)].map((match) =>
        [...(match[1] ?? match[2] ?? '').matchAll(/(?:px-|py-|pt-|pb-|p-)([0-9.]+)/g)].map(
          (value) => Number(value[1]),
        ),
      );

    for (const [name, expectedSteps] of [
      ['DENSITY', 3],
      ['TILE_SPACE', 4],
    ] as const) {
      const scale = steps(name);
      expect(scale.length, `${name} has ${scale.length} steps`).toBe(expectedSteps);
      const widest = scale.map((values) => Math.max(...values));
      for (const values of scale) {
        for (const value of values) {
          expect(value % 0.25, `${name}: ${value} is off the 0.25rem grid`).toBeCloseTo(0, 5);
        }
      }
      // Ascending end to end, so a step is a step and not a synonym for its neighbour.
      expect(widest[0], `${name} does not widen`).toBeLessThan(widest[widest.length - 1] ?? 0);
    }
  });
});
