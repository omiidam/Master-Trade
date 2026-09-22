# ADR-0049 — the brand is one source, generated rather than drawn

- **Status:** Accepted
- **Decision id:** `DEC-BRAND-1-ONE-SOURCE-GENERATED`
- **Phase:** 5.8 (Security, Privacy, Compliance & Brand Identity Foundation)
- **Supersedes:** the placeholder `M` tile in the navigation rail, and the icon instructions in
  `src-tauri/icons/README.md`. **Depends on:** ADR-0002 (one repository), ADR-0047 (nothing
  undeclared exists).

## Context

Before this phase the product had a placeholder brand: a gradient tile with the letter `M` in the
navigation rail, no favicon, no manifest, no Open Graph card, and an icon directory whose README told
the reader to generate the desktop icons from `web/public/logo.svg` — a file that had never existed.
`tauri.conf.json` referenced five icons that were not in the repository, and `npm run desktop:verify`
could not see the problem because it never checked that an icon path resolved.

The project now has an approved logo: a mark, a `MASTER TRADE` wordmark and a tagline, delivered as a
single 1254 × 1254 PNG — a rendered image with a studio background, not a vector, and not broken into
parts.

Three questions had to be settled, and each has a tempting answer that fails later.

**Where does the artwork live?** Committing hand-exported PNGs at nine sizes means the next brand
change is nine manual exports, and the favicon quietly diverges from the launcher icon the first time
one of them is forgotten. Committing the source only means every build needs an image toolchain.
Committing _one_ source plus the generated outputs, with a script that can regenerate them anywhere,
is the only arrangement where the outputs are reviewable and reproducible at once.

**How is the mark drawn in the interface?** Tracing the mark as an SVG would give a crisp scalable
logo that is a _second drawing_ of the brand — and it would drift from the source the first time the
source changed, invisibly, because both would still look like the logo. Reusing the generated icon
means the interface, the browser tab and the desktop launcher cannot disagree.

**Does the wordmark need to be an image?** The source's wordmark is a raster. At navigation size it
becomes a grey smear, and as an image it would ignore the interface's type scale and its RTL switch.

## Decision

**1. One committed source, everything else generated.** `assets/brand/master-trade-logo-source.png`
is the only brand artwork in the repository. `scripts/build-brand-assets.mjs` derives every icon,
favicon, launcher asset and link-preview card from it, and the generated files are committed so a
build machine with no image tooling can still package the application.

**2. The generator is dependency-free, and honest about its own subset.** A PNG codec (8-bit,
non-interlaced, RGB/RGBA), box-average downscaling, a radial alpha fade and a PNG-in-ICO writer are
about three hundred lines. Adding an image toolchain to a project that otherwise has none, for a job
that runs a few times a year, trades a readable file in the repository for a dependency in the build.

**3. The crop boxes are measured, and the measurement is a test.** The mark is the only saturated
region of the source and the only bright region above the wordmark, so its bounding box is computed
exactly (`npm run brand:measure`). `tests/brand.test.ts` re-measures on every run and fails if the
declared box stops containing the mark. A crop box that drifts is a logo that gets quietly clipped,
and nothing else in the pipeline would notice.

**4. Icons are the mark on a flat brand background; the lockup is used once.** A 218 px-wide mark
fitted to a 16 px favicon leaves the wordmark unreadable, so every icon is the mark alone, centred on
`#05070b` with a radial fade so the source's studio background does not read as a rectangle. The full
lockup — mark, wordmark, tagline — is used on exactly one surface, the 1200 × 630 Open Graph card,
because it is the only surface with room for all three parts.

**5. The wordmark in the interface is live text.** `BrandLockup` renders the generated mark plus
`Master Trade` in the product's own type scale, so the name inherits the interface type, mirrors in
RTL and stays sharp at any zoom. The lockup _image_ is reserved for surfaces that are not HTML.

**6. The mark is decorative unless it is the only name.** `BrandMark` renders `alt=""` with
`aria-hidden` by default and takes a `label` prop; `BrandLockup` passes one when it hides the
wordmark (the collapsed rail). Announcing the mark beside the word `Master Trade` is how a screen
reader ends up saying the name twice. No glow, filter or animation is needed to recognise it.

**7. Identity is declared and checked.** `index.html` declares the favicon links, apple-touch icon,
manifest, theme colour and Open Graph metadata; `site.webmanifest` declares the name, colours and
four icons including a maskable one. `tests/brand.test.ts` fails if any referenced path does not
exist, if an icon is not its declared size, if the manifest's colours stop matching the brand
background, or if the maskable icon's art leaves the launcher safe zone. `npm run desktop:verify`
fails if an icon `tauri.conf.json` names is missing, and reports the macOS `.icns` as a _warning_ so
a Windows build is not blocked by a file only macOS tooling can produce.

**8. Stale instructions are deleted, not annotated.** The `.svg` icon instructions are gone from
`src-tauri/icons/README.md`, and a test asserts no shipped document references the path that never
existed. A README that describes a file which is not there is worse than no README.

## Consequences

- Changing the brand is one file and one measured constant, and a test proves the constant is right.
  That is the whole workflow (`docs/brand-assets.md` §8).
- The interface, the browser tab, the iOS home screen, the installed web app and the desktop launcher
  are all the same mark, and cannot drift — which is the property a hand-traced SVG would have lost.
- The navigation rail no longer depends on a gradient and a letter, so the brand is legible at 16 px
  and identifiable without relying on a glow effect.
- **The generator rejects formats it does not implement** rather than degrading: a re-exported source
  that is interlaced, 16-bit or palette-based fails loudly with the reason. A silent mis-decode would
  ship a wrong logo, which is the one outcome worse than a failed build.
- **`og:image` is a relative path.** It is correct for a locally served build and needs an absolute
  URL once a public origin exists — a deployment-time item, tracked as **Requires review** in
  `docs/brand-assets.md` §7.
- **`icon.icns` is still missing**, deliberately: only `tauri icon` produces it, and only on macOS.
  It is reported as a warning and is the one release blocker recorded in
  `src-tauri/icons/README.md`.
- The brand background is a single constant shared by the generator, the manifest and the theme
  colour, and asserted to agree — so a change to the palette cannot leave an icon set sitting on the
  old colour.
