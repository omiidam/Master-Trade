/**
 * The usage surface, as the user sees it.
 *
 * The risk on this surface is not a wrong pixel — it is a wrong *number* or a wrong
 * *offer*. A balance the client computed, an allowance the UI inferred from a plan name, or
 * an upgrade button shown for something an upgrade cannot fix would each tell the user
 * something untrue about their own account, on the one page built to be trusted about it.
 *
 * These tests pin the properties that make that impossible:
 *
 *   1. the twelve components exist, and are reachable through the barrel;
 *   2. the surface is an in-page tab set under one navigation entry, not a sub-tree;
 *   3. vocabulary comes from the contract, and an unknown token is shown as itself;
 *   4. the store renders the server's numbers and computes none of its own;
 *   5. nothing is offered for sale, because nothing can be charged;
 *   6. a refusal is shown, and is never disguised as an upgrade;
 *   7. every state — loading, empty, error, unavailable — has a rendering;
 *   8. nothing anywhere offers an execution affordance.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoExecutionControls } from '../packages/shared/src/frontend/viewModels.js';
import { NAV_SECTIONS } from '../web/src/config/navigation.js';
import { PLAN_CATALOGUE } from '../packages/shared/src/usage/plans.js';

const root = process.cwd();
const web = join(root, 'web');

const PAGE = 'pages/UsagePage.tsx';
const STORE = 'store/usage.ts';
const CLIENT = 'api/client.ts';

function read(relativePath: string): string {
  return readFileSync(join(web, 'src', relativePath), 'utf8');
}

function usageFiles(): string[] {
  const directory = join(web, 'src', 'components', 'usage');
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

/** Headings and title-ish strings in a source file, for the execution-vocabulary probe. */
function sectionLabels(source: string): string[] {
  return [...source.matchAll(/title="([^"]{3,80})"/g)].map((match) => match[1] ?? '');
}

/** Every component the brief names, by the file that holds it. */
const REQUIRED: readonly (readonly [string, string])[] = [
  ['UsageCreditsCard', 'UsageCreditsCard.tsx'],
  ['CreditBalance', 'CreditBalance.tsx'],
  ['UsageProgressBar', 'CreditBalance.tsx'],
  ['SubscriptionPlanCard', 'SubscriptionPlanCard.tsx'],
  ['PlanComparison', 'SubscriptionPlanCard.tsx'],
  ['UsageHistory', 'UsageHistory.tsx'],
  ['CreditTransactionItem', 'UsageHistory.tsx'],
  ['FeatureEntitlementBadge', 'FeatureEntitlementBadge.tsx'],
  ['UpgradePrompt', 'UpgradePrompt.tsx'],
  ['UsageLimitNotice', 'UpgradePrompt.tsx'],
  ['InsufficientCreditsState', 'UpgradePrompt.tsx'],
  ['SubscriptionStatusCard', 'SubscriptionStatusCard.tsx'],
];

