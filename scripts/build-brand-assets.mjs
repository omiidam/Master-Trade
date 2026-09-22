#!/usr/bin/env node
/**
 * Brand asset generation.
 *
 * Every icon the product ships — favicon, apple-touch icon, PWA manifest icons,
 * desktop launcher icons, the Open Graph card — is derived from one approved source
 * image, here, by this script. Nothing is hand-exported and nothing is duplicated:
 * `assets/brand/master-trade-logo-source.png` is the single source of truth, and
 * re-running this file after replacing it regenerates the whole set.
 *
 * Why a codec instead of a dependency: an image toolchain is a large, platform-specific
 * dependency to add to a project that otherwise has none, for a job that runs a handful
 * of times per year. The subset below is deliberately narrow — 8-bit RGB/RGBA,
 * non-interlaced PNG in and out, box-average downscaling, PNG-in-ICO — and it fails loudly
 * on anything outside that subset rather than producing a wrong image.
 *
 * The composition rule is fixed and stated in `docs/brand-assets.md`: every icon is the
 * compact mark centred on the brand background, cropped to the mark's own bounding box
 * and faded at the edges by a radial alpha vignette so the source photograph's environment
 * does not read as a rectangle. The full lockup (mark + wordmark + tagline) is used only
 * where there is room to read it: the Open Graph card.
 *
 * Usage:
 *   npm run brand:assets          # write the whole set
 *   node scripts/build-brand-assets.mjs --probe   # measure the source, write nothing
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'assets', 'brand', 'master-trade-logo-source.png');

/** Flat brand background. The same value as `theme-color` and the app's `--color-bg`. */
export const BRAND_BACKGROUND = { r: 5, g: 7, b: 11 };

