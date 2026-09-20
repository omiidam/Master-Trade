# Dependency Audit — Vitest / Vite toolchain advisories

**Status:** investigated, **remediation documented but not applied** (it is a breaking
change and requires explicit approval). Production scope is clean. See §4 for the exact
upgrade and its verification.

Audited at commit `40751ff`, Node 24.20.0, npm 11.19.0.

## 1. What the audit reports

`npm audit` reports **5 vulnerabilities (3 moderate, 1 high, 1 critical)** across 349
dependencies (115 production, 235 development, 128 optional).

**All five are development/test toolchain.** None is in the production dependency
scope:

```
$ npm audit --omit=dev --audit-level=high
found 0 vulnerabilities          # exit 0
```

| Package               | Severity | Advisory                                                                                                                                                                                                                     | Affected range             | Patched in            |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------- |
| `vitest`              | critical | [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) (CVE-2026-47429)                                                                                                                                    | `<3.2.6`, `>=4.0.0 <4.1.0` | 3.2.6, 4.1.0          |
| `vitest`              | moderate | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) (CVE-2026-84373), via `@vitest/mocker`                                                                                                              | `>=2.1.0 <4.1.11`          | **4.1.11**            |
| `@vitest/mocker`      | moderate | GHSA-82fw-gwwq-j7x9                                                                                                                                                                                                          | `>=2.1.0 <4.1.11`          | **4.1.11**            |
| `vite` (nested ×2)    | high     | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | `<=6.4.2`                  | 6.4.3                 |
| `vite-node`           | moderate | via `vite`                                                                                                                                                                                                                   | `<=2.2.0-beta.2`           | (removed in vitest 4) |
| `esbuild` (nested ×2) | moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)                                                                                                                                                     | `<=0.24.2`                 | 0.25.0                |

## 2. Why they exist: a nested duplicate major

`vitest@2.1.9` requires `vite ^5.0.0`. The project's own `vite` is **6.4.3**, which
cannot satisfy that, so npm keeps a **second, nested copy**:

```
master-trade@0.6.0
+-- vite@6.4.3                          ← our dev server and bundle. NOT vulnerable.
|   `-- esbuild@0.25.12                 ← NOT vulnerable.
`-- vitest@2.1.9                       ← the only flagged tree
    +-- @vitest/mocker@2.1.9            → vulnerable (no 2.x patch exists)
    +-- vite-node@2.1.9
    |   `-- vite@5.4.21                 → vulnerable
    |       `-- esbuild@0.21.5          → vulnerable
    `-- vite@5.4.21
        `-- esbuild@0.21.5
```

Every flagged `node` in the audit is `node_modules/vitest/node_modules/…` or
`node_modules/vite-node/node_modules/…`. The top-level `vite@6.4.3` sits **outside**
every affected range. Note that `5.4.21` is the last `5.4.x` release ever published, so
**there is no patched Vite 5** — the duplicate cannot be upgraded, only eliminated.

## 3. Actual reachability in this repository

Severity in an advisory is not the same as exposure in a given project. Each finding
requires a capability this repository does not have:

| Advisory                     | Requires                                                                                                                                             | Present here?                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GHSA-5xrq (critical)         | Vitest **UI** / Browser Mode running, or the UI server exposed to the network                                                                        | **No.** Only `vitest run` (CLI). No `@vitest/ui`, no `--ui`, no `--api.host`, no browser mode.                                                                                 |
| GHSA-82fw (moderate)         | `vi.mock` **redirect** mocks, or a third-party dev server using the public `mockerPlugin` / `interceptorPlugin` on Vite's unauthenticated HMR socket | **No.** `vi.mock` appears **0 times** in `tests/`; no custom dev server; no browser mode.                                                                                      |
| vite advisories (high)       | A running dev/preview server (`.map` traversal, `launch-editor` UNC handling, `server.fs.deny` bypass on Windows)                                    | **Not via this copy.** Our dev server is top-level `vite@6.4.3`, which is patched. The nested 5.4.21 is used by `vite-node` to load modules _during tests_; it serves nothing. |
| esbuild GHSA-67mh (moderate) | An `esbuild` dev server reachable by a browser                                                                                                       | **No.** Same nested copy, same reasoning.                                                                                                                                      |
| vite-node (moderate)         | Inherited from the nested `vite`; same as above                                                                                                      | **No.**                                                                                                                                                                        |