describe('the usage surface', () => {
  it('keeps every named component on disk and exported through the barrel', () => {
    const files = usageFiles();
    expect(files.length).toBeGreaterThanOrEqual(6);

    const barrel = readFileSync(join(web, 'src', 'components', 'index.ts'), 'utf8');
    for (const [component, file] of REQUIRED) {
      expect(files, `${file} is missing`).toContain(file);
      expect(barrel, `${component} is missing from the component barrel`).toMatch(
        new RegExp(`\\b${component}\\b`),
      );
      // And it is exported from the module's own barrel rather than only from the root.
      expect(read('components/usage/index.ts')).toMatch(new RegExp(`\\b${component}\\b`));
    }
  });

  it('is one navigation entry with internal tabs, not a sub-tree', () => {
    const page = read(PAGE);
    for (const tab of ['overview', 'features', 'plans', 'history']) {
      expect(page).toMatch(new RegExp(`value="${tab}"`));
    }
    // The sidebar entry exists once, and no tab name leaked into the navigation.
    expect(NAV_SECTIONS.filter((section) => section.id === 'usage')).toHaveLength(1);
    const ids = NAV_SECTIONS.map((section) => section.id);
    for (const tab of ['credits', 'billing', 'subscription', 'plans']) {
      expect(ids).not.toContain(tab);
    }
  });

  it('speaks the contract’s vocabulary, and shows an unknown token as itself', () => {
    const labels = read('components/usage/labels.ts');
    // The three vocabularies the contract already names are imported, not re-written.
    for (const imported of [
      'CREDIT_REASON_LABEL',
      'CREDIT_REASON_MEANING',
      'USAGE_CATEGORY_LABEL',
      'SUBSCRIPTION_STATUS_LABEL',
      'ENTITLEMENT_DENIALS',
    ]) {
      expect(labels, `${imported} is not taken from the contract`).toMatch(
        new RegExp(`\\b${imported}\\b`),
      );
    }
    // Every fallback is the raw token, never a prettier guess.
    const fallbacks = [...labels.matchAll(/\?\? (\w+);/g)].map((match) => match[1]);
    expect(fallbacks.length).toBeGreaterThan(3);
    expect(labels).toMatch(/\?\? reason;/);

    // A denial this build does not know is still grouped and still shown.
    expect(labels).toMatch(/ENTITLEMENT_DENIALS as readonly string\[\]/);
  });

  it('renders the server’s numbers and computes none of its own', () => {
    const store = read(STORE);
    expect(store).toMatch(/getUsage\(\)/);
    expect(store).toMatch(/getUsageHistory\(/);
    // No arithmetic anywhere in the client: a balance computed here would be a second
    // opinion about a quantity that decides whether work runs.
    expect(store).not.toMatch(/balance\s*[-+*/]=/);
    expect(store).not.toMatch(/resolveEntitlement|applyDelta|summariseLedger/);
    // One session, from the same resolution the profile and quality surfaces use.
    expect(store).toMatch(/clientForProfile/);

    const client = read(CLIENT);
    expect(client).toMatch(/\/v1\/usage'/);
    expect(client).toMatch(/\/v1\/usage\/history/);
    // No subject parameter on either read: the principal is the only subject there is.
    expect(client).not.toMatch(/getUsage\(\s*userId/);
    expect(client).not.toMatch(/usage\/\$\{/);
  });

  it('offers nothing for sale, because nothing can be charged', () => {
    // The catalogue is the source: every plan declares itself unpurchasable.
    for (const plan of PLAN_CATALOGUE) {
      expect(plan.purchasable).toBe(false);
      expect(plan.price).toBe(null);
    }

    const plan = read('components/usage/SubscriptionPlanCard.tsx');
    expect(plan).toMatch(/no payment integration/i);
    expect(plan).not.toMatch(/\$\d|price:\s*\d/);

    const upgrade = read('components/usage/UpgradePrompt.tsx');
    expect(upgrade).toMatch(/upgradeOffered/);
    expect(upgrade).toMatch(/cannot take a payment|no payment integration/i);
    // A prompt that bought something would be a promise no code can keep — checked on the
    // controls, because the prose deliberately discusses buying in order to deny it.
    const buying = [...controlNames(upgrade), ...sectionLabels(upgrade)].filter((name) =>
      /buy|purchase|subscribe|checkout|upgrade now/i.test(name),
    );
    expect(buying).toEqual([]);
  });

  it('never shows a refusal as an upgrade, and never hides one', () => {
    const upgrade = read('components/usage/UpgradePrompt.tsx');
    // The gate on the prompt is the server's own answer, not a local guess.
    expect(upgrade).toMatch(/if \(feature\.allowed \|\| !feature\.upgradeOffered\) return null;/);
    // A held capability and an unbuilt one have their own components, and neither is a
    // purchase.
    expect(upgrade).toMatch(/feature-disabled/);
    expect(upgrade).toMatch(/feature-coming-soon/);
    expect(upgrade).toMatch(/That is a gap in the product, not in your entitlement/);

    const card = read('components/usage/UsageCreditsCard.tsx');
    // A capability the account cannot use is listed with the same prominence as one it can.
    expect(card).toMatch(/grouped\.permission/);
    expect(card).toMatch(/grouped\.entitlement/);
    expect(card).toMatch(/denialGroup/);
    // The balance is not presented as a budget that can be spent on anything.
    expect(card).toMatch(/One credit is one agent turn/);
  });

  it('shows the release of a returned charge rather than hiding it', () => {
    const history = read('components/usage/UsageHistory.tsx');
    expect(history).toMatch(/released/);
    expect(history).toMatch(/Returned/);
    // The balance comes off the row the server stamped, not from replaying the history.
    expect(history).toMatch(/balanceAfter/);
    expect(history).toMatch(/movement\.balanceAfter/);
    // And the attempts list keeps the refusals, which is the whole point of having it.
    expect(history).toMatch(/refused/);
    expect(history).toMatch(/Nothing was consumed|no charge/);
  });

  it('renders every state rather than a stand-in', () => {
    const page = read(PAGE);
    expect(page).toMatch(/\bSkeleton\b/); // loading
    expect(page).toMatch(/\bErrorState\b/); // error and unavailable
    expect(page).toMatch(/status === 'error'/);
    expect(page).toMatch(/status === 'unavailable'/);
    expect(page).toMatch(/historyStatus === 'error'/);
    expect(page).toMatch(/historyStatus === 'unavailable'/);
    expect(page).toMatch(/historyStatus === 'idle'/);
    expect(page).toMatch(/\bUsageEmptyState\b/);

    // With no session there is no balance, and the page says so with the resolver's reason.
    expect(page).toMatch(/No usage to show/);
    expect(page).toMatch(
      /a stand-in figure would be worse than an empty page|Nothing is displayed/,
    );

    const upgrade = read('components/usage/UpgradePrompt.tsx');
    expect(upgrade).toMatch(/Not enough credits/);
    expect(upgrade).toMatch(/Nothing was consumed/);

    const store = read(STORE);
    expect(store).toMatch(/'unavailable'/);
    expect(store).not.toMatch(/localStorage/);
    expect(store).not.toMatch(/persist\(/);
  });

  it('reports whether the balance is durable instead of implying it always is', () => {
    const card = read('components/usage/SubscriptionStatusCard.tsx');
    expect(card).toMatch(/usage\.durable/);
    // Whitespace-tolerant: the sentence wraps in the JSX, and the assertion is about the
    // claim rather than about the line breaks.
    expect(card).toMatch(/not\s+durable here/);
    const page = read(PAGE);
    expect(page).toMatch(/Durable ledger/);
  });

  it('offers no execution affordance anywhere in the module', () => {
    const offenders: string[] = [];
    const files = [PAGE, STORE, CLIENT, ...usageFiles().map((file) => `components/usage/${file}`)];
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

  it('keeps the module free of payment and broker vocabulary', () => {
    const offenders: string[] = [];
    for (const file of usageFiles().map((entry) => `components/usage/${entry}`)) {
      const source = read(file);
      // No card number, no checkout, no broker: none of these exist in the platform, and a
      // field for one would collect something nothing can use.
      if (/(cardNumber|checkout|stripe|placeOrder|brokerAccount)/i.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