/* ────────────────────────────────────────────────────────────────────────────
 * PNG decoding
 * ──────────────────────────────────────────────────────────────────────────── */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG into `{ width, height, data }` with 4 bytes per pixel (RGBA).
 *
 * Supports what the source is and what we write: 8-bit, non-interlaced, colour type 2
 * (RGB) or 6 (RGBA). Anything else throws with the exact reason, because a silent
 * mis-decode would ship a wrong logo.
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG: the 8-byte signature does not match');
  }
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        compression: body[10],
        filter: body[11],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (header === null) throw new Error('PNG has no IHDR chunk');
  if (header.bitDepth !== 8) throw new Error(`unsupported bit depth ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error('interlaced PNGs are not supported');
  if (header.colorType !== 2 && header.colorType !== 6) {
    throw new Error(`unsupported colour type ${header.colorType} (expected 2 or 6)`);
  }
  const channels = header.colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = header.width * channels;
  if (raw.length < header.height * (stride + 1)) {
    throw new Error('IDAT is shorter than the declared image size');
  }

  const data = new Uint8Array(header.width * header.height * 4);
  let previous = new Uint8Array(stride);
  let cursor = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filterType = raw[cursor];
    cursor += 1;
    const line = new Uint8Array(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      switch (filterType) {
        case 0:
          break;
        case 1:
          line[i] = (line[i] + left) & 0xff;
          break;
        case 2:
          line[i] = (line[i] + up) & 0xff;
          break;
        case 3:
          line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          line[i] = (line[i] + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`unknown scanline filter ${filterType} on row ${y}`);
      }
    }
    for (let x = 0; x < header.width; x += 1) {
      const src = x * channels;
      const dst = (y * header.width + x) * 4;
      data[dst] = line[src];
      data[dst + 1] = line[src + 1];
      data[dst + 2] = line[src + 2];
      data[dst + 3] = channels === 4 ? line[src + 3] : 255;
    }
    previous = line;
  }
  return { width: header.width, height: header.height, data };
}

/* ────────────────────────────────────────────────────────────────────────────
 * PNG encoding (RGBA, no interlacing)
 * ──────────────────────────────────────────────────────────────────────────── */

function chunk(type, body) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, 'ascii');
  const crcTable = chunk.crcTable ?? (chunk.crcTable = buildCrcTable());
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([Buffer.from(type, 'ascii'), body])) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([header, body, trailer]);
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    // Filter 1 (Sub) on every row: cheap, and it compresses icon-style art well.
    raw[y * (stride + 1)] = 1;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const at = y * (stride + 1) + 1 + x * 4;
      raw[at] = (data[i] - (x > 0 ? data[i - 4] : 0)) & 0xff;
      raw[at + 1] = (data[i + 1] - (x > 0 ? data[i - 3] : 0)) & 0xff;
      raw[at + 2] = (data[i + 2] - (x > 0 ? data[i - 2] : 0)) & 0xff;
      raw[at + 3] = (data[i + 3] - (x > 0 ? data[i - 1] : 0)) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Geometry
 * ──────────────────────────────────────────────────────────────────────────── */

/** A rectangular region of a decoded image. */
export function crop(image, box) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((box.y0 + y) * image.width + box.x0) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}

/**
 * Box-average downscale.
 *
 * Averaging every source pixel that falls in a destination pixel — rather than sampling
 * a neighbourhood around it — is what keeps a 1254 px logo readable at 16 px: thin bright
 * strokes keep their energy instead of dropping out between samples.
 */
export function scale(image, outWidth, outHeight) {
  const { width, height, data } = image;
  const out = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const y0 = Math.floor((y * height) / outHeight);
    const y1 = Math.max(y0 + 1, Math.ceil(((y + 1) * height) / outHeight));
    for (let x = 0; x < outWidth; x += 1) {
      const x0 = Math.floor((x * width) / outWidth);
      const x1 = Math.max(x0 + 1, Math.ceil(((x + 1) * width) / outWidth));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y0; sy < y1 && sy < height; sy += 1) {
        for (let sx = x0; sx < x1 && sx < width; sx += 1) {
          const i = (sy * width + sx) * 4;
          const alpha = data[i + 3] / 255;
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += alpha;
          count += 1;
        }
      }
      const at = (y * outWidth + x) * 4;
      if (count === 0 || a === 0) continue;
      out[at] = Math.round(r / a);
      out[at + 1] = Math.round(g / a);
      out[at + 2] = Math.round(b / a);
      out[at + 3] = Math.round((a / count) * 255);
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}

/**
 * Composite `top` onto a solid background at (left, top), with a radial alpha fade.
 *
 * `fade` exists because the source is a rendered image with an environment: without it the
 * crop would appear as a visible rectangle against the flat brand background, because the
 * photograph's own vignette is not quite `BRAND_BACKGROUND`. The radius is measured in
 * *canvas* units — normalised against the canvas centre — rather than in source pixels, so
 * the falloff is a circle on the finished square icon regardless of the crop's aspect
 * ratio. `fade: null` keeps the crop exactly as decoded.
 */
export function composite(background, top, left, top_, fade = null) {
  const out = { width: background.width, height: background.height, data: background.data.slice() };
  const half = Math.min(out.width, out.height) / 2;
  const centreX = out.width / 2;
  const centreY = out.height / 2;
  for (let y = 0; y < top.height; y += 1) {
    for (let x = 0; x < top.width; x += 1) {
      const dx = left + x;
      const dy = top_ + y;
      if (dx < 0 || dy < 0 || dx >= out.width || dy >= out.height) continue;
      const src = (y * top.width + x) * 4;
      let alpha = top.data[src + 3] / 255;
      if (fade !== null) {
        const radius = Math.hypot(dx + 0.5 - centreX, dy + 0.5 - centreY) / half;
        if (radius >= fade.outer) continue;
        if (radius > fade.inner) {
          alpha *= 1 - (radius - fade.inner) / (fade.outer - fade.inner);
        }
      }
      if (alpha <= 0) continue;
      const dst = (dy * out.width + dx) * 4;
      out.data[dst] = Math.round(top.data[src] * alpha + out.data[dst] * (1 - alpha));
      out.data[dst + 1] = Math.round(top.data[src + 1] * alpha + out.data[dst + 1] * (1 - alpha));
      out.data[dst + 2] = Math.round(top.data[src + 2] * alpha + out.data[dst + 2] * (1 - alpha));
      out.data[dst + 3] = 255;
    }
  }
  return out;
}

export function solid(width, height, colour) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = colour.r;
    data[i + 1] = colour.g;
    data[i + 2] = colour.b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** Fit `image` inside `boxWidth`×`boxHeight`, preserving aspect ratio. */
export function fit(image, boxWidth, boxHeight) {
  const ratio = Math.min(boxWidth / image.width, boxHeight / image.height);
  return scale(
    image,
    Math.max(1, Math.round(image.width * ratio)),
    Math.max(1, Math.round(image.height * ratio)),
  );
}

/** Centre `image` on a `width`×`height` brand background, optionally faded. */
export function tile(image, width, height, { inset = 0, fade = null } = {}) {
  const inner = fit(image, width - inset * 2, height - inset * 2);
  return composite(
    solid(width, height, BRAND_BACKGROUND),
    inner,
    Math.round((width - inner.width) / 2),
    Math.round((height - inner.height) / 2),
    fade,
  );
}

/**
 * The one fade every icon uses.
 *
 * `inner` is where the falloff starts, `outer` where the art is fully gone — both as a
 * multiple of the half-canvas. The mark is wider than it is tall, so its left and right
 * tips sit near radius 1.0: the falloff starts at 1.2 to soften the crop's edges into the
 * brand background without touching the mark itself.
 */
export const ICON_FADE = { inner: 1.2, outer: 1.6 };

/* ────────────────────────────────────────────────────────────────────────────
 * ICO (PNG-in-ICO, Vista and later)
 * ──────────────────────────────────────────────────────────────────────────── */

export function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const directory = Buffer.alloc(16 * count);
  const payloads = [];
  let offset = 6 + 16 * count;
  images.forEach((image, index) => {
    const png = encodePng(image);
    const at = index * 16;
    // 256 is written as 0 in the ICO directory, by specification.
    directory[at] = image.width >= 256 ? 0 : image.width;
    directory[at + 1] = image.height >= 256 ? 0 : image.height;
    directory[at + 2] = 0; // palette size
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(png.length, at + 8); // bytes of the PNG payload
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
    payloads.push(png);
  });
  return Buffer.concat([header, directory, ...payloads]);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The source, and the boxes cut out of it
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Regions of the approved source, as fractions of its width and height.
 *
 * Expressed as fractions so the boxes survive a re-export at a different resolution, and
 * declared here so they are reviewable: `--probe` measures the source against them, and
 * `tests/brand.test.ts` fails if the mark box ever stops containing the bright pixels the
 * mark is made of.
 */
export const SOURCE_BOXES = {
  /**
   * The compact MT mark alone: no wordmark, no tagline. Used for every icon. Measured
   * extent is x 354–935, y 232–652; these are those bounds plus a ~2% margin so the
   * mark's own anti-aliased edge is not clipped.
   */
  mark: { x0: 0.263, y0: 0.166, x1: 0.765, y1: 0.539 },
  /**
   * The full lockup: mark, MASTER TRADE wordmark and the tagline. Used for OG cards.
   * The mark's column bounds are reused, and the box is extended down to include the
   * tagline (measured to end at y 996).
   */
  lockup: { x0: 0.16, y0: 0.166, x1: 0.83, y1: 0.81 },
};

/**
 * Bounding box of the mark, found by measurement rather than by eye.
 *
 * The mark is the only saturated (blue/teal) region of the source and the only bright
 * region that is not the studio glow along the left edge or the wordmark below it, so it
 * can be located exactly. `--measure` prints this, and `tests/brand.test.ts` asserts the
 * declared box contains it.
 */
export function measureMarkBox(image) {
  let x0 = image.width;
  let y0 = image.height;
  let x1 = 0;
  let y1 = 0;
  // The mark is the topmost object: the source's own vertical profile puts a clear gap
  // between it and the wordmark, and the band ends inside that gap.
  const bandLimit = Math.round(image.height * 0.55);
  for (let y = 0; y < bandLimit; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (x < image.width * 0.24) continue; // the source's studio glow lives here
      const i = (y * image.width + x) * 4;
      const max = Math.max(image.data[i], image.data[i + 1], image.data[i + 2]);
      const min = Math.min(image.data[i], image.data[i + 1], image.data[i + 2]);
      const saturation = (max - min) / 255;
      const luminance =
        (0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2]) / 255;
      if (saturation > 0.25 || luminance > 0.4) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return {
    x0: x0 / image.width,
    y0: y0 / image.height,
    x1: (x1 + 1) / image.width,
    y1: (y1 + 1) / image.height,
  };
}

/** Whether `outer` contains every edge of `inner`, with `margin` of slack. */
export function boxContains(outer, inner, margin = 0) {
  return (
    outer.x0 <= inner.x0 + margin &&
    outer.y0 <= inner.y0 + margin &&
    outer.x1 >= inner.x1 - margin &&
    outer.y1 >= inner.y1 - margin
  );
}

function boxToPixels(image, box) {
  return {
    x0: Math.round(box.x0 * image.width),
    y0: Math.round(box.y0 * image.height),
    x1: Math.round(box.x1 * image.width),
    y1: Math.round(box.y1 * image.height),
  };
}

/** Mean luminance of a box, as 0–1. Used by the probe and by the brand test. */
export function meanLuminance(image, box) {
  const pixels = boxToPixels(image, box);
  let total = 0;
  let count = 0;
  for (let y = pixels.y0; y < pixels.y1; y += 1) {
    for (let x = pixels.x0; x < pixels.x1; x += 1) {
      const i = (y * image.width + x) * 4;
      total +=
        (0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2]) / 255;
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

/** Dimension and shape sanity: an icon that is not square is not an icon. */
export function assertSquare(image, label) {
  if (image.width !== image.height) {
    throw new Error(`${label} must be square, got ${image.width}×${image.height}`);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The set
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every icon: size in pixels, where it is written, and what it is for. */
export const ICON_SET = [
  { size: 16, path: 'web/public/favicon-16.png', purpose: 'browser tab, small' },
  { size: 32, path: 'web/public/favicon-32.png', purpose: 'browser tab, standard' },
  { size: 48, path: 'web/public/favicon-48.png', purpose: 'browser tab, high-DPI and ICO' },
  { size: 180, path: 'web/public/apple-touch-icon.png', purpose: 'iOS home screen' },
  { size: 192, path: 'web/public/icon-192.png', purpose: 'PWA manifest, any' },
  { size: 512, path: 'web/public/icon-512.png', purpose: 'PWA manifest, any' },
  {
    size: 512,
    path: 'web/public/icon-maskable-512.png',
    purpose: 'PWA manifest, maskable (safe zone honoured)',
    maskable: true,
  },
  { size: 32, path: 'src-tauri/icons/32x32.png', purpose: 'desktop launcher' },
  { size: 128, path: 'src-tauri/icons/128x128.png', purpose: 'desktop launcher' },
  { size: 256, path: 'src-tauri/icons/128x128@2x.png', purpose: 'desktop launcher, high-DPI' },
  { size: 512, path: 'src-tauri/icons/icon.png', purpose: 'desktop bundle source icon' },
];

export function buildAssets(source) {
  const mark = crop(source, boxToPixels(source, SOURCE_BOXES.mark));
  const lockup = crop(source, boxToPixels(source, SOURCE_BOXES.lockup));
  const assets = [];

  for (const entry of ICON_SET) {
    // The wordmark is unreadable at icon sizes, so icons use the mark; maskable icons
    // hold the mark inside the 80% safe zone so a launcher mask cannot clip it.
    const inset = entry.maskable ? Math.round(entry.size * 0.1) : 0;
    const image = tile(mark, entry.size, entry.size, { inset, fade: ICON_FADE });
    assertSquare(image, entry.path);
    assets.push({ path: entry.path, image, purpose: entry.purpose });
  }

  assets.push({
    path: 'web/public/favicon.ico',
    image: buildIco([16, 32, 48].map((size) => tile(mark, size, size, { fade: ICON_FADE }))),
    purpose: 'favicon container: 16, 32 and 48 px',
  });

  assets.push({
    path: 'src-tauri/icons/icon.ico',
    image: buildIco(
      [16, 32, 48, 64, 256].map((size) => tile(mark, size, size, { fade: ICON_FADE })),
    ),
    purpose: 'Windows desktop icon: 16–256 px',
  });

  // The Open Graph card is the one surface with room for the full lockup: mark, wordmark
  // and tagline, centred. The lockup is very nearly square, so the card is a centred
  // logo on the brand background rather than a logo competing with copy.
  const card = solid(1200, 630, BRAND_BACKGROUND);
  const placed = fit(lockup, 560, 560);
  assets.push({
    path: 'web/public/og-image.png',
    image: composite(
      card,
      placed,
      Math.round((card.width - placed.width) / 2),
      Math.round((card.height - placed.height) / 2),
    ),
    purpose: 'link preview card, 1200×630',
  });

  return assets;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Entry point
 * ──────────────────────────────────────────────────────────────────────────── */

function probe(source) {
  const step = Math.ceil(source.width / 76);
  const lines = [];
  for (let y = 0; y < source.height; y += step * 2) {
    let row = '';
    for (let x = 0; x < source.width; x += step) {
      const i = (y * source.width + x) * 4;
      const l =
        (0.2126 * source.data[i] + 0.7152 * source.data[i + 1] + 0.0722 * source.data[i + 2]) / 255;
      const saturation =
        (Math.max(source.data[i], source.data[i + 1], source.data[i + 2]) -
          Math.min(source.data[i], source.data[i + 1], source.data[i + 2])) /
        255;
      const character =
        saturation > 0.35 ? '#' : l > 0.55 ? '@' : l > 0.34 ? '+' : l > 0.18 ? '.' : ' ';
      row += character;
    }
    lines.push(`${String(y).padStart(4)}|${row}`);
  }
  console.log(
    `source: ${source.width}×${source.height}, mark box ${JSON.stringify(SOURCE_BOXES.mark)}`,
  );
  console.log(
    `mean luminance inside the mark box: ${meanLuminance(source, SOURCE_BOXES.mark).toFixed(3)}`,
  );
  console.log(
    `mean luminance of the whole source: ${meanLuminance(source, { x0: 0, y0: 0, x1: 1, y1: 1 }).toFixed(3)}`,
  );
  console.log(lines.join('\n'));
  console.log(
    `# = saturated (the blue/teal of the mark)   @ bright   + mid   . dark   ' ' near-black`,
  );
  const measured = measureMarkBox(source);
  const asPixels = (box) =>
    `x ${Math.round(box.x0 * source.width)}–${Math.round(box.x1 * source.width)}, y ${Math.round(box.y0 * source.height)}–${Math.round(box.y1 * source.height)}`;
  console.log(`\nmeasured mark box: ${asPixels(measured)}`);
  console.log(`declared mark box: ${asPixels(SOURCE_BOXES.mark)}`);
  console.log(
    `declared box contains the measured mark: ${boxContains(SOURCE_BOXES.mark, measured)}`,
  );
}