The `vitest` **critical** rating is a severity roll-up: it takes the highest of its
`via` entries, which includes the UI-server advisory. The reachable-in-our-usage
advisories in that chain are the moderate `@vitest/mocker` and nested-`vite` ones.

## 4. Recommended remediation — documented, **not applied**

**Upgrade `vitest` from 2.1.9 to `^4.1.11`.** That is the _minimum fully patched_
version, and one change clears all five findings:

- `@vitest/mocker` → `4.1.11` (fixed; the 4.1.11 patch is why 3.x is not enough)
- `vitest` → `4.1.11` (clears GHSA-5xrq, patched since 3.2.6)
- `vite-node` **no longer exists** in vitest 4 — it is not among its dependencies
- `vite` — vitest 4 requires `^6.0.0 || ^7.0.0 || ^8.0.0`, so the nested copy disappears
  and the tree **dedupes to our existing `vite@6.4.3`**, which is patched
- `esbuild` → resolves to `0.25.12` through `vite@6.4.3`, which is patched

Engines are satisfied: vitest 4 needs `node ^20 || ^22 || >=24`, and CI already runs a
22/24 matrix (local is 24).

```bash
npm install --save-dev vitest@^4.1.11
npm run validate        # expect 386 tests in 29 files
npm audit               # expect 0 vulnerabilities
npm run build:web       # confirm the bundle still builds
```

**Why this is not applied automatically.** `2 → 4` is two major versions. This
repository's guarantees rest on 386 tests plus strict architectural invariants, and a
major test-runner upgrade can change resolution, timing and isolation semantics. The
configuration surface is small — `vitest.config.ts` uses only `include` and
`environment: 'node'`, and the `@shared` alias — but "small config" is not evidence
that the suite behaves identically. The upgrade must be made deliberately, with the
suite run and the result inspected.

### Alternatives rejected

| Option                                                   | Why not                                                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit fix --force`                                  | Installs `vitest@5.0.1` — npm offers the _latest_ major, not the minimum patch. It also applies a breaking change blind. Explicitly ruled out. |
| Upgrade to `vitest@3.2.7` (one major)                    | Clears the critical UI advisory but **not** GHSA-82fw (`@vitest/mocker` 3.2.7 < 4.1.11). Leaves two findings. Not a fix.                       |
| `overrides` to force `vite@6.4.3` into vitest 2          | Cannot clear `@vitest/mocker@2.1.9`, for which **no 2.x patch exists** — so the audit still fails. A partial fix that adds a fragile override. |
| Patch `vite@5.4.21` in place                             | Impossible: `5.4.21` is the final `5.4.x` release. No patched Vite 5 exists.                                                                   |
| Silencing the advisories (`audit --omit=dev` everywhere) | Hides a real, if currently unreachable, exposure instead of removing it.                                                                       |

## 5. What did change: a ship-time audit gate

The findings above are the reason the scope question matters, so the boundary is now
enforced rather than remembered:

- `npm run audit:prod` → `npm audit --omit=dev --audit-level=high`
- `.github/workflows/ci.yml` runs it after `npm ci`, before `validate`

This fails CI on **high or critical production-scope** advisories — the ones that could
ship to a user — while keeping dev-toolchain noise from blocking unrelated work.

It is deliberately **not** part of `npm run validate`: `validate` is offline and
deterministic (format → typecheck → tests → builds → desktop verify), and folding a
registry network call into it would make the local pipeline fail for reasons unrelated
to the code in front of you.

## 6. Remaining vulnerabilities and justification

**5 remain, by decision.** They are dev/test-only and not reachable through any code
path this repository exercises: no Vitest UI or browser mode, no `vi.mock` (hence no
redirect mocks), and no dev server served from the nested duplicates. They will be
cleared by the §4 upgrade.

The distinction this document records: **a vulnerability in a tool you run locally is
not the same as a vulnerability in what you ship.** `npm audit --omit=dev` is the line,
and it is currently at zero.

## 7. Re-audit checklist

1. `npm run audit:prod` — must stay at 0.
2. `npm audit` — expected to show the 5 dev-scope findings until §4 is applied.
3. When the vitest 4 upgrade is approved: run `npm audit` and confirm 0, then delete
   §3–§6's dev-scope caveats and record the new versions.
