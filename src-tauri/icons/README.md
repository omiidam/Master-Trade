# Desktop icons

`tauri.conf.json` references `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico` and
`icon.icns`. They are **generated**, never hand-exported, and they are committed: a build
machine with no image tooling must still be able to package the application.

## What is generated here, and by what

| File                                                     | Generator                                         | Committed |
| -------------------------------------------------------- | ------------------------------------------------- | --------- |
| `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png` | `npm run brand:assets`                            | yes       |
| `icon.ico`                                               | `npm run brand:assets`                            | yes       |
| `icon.icns`                                              | `npm run desktop:icons` (needs `@tauri-apps/cli`) | not yet   |

`npm run brand:assets` is dependency-free Node (see `scripts/build-brand-assets.mjs`) and
derives every icon from one approved source image, so it runs anywhere the repository is
checked out. It covers everything Windows and Linux need.

`icon.icns` is a macOS container that only `tauri icon` produces, and it is the one file
this repository cannot generate on a Windows or Linux host:

```bash
npm run desktop:icons      # tauri icon assets/brand/master-trade-logo-source.png
```

That command rewrites **all** of the icons in this directory, including the PNGs and the
ICO, from the same source — so running it is always safe and always leaves the set
consistent. Do it before the first macOS release; a missing `.icns` is a `tauri build`
failure on macOS only, and `npm run desktop:verify` reports it as a warning (never as an
error) so a Windows or Linux build is not blocked by a file it does not need.

## The source

`assets/brand/master-trade-logo-source.png` — one image, one place to change it. Replacing
it and re-running `npm run brand:assets` regenerates the favicon, the PWA icons, the
Open Graph card and this directory together. `npm run brand:measure` prints the measured
bounding box of the mark, which is what the crop boxes in the generator are derived from.

Composition rules, the full file list and the accessibility rules are in
`docs/brand-assets.md`.