export function readSource() {
  if (!existsSync(SOURCE)) {
    throw new Error(
      [
        'the brand source image is missing:',
        `  ${SOURCE}`,
        'Place the approved Master Trade logo there (PNG, 8-bit, 1000×1000 or larger).',
      ].join('\n'),
    );
  }
  return decodePng(readFileSync(SOURCE));
}

function main() {
  if (process.argv.includes('--probe') || process.argv.includes('--measure'))
    return probe(readSource());

  const source = readSource();
  const assets = buildAssets(source);
  console.log(`Master Trade — brand assets from ${SOURCE}`);
  console.log(`  source: ${source.width}×${source.height}`);
  for (const asset of assets) {
    const target = join(root, asset.path);
    mkdirSync(dirname(target), { recursive: true });
    const bytes = Buffer.isBuffer(asset.image) ? asset.image : encodePng(asset.image);
    writeFileSync(target, bytes);
    const described = Buffer.isBuffer(asset.image)
      ? `${bytes.length} B`
      : `${asset.image.width}×${asset.image.height}`;
    console.log(`  ${asset.path.padEnd(38)} ${described.padStart(11)}  ${asset.purpose}`);
  }
  console.log(
    `\n  ${assets.length} file(s) written from one source. Nothing here is hand-exported.`,
  );
}

// Only run when invoked directly: the tests import the functions above.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`master-trade: ${error.message}`);
    process.exitCode = 1;
  }
}
