/**
 * The Profile surface, as the user sees it.
 *
 * A profile is the one place where a wrong pixel is a factual error: a value rendered
 * without its source, an assumption shown as a saved fact, or an empty page filled with
 * a fixture would each tell the user something untrue about their own account. These
 * tests pin the distinctions the page exists to make, and pin the states it must be able
 * to show (loading, empty, error) without ever inventing data to avoid them.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';
import { NAV_SECTIONS } from '../web/src/config/navigation.js';
import { translate } from '../web/src/i18n/index.js';

const root = process.cwd();
const web = join(root, 'web');

const PAGE = 'pages/ProfilePage.tsx';
const EDITOR = 'components/profile/ProfileEditor.tsx';
const STORE = 'store/profile.ts';

function read(relativePath: string): string {
  return readFileSync(join(web, 'src', relativePath), 'utf8');
}

function profileComponents(): string[] {
  const directory = join(web, 'src', 'components', 'profile');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .map((entry) => String(entry).split(sep).join('/'))
    .filter((entry) => entry.endsWith('.tsx'))
    .sort();
}

/** Interactive control names found in a source file, as in the shell suite. */
function controlNames(source: string): string[] {
  const names: string[] = [];
  const tagPattern = /<(Button|IconButton|button|a)\b([^>]*)>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(source)) !== null) {
    const attributes = tag[2] ?? '';
    const attributePattern = /(?:aria-label|label)=["']([^"']+)["']/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributes)) !== null) {
      if (attribute[1] !== undefined) names.push(attribute[1]);
    }
  }
  return names;
}

describe('profile surface', () => {
  it('keeps the page and the components on disk, and exported through the barrel', () => {
    expect(existsSync(join(web, 'src', PAGE)), `${PAGE} is missing`).toBe(true);

    const required = [
      'CompletenessMeter.tsx',
      'ContextStatusBadge.tsx',
      'FactRow.tsx',
      'ClarifyingPrompts.tsx',
      'ProfileEditor.tsx',
    ];
    for (const file of required) {
      expect(
        existsSync(join(web, 'src', 'components', 'profile', file)),
        `${file} is missing`,
      ).toBe(true);
    }
    expect(profileComponents()).toEqual(required.sort());

    const barrel = readFileSync(join(web, 'src', 'components', 'index.ts'), 'utf8');
    for (const component of [
      'CompletenessMeter',
      'ContextStatusBadge',
      'FactSourceBadge',
      'FactRow',
      'ClarifyingPrompts',
      'ProfileEditor',
    ]) {
      expect(barrel, `${component} is missing from the component barrel`).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
    }
  });

  it('is one navigation entry, not a group of subsections', () => {
    const entries = NAV_SECTIONS.filter((section) => section.id === 'profile');
    expect(entries).toHaveLength(1);
    expect(entries[0] && translate('en', entries[0].labelKey)).toBe('Profile');

    // The page's own sections are in-page tabs, so none of them is a navigation id.
    const ids = NAV_SECTIONS.map((section) => section.id);
    for (const tab of ['overview', 'context', 'preferences', 'history', 'declared-context']) {
      expect(ids).not.toContain(tab);
    }
  });

  it('labels every field with its source and status, in one vocabulary', () => {
    const badge = read('components/profile/ContextStatusBadge.tsx');
    for (const status of ['confirmed', 'derived', 'stale', 'assumed', 'missing']) {
      expect(badge, `${status} has no label`).toMatch(new RegExp(`\\b${status}:`));
    }
    for (const source of ['user-stated', 'derived', 'assumed']) {
      expect(badge, `${source} has no label`).toMatch(new RegExp(`'?${source}'?:`));
    }

    // A stale value must not share a tone with a current one, and an assumption must not
    // share a tone with a confirmation.
    const tones = [...badge.matchAll(/(\w+): '(success|info|warning|outline|neutral)'/g)].map(
      (match) => `${match[1]}=${match[2]}`,
    );
    expect(new Set(tones).size).toBe(tones.length);
    expect(badge).toMatch(/confirmed: 'success'/);
    expect(badge).toMatch(/assumed: 'outline'/);

    const row = read('components/profile/FactRow.tsx');
    // The value, its source and its age are rendered together; a row with no source badge
    // would let an assumption read as a fact.
    expect(row).toMatch(/FactSourceBadge/);
    expect(row).toMatch(/ContextStatusBadge/);
    expect(row).toMatch(/ageDays/);
    // An unknown vocabulary token falls back to itself, never to a prettier guess.
    expect(row).toMatch(/ARRAY_LABELS\[String\(value\)\] \?\? String\(value\)/);
  });

  it('never pre-fills an assumption into the editor', () => {
    const editor = read(EDITOR);
    expect(editor).toMatch(/source === 'assumed'\s*\?\s*null/);
    // And the write path says so too, so the behaviour is not an unexplained helper.
    expect(editor).toMatch(/assumption/i);
  });

  it('reports rejections with a named field and an alert role', () => {
    const editor = read(EDITOR);
    expect(editor).toMatch(/role="alert"/);
    expect(editor).toMatch(/serverErrors/);
    expect(editor).toMatch(/aria-invalid/);
  });

  it('renders the loading, empty and error states rather than a stand-in', () => {
    const page = read(PAGE);
    expect(page).toMatch(/\bSkeleton\b/); // loading
    expect(page).toMatch(/\bErrorState\b/); // error and unavailable
    expect(page).toMatch(/\bEmptyState\b/); // no versions yet

    // A profile is personal data: with no session the page shows the resolver's reason
    // and says plainly that nothing is displayed in its place.
    expect(page).toMatch(/Nothing is displayed in its place/);
    expect(page).toMatch(/useProfileStore/);

    const store = read(STORE);
    expect(store).toMatch(/'unavailable'/);
    // The store borrows the session the realtime store resolved instead of resolving a
    // second one, so the two cannot disagree about the credential in use.
    expect(store).toMatch(/useRealtimeStore/);
    expect(store).not.toMatch(/localStorage/);
  });

  it('offers no execution affordance anywhere in the module', () => {
    const offenders: string[] = [];
    const files = [
      PAGE,
      EDITOR,
      STORE,
      ...profileComponents().map((file) => `components/profile/${file}`),
    ];
    for (const file of files) {
      const source = read(file);
      for (const name of controlNames(source)) {
        try {
          assertNoExecutionControls([name]);
        } catch {
          offenders.push(`${file}: ${name}`);
        }
      }
      try {
        assertNoExecutionControls(sectionLabels(source));
      } catch {
        offenders.push(`${file}: label text`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Headings and title-ish strings in a source file, for the execution-vocabulary probe. */
function sectionLabels(source: string): string[] {
  return [...source.matchAll(/title="([^"]{3,80})"/g)].map((match) => match[1] ?? '');
}
