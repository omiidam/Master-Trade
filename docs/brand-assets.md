# Brand assets, identity and usage

Status labels used throughout: **Implemented** · **Planned** · **Requires review**.

The Master Trade mark is a **build artifact**. One approved source image lives in the repository
and every icon, favicon, launcher asset and link-preview card is generated from it by a script.
Nothing is hand-exported, nothing is drawn twice, and no surface can end up showing a logo the
others do not.

## 1. The source

|          |                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------ |
| File     | `assets/brand/master-trade-logo-source.png`                                                      |
| Format   | PNG, 8-bit, RGBA, non-interlaced                                                                 |
| Size     | 1254 × 1254                                                                                      |
| Contents | The full lockup: the MT mark, the `MASTER TRADE` wordmark, the tagline, on the studio background |
| Owner    | The project. Replacing it is the _only_ way to change the brand.                                 |

It is one file on purpose. The mark, the wordmark and the tagline are all in it, so the lockup
crop, the mark crop and the icon set can never disagree about what the logo looks like.

**Implemented.**

## 2. Generation

```bash
npm run brand:assets     # regenerate every asset below from the source
npm run brand:measure    # print the measured bounding box of the mark, and probe the source
npm run desktop:icons    # macOS .icns, and a full re-export, via @tauri-apps/cli
```

`scripts/build-brand-assets.mjs` is dependency-free Node: it decodes the PNG, crops, resamples and
re-encodes, and writes the ICO container itself. That is a deliberate choice over adding an image
toolchain to a project that otherwise has none, for a job that runs a few times a year. The subset
of the format it accepts is narrow — 8-bit, non-interlaced, RGB or RGBA — and it throws with the
exact reason instead of producing a wrong image.

**Where the crop boxes come from.** They are _measured_, not guessed. The mark is the only
saturated (blue/teal) region of the source and the only bright region above the wordmark, so
`npm run brand:measure` locates it exactly:

```
measured mark box: x 354–936, y 232–653
declared mark box: x 330–959, y 208–676   (those bounds plus ~2% margin)
```

`tests/brand.test.ts` re-measures on every run and fails if the declared box ever stops containing
the mark. A crop box that drifts is a logo that gets quietly clipped.

**Implemented.**

## 3. The files, and where each one is used

### Compact mark — icons, launchers, browser chrome

Every file below is the same mark, centred on the brand background (`#05070b`), at a different size.

| File                               | Size                    | Used by                                           |
| ---------------------------------- | ----------------------- | ------------------------------------------------- |
| `web/public/favicon.ico`           | 16, 32, 48 (PNG-in-ICO) | Browser tab, bookmark, history                    |
| `web/public/favicon-16.png`        | 16 × 16                 | Browser tab (declared size)                       |
| `web/public/favicon-32.png`        | 32 × 32                 | Browser tab (declared size)                       |
| `web/public/favicon-48.png`        | 48 × 48                 | Manifest `any` entry, high-DPI tabs               |
| `web/public/apple-touch-icon.png`  | 180 × 180               | iOS home screen                                   |
| `web/public/icon-192.png`          | 192 × 192               | Manifest `any`; the in-app mark at 1×             |
| `web/public/icon-512.png`          | 512 × 512               | Manifest `any`; the in-app mark at 2×             |
| `web/public/icon-maskable-512.png` | 512 × 512               | Manifest `maskable` (inset 10%)                   |
| `src-tauri/icons/32x32.png`        | 32 × 32                 | Desktop launcher                                  |
| `src-tauri/icons/128x128.png`      | 128 × 128               | Desktop launcher                                  |
| `src-tauri/icons/128x128@2x.png`   | 256 × 256               | Desktop launcher, high-DPI                        |
| `src-tauri/icons/icon.png`         | 512 × 512               | Desktop bundle source                             |
| `src-tauri/icons/icon.ico`         | 16, 32, 48, 64, 256     | Windows executable                                |
| `src-tauri/icons/icon.icns`        | —                       | **Planned**: macOS, needs `npm run desktop:icons` |

### Full lockup — the one surface with room for it

| File                      | Size       | Used by                              |
| ------------------------- | ---------- | ------------------------------------ |
| `web/public/og-image.png` | 1200 × 630 | Open Graph and Twitter link previews |

The card is the whole lockup — mark, wordmark, tagline — centred on the brand background, because
it is the only surface where the wordmark is large enough to read.

### In-app

| Component     | Renders                                               | Used by                           |
| ------------- | ----------------------------------------------------- | --------------------------------- |
| `BrandMark`   | The generated icon at a given size                    | Footer, collapsed navigation rail |
| `BrandLockup` | The generated icon plus the product name as live text | Navigation header, About dialog   |

