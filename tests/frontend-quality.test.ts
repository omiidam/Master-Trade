/**
 * The input-quality surface, as the user sees it.
 *
 * The risk on this surface is not a wrong pixel — it is a wrong *claim*. A quality
 * verdict that was never computed, a readiness shown for an analysis the server did not
 * gate, or an assumption rendered as a fact would each tell the user something untrue
 * about their own inputs, in a place built specifically to be trusted about them.
 *
 * These tests pin the properties that make that impossible:
 *
 *   1. the nine components exist, and are reachable through the barrel;
 *   2. the surface is an in-page tab, not a new navigation category;
 *   3. vocabulary comes from the contract, and an unknown token is shown as itself;
 *   4. the store renders the server's verdict and computes none of its own;
 *   5. no fixture is displayed, and the absence of an assessment is stated;
 *   6. every state — loading, empty, error, unavailable — has a rendering;
 *   7. nothing anywhere offers an execution affordance.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';
import { NAV_SECTIONS } from '../web/src/config/navigation.js';

const root = process.cwd();
const web = join(root, 'web');

const PAGE = 'pages/ProfilePage.tsx';
const STORE = 'store/quality.ts';
const CLIENT = 'api/client.ts';

function read(relativePath: string): string {
  return readFileSync(join(web, 'src', relativePath), 'utf8');
}

function qualityComponents(): string[] {
  const directory = join(web, 'src', 'components', 'quality');
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

const REQUIRED = [
  'AnalysisReadinessPanel.tsx',
  'AssumptionNotice.tsx',
  'ClarificationQuestionCard.tsx',
  'DataFreshnessIndicator.tsx',
  'DataQualityBadge.tsx',
  'InputQualitySummary.tsx',
  'MissingInformationPanel.tsx',
  'ProvenanceIndicator.tsx',
  'ValidationIssueList.tsx',
];

describe('input-quality surface', () => {
  it('keeps all nine components on disk and exported through the barrel', () => {
    expect(qualityComponents()).toEqual([...REQUIRED].sort());

    const barrel = readFileSync(join(web, 'src', 'components', 'index.ts'), 'utf8');
    for (const component of REQUIRED.map((file) => file.replace('.tsx', ''))) {
      expect(barrel, `${component} is missing from the component barrel`).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
    }
    // The supporting vocabulary module is reachable too, and has no rendering of its own.
    const qualityBarrel = read('components/quality/index.ts');
    for (const helper of ['inputLabel', 'dimensionLabel', 'issueCodeLabel']) {
      expect(qualityBarrel).toMatch(new RegExp(`\\b${helper}\\b`));
    }
  });

  it('is an in-page tab, not a new navigation category', () => {
    const page = read(PAGE);
    expect(page).toMatch(/value="quality"/);
    expect(page).toMatch(/label: 'Data quality'/);

    const ids = NAV_SECTIONS.map((section) => section.id);
    for (const tab of ['quality', 'data-quality', 'readiness', 'input-quality']) {
      expect(ids).not.toContain(tab);
    }
    // It lives inside the Profile surface, which is the one entry that owns it.
    expect(NAV_SECTIONS.filter((section) => section.id === 'profile')).toHaveLength(1);
  });

  it('speaks the contract’s vocabulary, and shows an unknown token as itself', () => {
    const badge = read('components/quality/DataQualityBadge.tsx');
    // Labels come from the shared model rather than being re-written here.
    for (const imported of [
      'SEVERITY_LABEL',
      'DIMENSION_VERDICT_LABEL',
      'CLASSIFICATION_LABEL',
      'CLASSIFICATION_MEANING',
      'READINESS_LABEL',
      'READINESS_MEANING',
      'OUTPUT_MODE_LABEL',
    ]) {
      expect(badge, `${imported} is not taken from the contract`).toMatch(
        new RegExp(`\\b${imported}\\b`),
      );
    }
    // Every kind is declared, and `kind` is required — `stale` is ambiguous otherwise.
    for (const kind of [
      'severity',
      'verdict',
      'classification',
      'readiness',
      'freshness',
      'confidence',
      'validation',
      'outputMode',
    ]) {
      expect(badge).toMatch(new RegExp(`'${kind}'`));
    }
    // An unknown token falls back to itself, never to a prettier guess.
    expect(badge).toMatch(/label: value/);
    expect(badge).toMatch(/does not know this token/);
  });

  it('renders the server’s decision and computes none of its own', () => {
    const store = read(STORE);
    expect(store).toMatch(/assessQuality/);
    // The gate is the server's: the store must not derive a readiness or a classification.
    expect(store).not.toMatch(/assessAnalysisReadiness|analyseQualityInputs|classify\(/);
    expect(store).not.toMatch(/readiness:/);
    // One session, borrowed from the same resolution the profile surface uses.
    expect(store).toMatch(/clientForProfile/);

    const client = read(CLIENT);
    expect(client).toMatch(/assessQuality/);
    expect(client).toMatch(/'\/v1\/quality\/assess'/);
    // No subject parameter anywhere: the principal is the only subject there is.
    expect(client).not.toMatch(/quality\/assess\/\$\{|assessQuality\([^)]*userId/);
  });

  it('shows no fixture in place of an assessment', () => {
    const page = read(PAGE);
    // With no session or no answer, the surface says so and renders nothing instead.
    expect(page).toMatch(/No sample assessment is shown in its place/);
    expect(page).toMatch(/qualityUnavailable/);
    expect(page).toMatch(/useQualityStore/);

    const store = read(STORE);
    expect(store).toMatch(/'unavailable'/);
    expect(store).not.toMatch(/localStorage/);
    // A stored assessment is a claim about a context version, so nothing is cached.
    expect(store).not.toMatch(/persist\(/);
  });

  it('renders every state rather than a stand-in', () => {
    const page = read(PAGE);
    expect(page).toMatch(/\bSkeleton\b/); // loading
    expect(page).toMatch(/\bErrorState\b/); // error and unavailable
    expect(page).toMatch(/qualityStatus === 'error'/);
    expect(page).toMatch(/qualityStatus === 'unavailable'/);
    expect(page).toMatch(/qualityStatus === 'ready'/);

    // Empty is a real rendering, not a blank: the panels say what "nothing" means.
    const missing = read('components/quality/MissingInformationPanel.tsx');
    expect(missing).toMatch(/Nothing required is missing/);
    const summary = read('components/quality/InputQualitySummary.tsx');
    expect(summary).toMatch(/Nothing declared yet/);
    const issues = read('components/quality/ValidationIssueList.tsx');
    expect(issues).toMatch(/emptyMessage/);

    // And the two lists are kept apart, because a gap and a question are not the same.
    expect(missing).toMatch(/gaps/);
    expect(missing).toMatch(/clarifications/);
  });

  it('renders an assumption as a substitution with its origin, never as a fact', () => {
    const notice = read('components/quality/AssumptionNotice.tsx');
    expect(notice).toMatch(/user-premise/);
    expect(notice).toMatch(/system/);
    // `permitted` comes from the contract rather than being derived from the origin.
    expect(notice).toMatch(/notice\.permitted/);
    expect(notice).toMatch(/Not permitted/);
  });

  it('shows a provenance pointer, and shows its absence as a finding', () => {
    const indicator = read('components/quality/ProvenanceIndicator.tsx');
    expect(indicator).toMatch(/provenance === null/);
    expect(indicator).toMatch(/No provenance recorded/);
    for (const trust of ['authoritative', 'verified', 'unverified']) {
      expect(indicator).toMatch(new RegExp(`\\b${trust}\\b`));
    }
    // The value itself is never reproduced — only the pointer to it.
    expect(indicator).toMatch(/provenance\.ref/);
  });

  it('labels age against the input’s own window instead of a global default', () => {
    // The four freshness states are the model's, and each one has words of its own —
    // `stale` must not read like `current`, or the label carries no information.
    const badge = read('components/quality/DataQualityBadge.tsx');
    for (const state of ['current', 'stale', 'undated', 'absent']) {
      expect(badge).toMatch(new RegExp(`^  ${state}: \\{`, 'm'));
    }

    const freshness = read('components/quality/DataFreshnessIndicator.tsx');
    // Age is passed in from the assessment rather than recomputed against a local clock,
    // and an undated value is labelled rather than silently treated as fresh.
    expect(freshness).toMatch(/ageDays/);
    expect(freshness).not.toMatch(/Date\.now\(\)/);
    expect(freshness).toMatch(/no observation time/);
  });

  it('offers no execution affordance anywhere in the module', () => {
    const offenders: string[] = [];
    const files = [
      PAGE,
      STORE,
      CLIENT,
      ...qualityComponents().map((file) => `components/quality/${file}`),
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
