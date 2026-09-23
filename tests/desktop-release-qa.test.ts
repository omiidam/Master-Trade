/**
 * Phase 6.6 — the release QA report.
 *
 * The report is a *view* of rules other modules own, so these tests do not re-assert those
 * rules; they assert the three things this layer is responsible for and nothing else can check:
 *
 *   1. every scenario the phase names still has a witness in the suite that proves it, so
 *      "we tested that" is a dependency rather than a memory;
 *   2. the platform boundary is honest — a Windows-only step on a non-Windows host is
 *      `NOT_AVAILABLE`, and never a pass;
 *   3. nothing it prints is a credential, a token, or a path from someone's machine.
 *
 * The report is run against the real repository for the first of those, because a matrix
 * verified against a fixture would prove only that the fixture matches itself.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  QA_AREAS,
  QA_MATRIX,
  QA_STATUSES,
  formatQaReport,
  runReleaseQa,
  type QaReport,
} from '../src/desktop/release-qa.js';

const root = process.cwd();

/** The report as the committed tree stands, with the environment pinned so it is deterministic. */
async function report(
  overrides: Partial<Parameters<typeof runReleaseQa>[0]> = {},
): Promise<QaReport> {
  return runReleaseQa({ root, env: {}, ...overrides });
}

/** Every detail in the report, for the redaction assertions. */
function details(report: QaReport): string[] {
  return report.findings.map((finding) => `${finding.id} ${finding.detail}`);
}

describe('the release QA report', () => {
  it('reports on the committed tree with nothing failing', async () => {
    const qa = await report();
    const failures = qa.findings.filter((finding) => finding.status === 'FAIL');
    expect(failures.map((finding) => `${finding.id}: ${finding.detail}`)).toEqual([]);
    expect(qa.releaseReady).toBe(true);
    // The report is not vacuous: it has substance to report.
    expect(qa.findings.length).toBeGreaterThan(60);
    expect(qa.counts.PASS).toBeGreaterThan(50);
  });

  it('counts exactly what it prints', async () => {
    const qa = await report();
    for (const status of QA_STATUSES) {
      expect(qa.counts[status]).toBe(qa.findings.filter((f) => f.status === status).length);
    }
    expect(Object.values(qa.counts).reduce((total, count) => total + count, 0)).toBe(
      qa.findings.length,
    );
  });

  it('gives every finding an id that is unique, and an area that exists', async () => {
    const qa = await report();
    const ids = qa.findings.map((finding) => finding.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const finding of qa.findings) expect(QA_AREAS).toContain(finding.area);
  });

  it('states what it cannot vouch for, rather than leaving it implied', async () => {
    const qa = await report();
    expect(qa.unavailable.length).toBeGreaterThan(0);
    expect(qa.unavailable.some((line) => /Rust/.test(line))).toBe(true);
  });
});

