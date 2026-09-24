/**
 * Phase 7.1 — the design foundations, as a contract rather than a stylesheet.
 *
 * Phase 3.2 established that a token is declared in `web/src/styles/global.css` and inventoried in
 * `web/src/design/tokens.ts`, and `frontend-shell.test.ts` holds one half of that: nothing is
 * inventoried that the theme does not declare. This suite holds the other half and the parts that
 * only matter once the token set is a *system*:
 *
 *   1. **The inventory is complete in both directions.** Every variable the theme declares is
 *      inventoried or is a documented modifier of one, so `tokens.ts` is the single list of what a
 *      component may reach for — a token added to the CSS and forgotten here fails.
 *   2. **The inventory does not lie.** Where a ladder states a value in `tokens.ts` (a size, a
 *      spacing step, a breakpoint, a radius), the stylesheet must declare that same value. A
 *      manifest that drifts from the theme is worse than no manifest, because it reads as true.
 *   3. **The ladders are ladders.** Type, spacing, breakpoints and radii are strictly ordered, and
 *      the ladders are the *only* ordering the design relies on.
 *   4. **A figure is a figure.** Every weighted type step pairs a line height and a weight, and the
 *      running-text steps deliberately do not — pairing them would silently override the places
 *      that set their own leading.
 *   5. **Depth is a ladder, not a habit.** Every elevation level names a shadow and a surface that
 *      exist, level 0 exists and has no shadow, and the accent glow is reserved rather than used
 *      decoratively.
 *   6. **No value is written at a call site.** A component may not carry a hex colour, a colour
 *      function, an arbitrary font size, or an arbitrary colour/shadow utility. That rule is what
 *      makes a palette change one edit: it was 46 literals across 20 files before this phase.
 *
 * Everything here is read from the source, so the suite is offline and needs no browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_TOKEN_VARIABLES,
  BREAKPOINTS,
  ELEVATION,
  GLOW_TOKENS,
  REQUIRED_TOKEN_GROUPS,
  SPACING_NAMESPACE,
  SPACING_SCALE,
  TAILWIND_SPACING_NAMESPACE,
  THEME,
  TOKEN_GROUPS,
  TYPE_SCALE,
} from '../web/src/design/tokens.js';

const STYLESHEET = join('web', 'src', 'styles', 'global.css');
const DESIGN_DIRECTORY = join('web', 'src', 'design');
const CSS = readFileSync(STYLESHEET, 'utf8');

/**
 * The stylesheet with its comments removed.
 *
 * A brace or a `--token: value` inside prose is not code, and this file's own comments name
 * tokens as examples — without this strip, a comment mentioning `--spacing-3xl: 4rem` reads as a
 * declaration and swallows the real one that follows it. That is exactly what happened the first
 * time this suite ran.
 */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** The `@theme { … }` block, matched by brace so a nested block cannot truncate it. */
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

const THEME_BLOCK = themeBlock(CODE);

/** Every variable the theme declares, with its value whitespace-normalised. */
function declared(): Map<string, string> {
  const found = new Map<string, string>();
  const declaration = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(THEME_BLOCK)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      found.set(name, value.replace(/\s+/g, ' ').trim());
    }
  }
  return found;
}

const DECLARED = declared();

/** `--text-metric--line-height` and friends: theme *inputs*, consumed to generate a utility. */
const MODIFIER = /^(--[a-z0-9-]+)--(line-height|font-weight|letter-spacing)$/;

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