The wordmark in the interface is **live text**, not the source image's raster wordmark: it inherits
the interface type, mirrors correctly in RTL, and stays sharp at any zoom.

**Implemented.**

## 4. The rule: which mark, where

Putting the full lockup everywhere is the failure mode this section exists to prevent.

- **The compact mark** goes anywhere the surface is smaller than roughly 200 px wide, or where the
  product's name is already on screen: favicon, launcher icons, the collapsed navigation rail, the
  footer, the maskable icon. The wordmark in the source is 795 px wide; below ~120 px it becomes an
  unreadable grey smear, which is worse than no wordmark.
- **The lockup** goes where there is room for both parts to be read: the navigation header when
  expanded, the About dialog, and the link-preview card.
- **One mark per screen.** The navigation header carries the lockup, so no page adds a second one in
  its own header. A logo repeated twice on one screen reads as a mistake, and the second copy is
  always in a place with less room than the first.
- **Never decorative-only for identification.** Contrast and shape carry the brand; no glow, filter
  or animation is required to recognise it.

**Implemented.**

## 5. Accessibility

| Rule                            | How it is satisfied                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decorative by default           | `BrandMark` renders `alt=""` and `aria-hidden` unless given a `label` — in every placement the product's name is written beside it, so announcing the mark would say the name twice |
| Named where it is the only name | `BrandLockup` passes `label="Master Trade"` when the wordmark is hidden (the collapsed rail)                                                                                        |
| Sized, never stretched          | The mark is rendered with explicit `width`/`height`, so no layout can distort its aspect ratio and no container can overflow it                                                     |
| No effect-dependent identity    | The mark is a bordered tile with no glow, filter or animation                                                                                                                       |
| Contrast                        | The mark is bright artwork on the brand background; the wordmark uses the interface's own `text` token, which is already contrast-checked against it                                |

**Implemented.** A formal WCAG audit of the interface as a whole is **Planned**.

## 6. Responsive and touch behaviour

| Surface             | Behaviour                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop (≥ 1024 px) | Navigation rail expanded: lockup at 36 px. Footer mark at 18 px.                                                                                                                                                              |
| Tablet              | Rail collapses to icons by media query (`COMPACT_SHELL_QUERY`), not by preference: the lockup becomes the 36 px mark with `label="Master Trade"`.                                                                             |
| Mobile / narrow     | Same collapsed rail, so the header stays 36 px wide and cannot crowd the workspace. The mark is a tappable-size target only where it is inside a control; elsewhere it is not interactive.                                    |
| First paint         | A static splash inside `#root` shows the mark, the name and `Starting the workstation…`, and React replaces it on mount. It contains no script, because the desktop shell's content security policy allows no inline scripts. |
| High-DPI            | `srcSet="/icon-192.png 1x, /icon-512.png 2x"`, so a 2× panel gets a 2× file rather than an upscale.                                                                                                                           |

**Implemented.** The splash exists because the desktop window is created hidden and shown only after
the API answers (`window.hidden-until-ready` in `tauri.conf.json`), so it is the browser preview and
the first React frame that need it — **not** a separate desktop splash screen, which would be
**Planned** only if the shell ever stops hiding the window.

## 7. Browser and PWA identity

`web/index.html` declares: `favicon.ico` (`sizes="any"`), `favicon-32.png`, `favicon-16.png`,
`apple-touch-icon`, `site.webmanifest`, `theme-color` and `color-scheme`, Open Graph (`og:type`,
`og:site_name`, `og:title`, `og:description`, `og:image` with explicit dimensions and `og:image:alt`)
and `twitter:card`. `web/public/site.webmanifest` declares the name, short name, `start_url`, scope,
`display`, `orientation`, both colours and four icons including the maskable one.

Every local path referenced from the HTML and the manifest is checked by `tests/brand.test.ts`
against the files on disk — a reference that does not resolve is a test failure, not a 404 in
production. `npm run desktop:verify` separately checks that every icon `tauri.conf.json` names
exists, because a missing icon is a `tauri build` failure.

**Implemented.** HTTPS and CDN-level headers are **Requires review** at deployment time; there is
no public deployment in this phase.

## 8. Changing the brand

1. Replace `assets/brand/master-trade-logo-source.png` (≥ 1000 × 1000, 8-bit PNG).
2. `npm run brand:measure` — read the measured mark box.
3. Update `SOURCE_BOXES.mark` (and `.lockup` if the wordmark moved) in
   `scripts/build-brand-assets.mjs`.
4. `npm run brand:assets`, then `npm run desktop:icons` on a machine with the Tauri CLI.
5. `npm test -- tests/brand.test.ts`.

Step 3 is the only manual edit, and step 5 is what proves it was right.
