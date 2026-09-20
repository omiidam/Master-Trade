/**
 * `npm run desktop:verify` — check the desktop shell source without Rust.
 *
 * Exit code is 0 when every error-severity check passes and 1 otherwise, so this
 * can gate a build. Warnings (a placeholder updater key, for example) are printed
 * and do not fail the run: they are release-blocking, not development-blocking.
 *
 * The verifier cannot build the native app. It says so in its own output rather
 * than letting a green report be read as "the shell was launched".
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { verifyDesktopShell } from './verify.js';
import { capabilityMatrix } from './capabilities.js';

const here = dirname(fileURLToPath(import.meta.url));
// dist/src/desktop/cli.js -> the repository root is three levels up.
// (Phase 4.3: the build root became the repository root so that `packages/shared`
// can be compiled alongside `src/` — see ADR-0035 step 2.)
const root = resolve(here, '..', '..', '..');

const report = await verifyDesktopShell({ root });

console.log('Master Trade — desktop shell verification\n');
for (const check of report.checks) {
  const mark = check.ok ? 'PASS' : check.severity === 'warning' ? 'WARN' : 'FAIL';
  console.log(`${mark}  ${check.id}\n      ${check.detail}`);
}

console.log('\nGranted to the WebView (deny-by-default; everything else is a Rust command):');
for (const entry of capabilityMatrix()) {
  console.log(`  ${entry.required ? '*' : ' '} ${entry.permission}`);
}

console.log('\nNot covered by this report:');
for (const item of report.unverifiable) console.log(`  - ${item}`);

console.log(
  `\n${report.errors} error(s), ${report.warnings} warning(s) across ${report.checks.length} checks`,
);
process.exitCode = report.errors === 0 ? 0 : 1;
