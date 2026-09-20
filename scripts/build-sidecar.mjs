#!/usr/bin/env node
/**
 * Package the TypeScript backend as the desktop sidecar binary.
 *
 * The shell launches one external binary (`bundle.externalBin` in
 * `src-tauri/tauri.conf.json`). Node's Single Executable Application support turns
 * our build output into that binary: bundle to CommonJS, generate the SEA blob,
 * copy the Node runtime, inject the blob, rename with the Rust target triple.
 *
 * The script is honest about its own prerequisites. It performs the steps it can,
 * and when a tool is missing it prints the exact command that remains instead of
 * pretending the artifact exists. On a build machine with a Rust toolchain,
 * esbuild and postject, it completes unattended.
 *
 * Usage: npm run build:sidecar
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binariesDir = join(root, 'src-tauri', 'binaries');
const buildDir = join(root, 'dist');
const bundlePath = join(buildDir, 'sidecar', 'master-trade-api.cjs');
const seaConfigPath = join(root, '.sea-config.json');
const blobPath = join(root, 'sea-prep.blob');

const problems = [];
const notes = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: root, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
}

function has(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    cwd: root,
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

/** Rust target triple, so the binary name matches what Tauri expects. */
function targetTriple() {
  try {
    const output = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
    if (output.length > 0) return output;
  } catch {
    notes.push('rustc is not on PATH; the target triple was derived from this Node build instead');
  }
  const platform = { win32: 'pc-windows-msvc', darwin: 'apple-darwin', linux: 'unknown-linux-gnu' }[
    process.platform
  ];
  const arch = { x64: 'x86_64', arm64: 'aarch64', arm: 'arm' }[process.arch];
  if (!platform || !arch) {
    problems.push(`cannot derive a target triple for ${process.platform}/${process.arch}`);
    return null;
  }
  return `${arch}-${platform}`;
}

console.log('Master Trade — packaging the desktop sidecar\n');

// 1. The compiled backend. `npm run build` is the same command CI runs.
console.log('1/5  building the backend (tsc)');
run('npm', ['run', 'build'], { shell: process.platform === 'win32' });
if (!existsSync(join(buildDir, 'server', 'start.js'))) {
  problems.push('dist/server/start.js is missing after the build');
}

// 2. One CommonJS file. Node's SEA entry point must be CommonJS, and this project
//    is ESM, so a bundling step is required rather than optional.
console.log('2/5  bundling to CommonJS');
mkdirSync(dirname(bundlePath), { recursive: true });
if (has('npx', ['--no-install', 'esbuild', '--version'])) {
  run(
    'npx',
    [
      '--no-install',
      'esbuild',
      join(buildDir, 'server', 'start.js'),
      '--bundle',
      '--platform=node',
      '--target=node22',
      '--format=cjs',
      // Native/optional deps stay external: they are loaded from the runtime's own
      // resolution, not captured into the bundle.
      '--external:node:*',
      `--outfile=${bundlePath}`,
    ],
    { shell: process.platform === 'win32' },
  );
} else {
  problems.push(
    'esbuild is not installed. Run `npm install --save-dev esbuild`, or bundle dist/server/start.js to CommonJS with the tool of your choice and place it at dist/sidecar/master-trade-api.cjs',
  );
}

// 3. The SEA blob.
console.log('3/5  generating the SEA blob');
if (existsSync(bundlePath)) {
  writeFileSync(
    seaConfigPath,
    `${JSON.stringify(
      {
        // Paths here are build-machine paths; SEA embeds the file, so they are not
        // resolved at run time.
        main: bundlePath,
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
      },
      null,
      2,
    )}\n`,
  );
  try {
    run(process.execPath, ['--experimental-sea-config', seaConfigPath]);
  } catch (error) {
    problems.push(`could not generate the SEA blob: ${error.message}`);
  }
} else {
  problems.push('no CommonJS bundle to embed (step 2 did not produce one)');
}

// 4. Copy the Node runtime next to the Tauri bundle and inject the blob.
const triple = targetTriple();
const targetBinary = triple
  ? join(binariesDir, `master-trade-api-${triple}${process.platform === 'win32' ? '.exe' : ''}`)
  : null;

console.log('4/5  preparing the runtime copy');
if (targetBinary && existsSync(blobPath)) {
  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(process.execPath, targetBinary);
  notes.push(`copied ${process.execPath} to ${targetBinary}`);
} else if (!targetBinary) {
  problems.push('no target triple, so the runtime copy was skipped');
} else {
  problems.push('no SEA blob, so the runtime copy was skipped');
}

console.log('5/5  injecting the blob');
if (targetBinary && existsSync(blobPath) && existsSync(targetBinary)) {
  const postject = spawnSync(
    'npx',
    [
      '--no-install',
      'postject',
      targetBinary,
      'NODE_SEA_BLOB',
      blobPath,
      '--sentinel-fuse',
      'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ],
    { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' },
  );
  if (postject.status !== 0) {
    problems.push(
      [
        'postject is not available. Inject the blob with:',
        `  npx postject "${targetBinary}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
        '  (macOS also needs: codesign --remove-signature <binary> before, and codesign --sign - after)',
      ].join('\n  '),
    );
  } else {
    // The signature is invalidated by injection on macOS; re-sign ad-hoc so the OS
    // will run the binary.
    if (process.platform === 'darwin' && has('codesign')) {
      try {
        run('codesign', ['--sign', '-', targetBinary]);
      } catch {
        notes.push('codesign --sign - failed; sign the sidecar manually before packaging');
      }
    }
  }
}

console.log('\nSummary');
for (const note of notes) console.log(`  note: ${note}`);
if (problems.length === 0) {
  console.log(`  sidecar ready: ${targetBinary}`);
  console.log('  next: npm run desktop:build (requires the Rust toolchain and @tauri-apps/cli)');
  process.exit(0);
}
for (const problem of problems) console.log(`  UNFINISHED: ${problem}`);
console.log(
  '\n  This is not a successful packaging run: the artifact the shell expects is incomplete.',
);
process.exitCode = 1;
