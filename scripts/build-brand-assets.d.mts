/**
 * Types for `build-brand-assets.mjs`.
 *
 * The generator is plain JavaScript so that `npm run brand:assets` works on a checkout with
 * no build step; this declaration is what lets `tests/brand.test.ts` import it under the
 * project's strict TypeScript settings instead of falling back to `any`. It is the surface,
 * not a copy of the implementation: if a signature here disagrees with the script, the test
 * that calls it fails rather than silently type-checking against a fiction.
 */

/** An RGBA image: 4 bytes per pixel, row-major. */
export interface BrandImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** An axis-aligned region, in pixels. */
export interface BrandBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A region expressed as fractions of the image, so it survives a re-export at another size. */
export interface FractionalBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Radial alpha falloff, as a multiple of the half-canvas. */
export interface BrandFade {
  inner: number;
  outer: number;
}

export interface BrandColor {
  r: number;
  g: number;
  b: number;
}

export interface IconEntry {
  size: number;
  path: string;
  purpose: string;
  maskable?: boolean;
}

export interface BrandAsset {
  path: string;
  image: BrandImage | Buffer;
  purpose: string;
}

export declare const BRAND_BACKGROUND: BrandColor;
export declare const ICON_FADE: BrandFade;
export declare const SOURCE_BOXES: { mark: FractionalBox; lockup: FractionalBox };
export declare const ICON_SET: IconEntry[];
export declare const BRAND_SOURCE: string;

export declare function decodePng(buffer: Buffer): BrandImage;
export declare function encodePng(image: BrandImage): Buffer;
export declare function crop(image: BrandImage, box: BrandBox): BrandImage;
export declare function scale(image: BrandImage, outWidth: number, outHeight: number): BrandImage;
export declare function composite(
  background: BrandImage,
  top: BrandImage,
  left: number,
  top_: number,
  fade?: BrandFade | null,
): BrandImage;
export declare function solid(width: number, height: number, colour: BrandColor): BrandImage;
export declare function fit(image: BrandImage, boxWidth: number, boxHeight: number): BrandImage;
export declare function tile(
  image: BrandImage,
  width: number,
  height: number,
  options?: { inset?: number; fade?: BrandFade | null },
): BrandImage;
export declare function buildIco(images: BrandImage[]): Buffer;
export declare function measureMarkBox(image: BrandImage): FractionalBox;
export declare function boxContains(
  outer: FractionalBox,
  inner: FractionalBox,
  margin?: number,
): boolean;
export declare function meanLuminance(image: BrandImage, box: FractionalBox): number;
export declare function assertSquare(image: BrandImage, label: string): void;
export declare function buildAssets(source: BrandImage): BrandAsset[];
export declare function readSource(): BrandImage;