/** A hex colour's WCAG relative luminance, for the "is this ladder ordered" checks. */
function luminance(hex: string): number {
  const digits = hex.replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((character) => character + character)
          .join('')
      : digits;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The value the theme declares for a variable, or a failure naming the missing token. */
function value(token: string): string {
  const found = DECLARED.get(token);
  expect(found, `${token} is not declared in ${STYLESHEET}`).toBeDefined();
  return found ?? '';
}

/** A token declared as a rem length, in rem. */
function rem(token: string): number {
  const declaredValue = value(token);
  expect(declaredValue, `${token} is not a rem length`).toMatch(/^[\d.]+rem$/);
  return Number.parseFloat(declaredValue);
}

describe('the inventory is the single list of theme variables', () => {
  it('covers every family, in the stylesheet’s order', () => {
    expect(TOKEN_GROUPS.map((group) => group.group)).toEqual([...REQUIRED_TOKEN_GROUPS]);
    for (const group of TOKEN_GROUPS) {
      expect(group.variables.length, `${group.group} is empty`).toBeGreaterThan(0);
      expect(group.summary.length, `${group.group} has no summary`).toBeGreaterThan(0);
    }
  });

  it('leaves nothing declared in the theme uninventoried', () => {
    // The direction the shell suite does not check: a token added to the stylesheet and forgotten
    // in the manifest is a token the next person will not know exists.
    const orphans = [...DECLARED.keys()].filter((name) => {
      if (ALL_TOKEN_VARIABLES.includes(name)) return false;
      const modifier = MODIFIER.exec(name);
      // A paired modifier is not a variable a component may use; it is the input that makes
      // `text-metric` carry its own leading and weight. Its base must still be inventoried.
      return !(modifier?.[1] !== undefined && ALL_TOKEN_VARIABLES.includes(modifier[1]));
    });
    expect(orphans).toEqual([]);
  });

  it('declares every inventory entry, and no duplicates', () => {
    const missing = ALL_TOKEN_VARIABLES.filter((name) => !DECLARED.has(name));
    expect(missing).toEqual([]);
    expect(new Set(ALL_TOKEN_VARIABLES).size).toBe(ALL_TOKEN_VARIABLES.length);
  });

  it('stays a dark theme', () => {
    expect(THEME.mode).toBe('dark');
    expect(value('--color-bg')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('Task 1 — colour, surfaces and the responsive ladder', () => {
  it('orders the surfaces from the page up to a raised panel', () => {
    const stack = [
      '--color-bg',
      '--color-bg-elevated',
      '--color-surface',
      '--color-surface-raised',
    ];
    const lightness = stack.map((token) => luminance(value(token)));
    for (let index = 1; index < lightness.length; index += 1) {
      expect(
        lightness[index]!,
        `${stack[index]} is not lighter than ${stack[index - 1]}`,
      ).toBeGreaterThan(lightness[index - 1]!);
    }
    // A well is a recess, so it sits below the panel it is cut into.
    expect(luminance(value('--color-surface-sunken'))).toBeLessThan(
      luminance(value('--color-surface')),
    );
    // The scrim is translucent, so it darkens whatever it covers.
    expect(value('--color-overlay')).toMatch(/^rgb\(0 0 0 \/ [\d.]+\)$/);
  });

  it('orders the text and border ladders the way contrast needs them', () => {
    const text = ['--color-text', '--color-text-muted', '--color-text-faint'];
    const textLightness = text.map((token) => luminance(value(token)));
    for (let index = 1; index < textLightness.length; index += 1) {
      expect(
        textLightness[index]!,
        `${text[index]} is not darker than ${text[index - 1]}`,
      ).toBeLessThan(textLightness[index - 1]!);
    }
    // Every text step must be readable on the page it sits on.
    expect(luminance(value('--color-text-faint'))).toBeGreaterThan(luminance(value('--color-bg')));

    const borders = ['--color-border', '--color-border-strong'];
    expect(luminance(value(borders[1]!))).toBeGreaterThan(luminance(value(borders[0]!)));
  });

  it('gives every tinted state surface an edge of its own', () => {
    // A fill without a border is a panel; a fill with one is a state, and the pair is what reads as
    // deliberate at a glance. `success` has no `-soft` of its own (its fill is `primary-soft`), so
    // the rule runs one way: every soft tone has a border, not the reverse.
    for (const token of ALL_TOKEN_VARIABLES) {
      if (!token.startsWith('--color-') || !token.endsWith('-soft')) continue;
      const tone = token.slice('--color-'.length, -'-soft'.length);
      expect(ALL_TOKEN_VARIABLES, `${token} has no --color-${tone}-border to pair with`).toContain(
        `--color-${tone}-border`,
      );
    }
    // The rule only means something while there is something to check.
    const softs = ALL_TOKEN_VARIABLES.filter(
      (token) => token.startsWith('--color-') && token.endsWith('-soft'),
    );
    expect(softs.length).toBeGreaterThanOrEqual(5);
  });

  it('pins the responsive ladder, ascending, at Tailwind’s own widths', () => {
    const widths = BREAKPOINTS.map((breakpoint) => breakpoint.px);
    for (let index = 1; index < widths.length; index += 1) {
      expect(widths[index]!, `${BREAKPOINTS[index]!.token} does not widen`).toBeGreaterThan(
        widths[index - 1]!,
      );
    }
    // The three devices the product supports, and the width each starts at.
    expect(BREAKPOINTS.map((breakpoint) => breakpoint.device)).toEqual([
      'phone landscape',
      'tablet',
      'desktop',
      'wide',
      'ultrawide',
    ]);
    for (const breakpoint of BREAKPOINTS) {
      // Declared at exactly Tailwind's default, so a `md:` cannot start meaning a new width.
      expect(rem(`--breakpoint-${breakpoint.token}`)).toBe(breakpoint.rem);
      expect(breakpoint.px).toBe(breakpoint.rem * 16);
    }
  });
});

describe('Task 2 — the type scale and the spacing scale', () => {
  it('is a scale: strictly ascending, from annotation to display', () => {
    const sizes = TYPE_SCALE.map((step) => step.rem);
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]!, `${TYPE_SCALE[index]!.token} is not larger`).toBeGreaterThan(
        sizes[index - 1]!,
      );
    }
    // And the manifest agrees with the theme, size for size.
    for (const step of TYPE_SCALE) {
      expect(rem(step.size), `${step.token} disagrees with the stylesheet`).toBe(step.rem);
      expect(value(step.size), step.token).toBe(`${step.rem}rem`);
    }
  });

  it('pairs a line height and a weight with every figure step, and only those', () => {
    const weighted = TYPE_SCALE.filter((step) => step.weighted);
    const running = TYPE_SCALE.filter((step) => !step.weighted);

    // A figure is a number that must not wrap and must not drift as it grows, so the size, the
    // leading and the weight are one decision.
    expect(weighted.map((step) => step.token)).toEqual([
      'figure',
      'subheading',
      'metric',
      'display',
    ]);
    for (const step of weighted) {
      const lineHeight = value(`${step.size}--line-height`);
      const weight = value(`${step.size}--font-weight`);
      expect(lineHeight, `${step.token} pairs no line height`).toMatch(/^[\d.]+$/);
      expect(Number.parseFloat(lineHeight)).toBeGreaterThan(0);
      expect(Number.parseFloat(lineHeight)).toBeLessThanOrEqual(1.2);
      // The paired weight must be a step of the weight ladder, not an invented number.
      expect(ALL_TOKEN_VARIABLES).toContain(`--font-weight-${weightName(weight)}`);
    }

    // Running text deliberately declares no paired leading: it inherits the body's, which is what
    // keeps `leading-*` overrides at those call sites working.
    for (const step of running) {
      expect(
        DECLARED.has(`${step.size}--line-height`),
        `${step.token} pairs a line height and would override local leading`,
      ).toBe(false);
    }
  });

  it('names the weights the interface is allowed to use', () => {
    const ladder = [
      '--font-weight-normal',
      '--font-weight-medium',
      '--font-weight-semibold',
      '--font-weight-bold',
    ];
    const weights = ladder.map((token) => Number.parseInt(value(token), 10));
    expect(weights).toEqual([400, 500, 600, 700]);
    for (let index = 1; index < weights.length; index += 1) {
      expect(weights[index]!).toBeGreaterThan(weights[index - 1]!);
    }
  });

  it('builds the spacing scale on one base, in order', () => {
    const steps = SPACING_SCALE.map((step) => step.rem);
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]!, `${SPACING_SCALE[index]!.token} does not grow`).toBeGreaterThan(
        steps[index - 1]!,
      );
    }
    // Every step is a whole number of 2px units, and the scale is declared where it is listed.
    for (const step of SPACING_SCALE) {
      expect(step.rem * 16, `${step.token} is off the 2px grid`).toBe(Math.round(step.rem * 16));
      expect(value(`${SPACING_NAMESPACE}-${step.token}`), step.token).toBe(`${step.rem}rem`);
    }
    // Body text sits on the 1rem step, which is what makes the scale usable rather than decorative.
    expect(SPACING_SCALE.map((step) => step.token)).toContain('block');
    expect(value(`${SPACING_NAMESPACE}-block`)).toBe('1rem');
    // Every step says what it is for, so the scale is a vocabulary rather than a set of numbers.
    for (const step of SPACING_SCALE) {
      expect(step.role.length, `${step.token} has no role`).toBeGreaterThan(0);
    }
  });

  it('keeps Tailwind’s spacing namespace empty', () => {
    // The rule this phase earned the hard way. A named entry in `--spacing-*` is not a new spacing
    // step — it is a new *value* for a utility that already exists, in a namespace every sizing
    // family reads. Two shapes of that failure were shipped and caught by the phone-width lay-out
    // suite rather than by any type:
    //
    //   `--spacing-3xl: 4rem`   → `max-w-3xl` became a 64px box on every page;
    //   `--spacing-block: 1rem` → `.inline-block{inline-size:…}` overwrote the display utility.
    //
    // So the namespace stays untouched and the product's scale lives in `--space-*`, which
    // Tailwind does not read.
    const named = [...DECLARED.keys()].filter(
      (name) =>
        name !== TAILWIND_SPACING_NAMESPACE && name.startsWith(`${TAILWIND_SPACING_NAMESPACE}-`),
    );
    expect(
      named,
      'a named entry here redefines a Tailwind size utility rather than adding a spacing step',
    ).toEqual([]);

    // The scale itself is in the namespace Tailwind ignores, and every step is declared there.
    expect(SPACING_NAMESPACE).toBe('--space');
    expect(named.filter((name) => name.startsWith(SPACING_NAMESPACE))).toEqual([]);
    for (const step of SPACING_SCALE) {
      expect(DECLARED.has(`${SPACING_NAMESPACE}-${step.token}`), step.token).toBe(true);
    }
  });
});

