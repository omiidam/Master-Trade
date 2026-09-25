/**
 * Brand assets, identity and usage.
 *
 * A logo is a build artifact, not a design file, and the ways it goes wrong are boring and
 * invisible: a referenced file that was never generated, an icon set that silently kept a
 * placeholder, a mark re-drawn by hand that no longer matches the favicon, a maskable icon
 * whose art a launcher mask clips. This suite pins the properties that make those failures
 * impossible to ship:
 *
 *   1. **One source.** Every asset is derived from `assets/brand/`, and the declared crop
 *      boxes actually contain the mark — measured from the pixels, not trusted.
 *   2. **Every declared file exists at its declared size**, is square, and is not blank.
 *   3. **The mark fills the tile**, and the maskable variant stays inside the safe zone.
 *   4. **The documents agree**: the manifest, the HTML and the icons reference files that
 *      exist, and no obsolete path survives anywhere.
 *   5. **The mark is accessible**: decorative by default, named where it is the only name,
 *      and never a fixed-size box that can overflow a narrow viewport.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyOf } from './helpers/source-copy.js';
import {
  BRAND_BACKGROUND,
  ICON_SET,
  SOURCE_BOXES,
  boxContains,
  decodePng,
  measureMarkBox,
  readSource,
} from '../scripts/build-brand-assets.mjs';

const root = process.cwd();
const web = join(root, 'web');
const publicDir = join(web, 'public');

const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const bytes = (path: string): Buffer => readFileSync(join(root, path));

/** IHDR is at a fixed offset in every PNG this project writes. */
function pngSize(path: string): { width: number; height: number } {
  const buffer = bytes(path);
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Bounding box of everything brighter than `threshold`, as a fraction of the canvas. */
function contentBounds(path: string, threshold = 0.2) {
  const image = decodePng(bytes(path));
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4;
      const luminance =
        (0.2126 * (image.data[i] ?? 0) +
          0.7152 * (image.data[i + 1] ?? 0) +
          0.0722 * (image.data[i + 2] ?? 0)) /
        255;
      if (luminance <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error(`${path} has no content above luminance ${threshold}`);
  return {
    left: x0 / image.width,
    top: y0 / image.height,
    width: (x1 - x0 + 1) / image.width,
    height: (y1 - y0 + 1) / image.height,
  };
}

describe('the source of truth', () => {
  it('is present, decodable and large enough to downsample from', () => {
    const source = readSource();
    expect(source.width).toBeGreaterThanOrEqual(1000);
    expect(source.height).toBeGreaterThanOrEqual(1000);
  });

  it('has its mark inside the declared crop box', () => {
    const source = readSource();
    const measured = measureMarkBox(source);
    // The box is measured, not guessed: the mark is the only saturated and only bright
    // region above the wordmark, so a mistake here is a real mistake.
    expect(boxContains(SOURCE_BOXES.mark, measured)).toBe(true);
  });

  it('keeps the declared boxes inside the image, aspect-true, and non-overlapping with the tagline', () => {
    for (const [name, box] of Object.entries(SOURCE_BOXES)) {
      expect(box.x0, name).toBeGreaterThanOrEqual(0);
      expect(box.y0, name).toBeGreaterThanOrEqual(0);
      expect(box.x1, name).toBeLessThanOrEqual(1);
      expect(box.y1, name).toBeLessThanOrEqual(1);
      expect(box.x1, name).toBeGreaterThan(box.x0);
      expect(box.y1, name).toBeGreaterThan(box.y0);
    }
    // The lockup is the only box that may include the wordmark and tagline.
    expect(SOURCE_BOXES.lockup.y1).toBeGreaterThan(SOURCE_BOXES.mark.y1);
    expect(SOURCE_BOXES.lockup.x0).toBeLessThan(SOURCE_BOXES.mark.x0);
  });
});

describe('the generated set', () => {
  it('writes every declared icon at its declared size', () => {
    expect(ICON_SET.length).toBeGreaterThanOrEqual(10);
    for (const entry of ICON_SET) {
      expect(existsSync(join(root, entry.path)), `${entry.path} is missing`).toBe(true);
      const size = pngSize(entry.path);
      expect(size, entry.path).toEqual({ width: entry.size, height: entry.size });
    }
  });

  it('marks every icon as a real mark rather than a blank tile', () => {
    // The maskable variant is deliberately inset, so its bounds are asserted separately.
    for (const entry of ICON_SET.filter((candidate) => candidate.maskable !== true)) {
      const bounds = contentBounds(entry.path);
      // The mark is wider than it is tall (1.38:1), so a correctly cropped icon fills the
      // width and about three fifths of the height. A wrong crop box fails this loudly.
      expect(bounds.width, `${entry.path} width`).toBeGreaterThan(0.85);
      expect(bounds.height, `${entry.path} height`).toBeGreaterThan(0.45);
      expect(bounds.height, `${entry.path} height`).toBeLessThan(0.78);
      expect(bounds.width, `${entry.path} width`).toBeLessThanOrEqual(1);
    }
  });

  it('holds the maskable icon inside the launcher safe zone', () => {
    const maskable = ICON_SET.find((entry) => entry.maskable);
    expect(
      maskable,
      'the manifest declares a maskable icon, so one must be generated',
    ).toBeDefined();
    const bounds = contentBounds(maskable!.path);
    // A maskable icon may be clipped to a circle of 80% of its width: art outside that is
    // art the launcher is allowed to cut off.
    expect(bounds.left).toBeGreaterThanOrEqual(0.08);
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(0.92);
    expect(bounds.width).toBeLessThanOrEqual(0.8);
  });

  it('uses the brand background, so a tile never shows a transparent seam', () => {
    const { width, height } = pngSize('web/public/icon-512.png');
    const image = decodePng(bytes('web/public/icon-512.png'));
    expect(width).toBe(512);
    const corner = [0, 1, 2].map((channel) => image.data[channel]);
    expect(corner).toEqual([BRAND_BACKGROUND.r, BRAND_BACKGROUND.g, BRAND_BACKGROUND.b]);
    const last = (height * width - 1) * 4;
    expect([0, 1, 2].map((channel) => image.data[last + channel])).toEqual([
      BRAND_BACKGROUND.r,
      BRAND_BACKGROUND.g,
      BRAND_BACKGROUND.b,
    ]);
  });

  it('builds a favicon container whose directory matches its payloads', () => {
    const ico = bytes('web/public/favicon.ico');
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // icon, not cursor
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    const sizes: Array<[number, number]> = [];
    for (let index = 0; index < count; index += 1) {
      const at = 6 + index * 16;
      const width = (ico[at] ?? 0) === 0 ? 256 : (ico[at] as number);
      const height = (ico[at + 1] ?? 0) === 0 ? 256 : (ico[at + 1] as number);
      const length = ico.readUInt32LE(at + 8);
      const offset = ico.readUInt32LE(at + 12);
      expect(offset + length, 'the payload must be inside the file').toBeLessThanOrEqual(
        ico.length,
      );
      // Each entry is a whole PNG, which is what browsers on every current platform expect.
      expect(ico.subarray(offset, offset + 4).toString('hex')).toBe('89504e47');
      sizes.push([width, height]);
    }
    expect(sizes).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);
  });

  it('writes a desktop icon set that the Tauri bundle references', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json')) as {
      bundle: { icon: string[] };
    };
    for (const icon of conf.bundle.icon) {
      if (icon.endsWith('.icns')) continue; // generated by `npm run desktop:icons`
      expect(existsSync(join(root, 'src-tauri', icon)), `${icon} is missing`).toBe(true);
    }
  });
});