describe('the evidence matrix', () => {
  it('covers every scenario the phase names, with unique ids', () => {
    const ids = QA_MATRIX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The nineteen scenarios, plus the witnesses this phase added for boundaries the earlier
    // suites could not reach (pipes, races, the handshake).
    expect(QA_MATRIX.length).toBeGreaterThanOrEqual(19);
    for (const entry of QA_MATRIX) {
      expect(entry.scenario.length).toBeGreaterThan(10);
      expect(entry.suite).toMatch(/^tests\//);
      expect(entry.evidence.length).toBeGreaterThan(8);
    }
  });

  it('finds a witness for every scenario in the committed tree', async () => {
    const qa = await report();
    const matrixFindings = qa.findings.filter((finding) => finding.id.startsWith('matrix.'));
    expect(matrixFindings.length).toBe(QA_MATRIX.length);
    const lost = matrixFindings.filter((finding) => finding.status !== 'PASS');
    expect(lost.map((finding) => `${finding.id}: ${finding.detail}`)).toEqual([]);
  });

  it('fails a scenario whose suite is gone, naming the suite', async () => {
    const qa = await report({
      readFile: async (path: string) => {
        if (path.endsWith('desktop-hardening.test.ts')) throw new Error('ENOENT');
        return readFile(path, 'utf8');
      },
    });
    const lost = qa.findings.filter(
      (finding) => finding.id.startsWith('matrix.') && finding.status === 'FAIL',
    );
    // Every scenario whose only witness is that suite, and not the ones witnessed elsewhere.
    expect(lost.length).toBeGreaterThan(0);
    for (const finding of lost) {
      expect(finding.detail).toMatch(/has no witness: tests\/desktop-hardening\.test\.ts/);
    }
    expect(qa.releaseReady).toBe(false);
  });

  it('fails a scenario whose test was removed, rather than reporting it as covered', async () => {
    const qa = await report({
      readFile: async (path: string) => {
        if (path.endsWith('desktop-update.test.ts')) return 'describe("updates", () => {});';
        return readFile(path, 'utf8');
      },
    });
    const lost = qa.findings.filter(
      (finding) => finding.id.startsWith('matrix.') && finding.status === 'FAIL',
    );
    expect(lost.length).toBeGreaterThan(3);
    for (const finding of lost) {
      expect(finding.detail).toMatch(/lost its witness/);
    }
    expect(qa.releaseReady).toBe(false);
  });
});

describe('the platform boundary', () => {
  it('refuses to claim a Windows-only path was exercised elsewhere', async () => {
    const qa = await report({ platform: 'linux' });
    const host = qa.findings.find((finding) => finding.id === 'platform.host');
    expect(host?.status).toBe('NOT_AVAILABLE');
    expect(host?.detail).toMatch(/linux/);
    expect(host?.detail).toMatch(/not exercised/);
    // Not a failure — an unexercised check is a qualification, not a verdict on the tree.
    expect(qa.releaseReady).toBe(true);
    // And it is listed among the things this report cannot vouch for.
    expect(qa.unavailable.some((line) => line.startsWith('platform.host:'))).toBe(true);
  });

  it('passes it on Windows, where the path can actually be exercised', async () => {
    const qa = await report({ platform: 'win32' });
    const host = qa.findings.find((finding) => finding.id === 'platform.host');
    expect(host?.status).toBe('PASS');
    expect(host?.detail).toMatch(/can be exercised here/);
  });

  it('reports the installer as unavailable when nothing was bundled here', async () => {
    const qa = await report({ listDir: async () => [] });
    const artifact = qa.findings.find((finding) => finding.id === 'platform.installer-artifact');
    expect(artifact?.status).toBe('NOT_AVAILABLE');
    expect(artifact?.detail).toMatch(/tauri build/);
    expect(qa.releaseReady).toBe(true);
  });

  it('reports an environment that was not declared, because a release names its own', async () => {
    const undeclared = await report({ env: {} });
    expect(
      undeclared.findings.find((finding) => finding.id === 'platform.environment')?.status,
    ).toBe('WARN');

    const declared = await report({ env: { MASTER_TRADE_ENVIRONMENT: 'production' } });
    const environment = declared.findings.find((finding) => finding.id === 'platform.environment');
    expect(environment?.status).toBe('PASS');
    expect(environment?.detail).toMatch(/declared as production/);
    expect(declared.environment).toBe('production');
  });
});

describe('what the report prints', () => {
  it('never repeats a credential, a token or a path from a machine', async () => {
    const qa = await report();
    for (const line of details(qa)) {
      expect(line).not.toMatch(/[A-Za-z]:\\/);
      expect(line).not.toMatch(/\/(?:home|Users)\//);
      expect(line).not.toMatch(/Bearer\s/i);
      expect(line).not.toMatch(/token\s*=|password\s*=|secret\s*=/i);
    }
  });

  it('formats every verdict, and says that NOT_AVAILABLE is not a pass', async () => {
    const qa = await report({ platform: 'darwin' });
    const text = formatQaReport(qa);
    // Every verdict that has a finding is printed as its own mark; the summary names all four
    // counts whether or not they are non-zero, so an empty verdict is visible as a zero.
    for (const status of QA_STATUSES) {
      if (qa.counts[status] > 0) expect(text).toContain(status);
    }
    expect(text).toMatch(/NOT_AVAILABLE is not a pass/);
    expect(text).toContain('What this report cannot vouch for:');
    expect(text).toMatch(/finding\(s\): \d+ pass, \d+ warn, \d+ fail, \d+ not available/);
  });

  it('keeps a report readable when an area has nothing in it', async () => {
    const qa = await report();
    const text = formatQaReport(qa);
    for (const area of QA_AREAS) {
      const present = qa.findings.some((finding) => finding.area === area);
      if (present) expect(text).toContain(`\n${area}\n`);
    }
  });
});

describe('the release documentation the report points at', () => {
  it('finds the checklist in the document it names', async () => {
    const qa = await report();
    const docs = qa.findings.find((finding) => finding.id === 'docs.release-checklist');
    expect(docs?.status).toBe('PASS');
    const source = await readFile(join(root, 'docs', 'desktop-release-qa.md'), 'utf8');
    expect(source).toMatch(/^##\s.*release checklist/im);
  });

  it('warns, rather than failing, when the document is missing', async () => {
    const qa = await report({
      readFile: async (path: string) => {
        if (path.endsWith('desktop-release-qa.md')) throw new Error('ENOENT');
        return readFile(path, 'utf8');
      },
    });
    expect(qa.findings.find((finding) => finding.id === 'docs.release-checklist')?.status).toBe(
      'WARN',
    );
    expect(qa.releaseReady).toBe(true);
  });
});