describe('Task 3 — visual depth', () => {
  it('orders the radius ladder by the kind of surface', () => {
    const ladder = [
      '--radius-mark',
      '--radius-inset',
      '--radius-control',
      '--radius-tile',
      '--radius-panel',
    ];
    const radii = ladder.map((token) => rem(token));

    // Two roles may share a step, but only deliberately: a nested surface and a control round by the
    // same amount at this scale. Every *other* step must be strictly rounder than the one before it.
    const ORDER_COINCIDES: readonly (readonly [string, string])[] = [
      ['--radius-inset', '--radius-control'],
    ];
    const coincidences: string[][] = [];
    for (let index = 1; index < radii.length; index += 1) {
      const previous = ladder[index - 1]!;
      const current = ladder[index]!;
      if (radii[index] === radii[index - 1]) {
        coincidences.push([previous, current]);
        continue;
      }
      expect(radii[index]!, `${current} is not rounder than ${previous}`).toBeGreaterThan(
        radii[index - 1]!,
      );
    }
    expect(coincidences.map((pair) => pair.join(' = '))).toEqual(
      ORDER_COINCIDES.map((pair) => pair.join(' = ')),
    );
    expect(radii[radii.length - 1]).toBeLessThan(1.5);
    // A pill is a shape, not a step, so it is the only radius that is not comparable.
    expect(value('--radius-pill')).toBe('999px');
  });

  it('names each elevation level with a shadow and a surface that exist', () => {
    expect(ELEVATION.map((level) => level.level)).toEqual([0, 1, 2, 3]);
    for (const level of ELEVATION) {
      expect(level.name.length, `level ${level.level} is unnamed`).toBeGreaterThan(0);
      expect(level.usage.length, `level ${level.level} says nothing about its use`).toBeGreaterThan(
        0,
      );
      expect(ALL_TOKEN_VARIABLES, `level ${level.level} names an unknown surface`).toContain(
        level.surface,
      );
      expect(DECLARED.has(level.surface), `${level.surface} is not declared`).toBe(true);
      if (level.level === 0) {
        // Flush with the page: a level, not an omission.
        expect(level.shadow).toBeNull();
        continue;
      }
      expect(level.shadow, `level ${level.level} names no shadow`).not.toBeNull();
      expect(ALL_TOKEN_VARIABLES, `level ${level.level} names an unknown shadow`).toContain(
        level.shadow!,
      );
      expect(value(level.shadow!), `${level.shadow} is not declared`).toMatch(/rgb\(/);
    }
  });

  it('reserves the accent glow instead of spending it', () => {
    // Glow is the strongest emphasis the theme has. Both glows are inventoried shadows, and there
    // are only two — the accent itself and the control-sized version of it.
    const glows = ALL_TOKEN_VARIABLES.filter((token) => token.startsWith('--shadow-glow'));
    expect(glows.sort()).toEqual(['--shadow-glow', '--shadow-glow-control']);
    expect(Object.values(GLOW_TOKENS).sort()).toEqual(glows);
    for (const token of glows) {
      expect(value(token), token).toMatch(/^0 0 0 1px|^0 10px 30px/);
    }
    // And the elevations that are not about emphasis do not reach for one.
    const elevations = ELEVATION.filter((level) => level.shadow !== null).map(
      (level) => level.shadow,
    );
    expect(elevations).toEqual(['--shadow-panel', '--shadow-popover', '--shadow-glow']);
  });

  it('declares both gradients as utilities rather than at a call site', () => {
    for (const token of ['--gradient-panel', '--gradient-sheen']) {
      expect(value(token), token).toMatch(/^linear-gradient\(/);
      // Declared is not enough: each must be the background-image of a utility, so a component
      // asks for the effect by name.
      const utility = new RegExp(`background-image:\\s*var\\(${token}\\)`);
      expect(CODE, `${token} is declared but no utility uses it`).toMatch(utility);
    }
    expect(CODE).toMatch(/\.panel-gradient\s*\{/);
    expect(CODE).toMatch(/\.surface-sheen\s*\{/);
  });
});

describe('no component writes a value at the call site', () => {
  /** The literal forms that make a palette change a search-and-replace instead of one edit. */
  const SCATTERED: readonly { pattern: RegExp; what: string }[] = [
    { pattern: /#[0-9a-fA-F]{3,8}\b/, what: 'a literal hex colour' },
    { pattern: /\b(?:rgb|rgba|hsl|hsla)\(/, what: 'a literal colour function' },
    {
      pattern:
        /\b(?:bg|text|border|fill|stroke|ring|from|via|to)-\[(?:#|\d+px|rgb|hsl|linear-gradient)/,
      what: 'a colour written at the call site',
    },
    { pattern: /\bshadow-\[/, what: 'a shadow written at the call site' },
    { pattern: /\btext-\[[\d.]+rem\]/, what: 'a font size written at the call site' },
  ];

  it('leaves the stylesheet and the manifest as the only homes for a raw value', () => {
    const offenders: string[] = [];
    for (const path of uiSources()) {
      // The manifest is where values are named; it is not a call site.
      if (path.startsWith(DESIGN_DIRECTORY.split(sep).join('/'))) continue;
      const source = readFileSync(path, 'utf8');
      for (const { pattern, what } of SCATTERED) {
        const match = source.match(pattern);
        if (match !== null) offenders.push(`${path}: ${what} (${match[0]})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has figures, states and panels that all speak the token vocabulary', () => {
    // The positive half of the rule: the constructs the phase replaced are named tokens now, and
    // this is what would break if someone edited a className back to a literal.
    const probes: readonly [string, RegExp][] = [
      ['web/src/components/Button.tsx', /shadow-glow-control/],
      ['web/src/components/Badge.tsx', /border-danger-border/],
      ['web/src/components/Skeleton.tsx', /surface-sheen/],
      ['web/src/app/Workspace.tsx', /text-heading/],
      ['web/src/components/exams/ScoreCard.tsx', /text-display/],
      ['web/src/components/journal/JournalStatCard.tsx', /text-metric/],
      ['web/src/components/research/MetricsPanel.tsx', /text-figure/],
      ['web/src/pages/ExamsPage.tsx', /text-subheading/],
    ];
    for (const [path, pattern] of probes) {
      expect(readFileSync(path, 'utf8'), path).toMatch(pattern);
    }
  });
});

/** The ladder name behind a paired weight, so `600` has to be `--font-weight-semibold`. */
function weightName(weight: string): string {
  const names: Record<string, string> = {
    '400': 'normal',
    '500': 'medium',
    '600': 'semibold',
    '700': 'bold',
  };
  const name = names[weight];
  expect(name, `${weight} is not a step of the weight ladder`).toBeDefined();
  return name ?? '';
}