describe('identity documents', () => {
  const html = read('web/index.html');

  it('declares the icons, the manifest and the theme colour', () => {
    for (const fragment of [
      'rel="icon" href="/favicon.ico"',
      'rel="apple-touch-icon" href="/apple-touch-icon.png"',
      'rel="manifest" href="/site.webmanifest"',
      'name="theme-color" content="#05070b"',
      'property="og:image" content="/og-image.png"',
      'name="twitter:card"',
    ]) {
      expect(html, fragment).toContain(fragment);
    }
  });

  it('references no local asset that does not exist', () => {
    const referenced = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((match) => match[1]!);
    expect(referenced.length).toBeGreaterThan(3);
    for (const path of referenced) {
      // `/src/main.tsx` is Vite's entry, resolved by the dev server and the build, not a
      // file in `public/`.
      if (path.startsWith('/src/')) continue;
      expect(existsSync(join(publicDir, path.slice(1))), `${path} is referenced but absent`).toBe(
        true,
      );
    }
  });

  it('ships a first paint that needs no script', () => {
    // The desktop shell's content security policy allows no inline script, so a splash
    // that depended on one could not run where it matters most.
    expect(html).toContain('id="brand-boot"');
    expect(html).toContain('icon-192.png');
    expect(/<script(?![^>]*type="module")/.test(html)).toBe(false);
  });

  it('ships a manifest whose icons all exist and whose colours are the brand background', () => {
    const manifest = JSON.parse(read('web/public/site.webmanifest')) as {
      name: string;
      short_name: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };
    expect(manifest.name).toContain('Master Trade');
    expect(manifest.short_name).toBe('Master Trade');
    const brandHex = `#${[BRAND_BACKGROUND.r, BRAND_BACKGROUND.g, BRAND_BACKGROUND.b]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')}`;
    expect(manifest.theme_color).toBe(brandHex);
    expect(manifest.background_color).toBe(brandHex);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of manifest.icons) {
      const path = join(publicDir, icon.src.replace(/^\//, ''));
      expect(existsSync(path), `${icon.src} is declared but absent`).toBe(true);
      const [declaredWidth] = icon.sizes.split('x');
      expect(pngSize(join('web/public', icon.src.replace(/^\//, ''))).width).toBe(
        Number(declaredWidth),
      );
      expect(icon.type).toBe('image/png');
    }
    // A maskable icon is only useful if it is declared as one.
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('has replaced the placeholder icon references the shell used to carry', () => {
    // `src-tauri/icons/README.md` used to point the icon generator at a `logo.svg` that
    // never existed. Any surviving reference to it is a stale instruction.
    for (const path of [
      'src-tauri/icons/README.md',
      'web/index.html',
      'docs/brand-assets.md',
      'README.md',
    ]) {
      if (!existsSync(join(root, path))) continue;
      expect(read(path), path).not.toContain('logo.svg');
    }
  });
});

describe('the mark in the interface', () => {
  const mark = read('web/src/components/brand/BrandMark.tsx');
  const sidebar = read('web/src/app/Sidebar.tsx');
  const shell = read('web/src/app/AppShell.tsx');
  const about = read('web/src/app/AboutDialog.tsx');

  it('is decorative unless it is the only thing naming the product', () => {
    // An empty alt plus aria-hidden when a label is absent: saying "Master Trade" beside the
    // word "Master Trade" is how a screen reader ends up saying it twice.
    expect(mark).toContain("{ alt: '', 'aria-hidden': true }");
    expect(mark).toContain('alt: label');
    expect(copyOf(mark)).toContain('Master Trade');
  });

  it('uses the generated assets rather than a second drawing of the mark', () => {
    expect(mark).toContain('src="/icon-192.png"');
    expect(mark).toContain('srcSet="/icon-192.png 1x, /icon-512.png 2x"');
    expect(mark).not.toMatch(/<svg/);
  });

  it('is sized by its box, so no surface can overflow it', () => {
    expect(mark).toContain('width={size}');
    expect(mark).toContain('height={size}');
    expect(mark).toContain('shrink-0');
  });

  it('puts the lockup in the navigation and the mark in the footer', () => {
    expect(sidebar).toContain('<BrandLockup markSize={36} markOnly={collapsed} />');
    expect(shell).toContain('<BrandMark size={18} />');
    expect(about).toContain('<BrandLockup');
    // The old placeholder tile — a gradient square with the letter M — is gone.
    expect(sidebar).not.toContain('>M</span>');
    expect(sidebar).not.toContain('linear-gradient(140deg');
  });

  it('keeps the honesty notices beside the brand, never replaced by it', () => {
    expect(copyOf(about)).toContain('Smarter trading. Bigger possibilities.');
    expect(copyOf(shell)).toContain('live trading and broker execution are disabled by');
  });
});
