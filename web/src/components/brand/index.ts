/**
 * Brand marks (Phase 5.8).
 *
 * Two components, because there are two jobs: `BrandMark` where only the mark fits
 * (collapsed rail, favicon-scale surfaces) and `BrandLockup` where the name fits too.
 * Both render generated assets — see `docs/brand-assets.md` — so the interface, the
 * browser tab and the desktop launcher cannot show three different logos.
 */

export { BrandLockup, BrandMark } from './BrandMark';
export type { BrandLockupProps, BrandMarkProps } from './BrandMark';
