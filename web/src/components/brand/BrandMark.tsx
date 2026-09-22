import { cn } from '../../lib/cn';

/**
 * The Master Trade mark.
 *
 * The artwork is the *generated* app icon, not a second drawing of it: every icon is
 * derived from the one approved source by `scripts/build-brand-assets.mjs`, and the two
 * files below are that same mark at 192 and 512 pixels — so what is on screen is
 * pixel-identical to the browser tab icon and the desktop launcher icon. A hand-traced
 * SVG would drift from it the first time the source was replaced.
 *
 * The mark is decorative by default. Everywhere it appears, the product's name is written
 * next to it (`BrandLockup` does exactly that), so announcing it again would make a screen
 * reader say the name twice. Pass `label` only where the mark is the *only* thing
 * identifying the product.
 */
export interface BrandMarkProps {
  /** Rendered edge length in pixels. */
  size?: number;
  /** Accessible label. Omit when the product's name is already on screen. */
  label?: string;
  className?: string;
}

export function BrandMark({ size = 36, label, className }: BrandMarkProps) {
  return (
    <img
      src="/icon-192.png"
      // 192 for a 1x panel, 512 for a high-DPI one: the same mark, more device pixels.
      srcSet="/icon-192.png 1x, /icon-512.png 2x"
      width={size}
      height={size}
      {...(label === undefined ? { alt: '', 'aria-hidden': true } : { alt: label })}
      className={cn(
        'shrink-0 rounded-[var(--radius-control)] border border-border bg-bg select-none',
        className,
      )}
      // Never draggable: dragging a logo out of a WebView looks like the app has broken,
      // and in the desktop shell it is a navigation attempt.
      draggable={false}
    />
  );
}

/**
 * Mark plus wordmark.
 *
 * The name is live text rather than baked into an image so that it inherits the interface
 * type (including the RTL switch) and stays sharp at any zoom — the source image's
 * rendering of the wordmark is a raster and would not.
 */
export interface BrandLockupProps {
  /** Mark size. The wordmark scales with the surrounding text, not with this. */
  markSize?: number;
  /** Second line under the name. 'none' keeps only the name. */
  subtitle?: string | 'none';
  /** Hide the wordmark, keeping the mark: the collapsed navigation rail. */
  markOnly?: boolean;
  className?: string;
}

export function BrandLockup({
  markSize = 36,
  subtitle = 'Training workstation',
  markOnly = false,
  className,
}: BrandLockupProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark size={markSize} {...(markOnly ? { label: 'Master Trade' } : {})} />
      {markOnly ? null : (
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-text">Master Trade</p>
          {subtitle === 'none' ? null : (
            <p className="truncate text-caption text-text-faint">{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
}
