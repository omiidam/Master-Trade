import { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, ImageOff } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { FullscreenChartViewer } from './FullscreenChartViewer';
import { cn } from '../../lib/cn';
import { formatTimestamp } from '../../lib/format';
import { ATTACHMENT_KIND_LABEL, attachmentNote } from '../../mock/journal';
import type { AttachmentKind, TradeAttachment } from '../../mock/journal';
import { msg } from '../../i18n/index.js';

const KIND_TONE = {
  entry: 'info',
  exit: 'primary',
  markup: 'warning',
  analysis: 'ai',
} as const;

/**
 * Attachment preview.
 *
 * No image files exist in this phase, so this draws a labelled placeholder *from
 * the record* rather than shipping a stock chart screenshot that a reader would
 * reasonably take for their own trade. The placeholder is deliberately schematic:
 * it carries the attachment's kind, label and capture time, and it says it is a
 * placeholder on its face.
 */
function AttachmentPreview({
  attachment,
  height = 160,
  className,
}: {
  attachment: TradeAttachment;
  height?: number;
  className?: string;
}) {
  const tone = KIND_TONE[attachment.kind];
  return (
    <CardTile space="none" className={cn('relative overflow-hidden', className)} style={{ height }}>
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${ATTACHMENT_KIND_LABEL[attachment.kind]} placeholder for ${attachment.label}`}
        className="h-full w-full"
        style={{ direction: 'ltr' }}
      >
        <defs>
          <pattern
            id={`grid-${attachment.id}`}
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="0.6"
              opacity="0.6"
            />
          </pattern>
        </defs>
        <rect width="320" height="180" fill={`url(#grid-${attachment.id})`} />
        <path
          d="M12 132 L48 108 L76 120 L108 84 L140 96 L172 62 L204 74 L236 44 L268 56 L308 30"
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth="1.4"
          strokeDasharray="6 5"
        />
        <line
          x1="12"
          y1="146"
          x2="308"
          y2="146"
          stroke="var(--color-text-faint)"
          strokeWidth="0.6"
          strokeDasharray="3 5"
        />
        <text x="14" y="24" fill="var(--color-text-faint)" fontSize="11">
          {msg('journal.placeholderNoImageFileStored')}
        </text>
      </svg>
      <Badge tone={tone} className="absolute end-2 top-2">
        {ATTACHMENT_KIND_LABEL[attachment.kind]}
      </Badge>
    </CardTile>
  );
}

export interface ScreenshotGalleryProps {
  attachments: readonly TradeAttachment[];
  /** Used in empty and error wording so the panel is never anonymous. */
  tradeRef?: string;
  className?: string;
}

/**
 * The record's attachments.
 *
 * Thumbnails, a preview, and fullscreen viewing with previous/next so a set can be
 * compared without leaving the overlay. The gallery states plainly that it holds
 * attachment *metadata* — a preview that looks like a chart while no file exists
 * would be the easiest lie in the whole interface.
 */
export function ScreenshotGallery({ attachments, tradeRef, className }: ScreenshotGalleryProps) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  if (attachments.length === 0) {
    return (
      <EmptyState
        icon={<ImageOff size={22} aria-hidden />}
        title={msg('journal.noAttachmentsOnThisRecord')}
        description={`${
          tradeRef ? `${tradeRef} has` : 'This trade has'
        } no entry or exit screenshot attached. A record without attachments is reviewed from its numbers alone.`}
        hint={attachmentNote()}
        className={className}
      />
    );
  }

  const clamped = Math.min(index, attachments.length - 1);
  const current = attachments[clamped];
  if (current === undefined) return null;

  const step = (delta: number) =>
    setIndex((value) => (value + delta + attachments.length) % attachments.length);

  return (
    <Card as="section" aria-label={msg('journal.screenshotsAndAttachments')} className={className}>
      <CardHeader
        divider
        actions={
          <Badge tone="outline">
            {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
          </Badge>
        }
      >
        <div className="min-w-0">
          <CardTitle>{msg('journal.screenshotsAndAttachments')}</CardTitle>
          <CardDescription>{attachmentNote()}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <AttachmentPreview attachment={current} height={320} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-body text-text">{current.label}</p>
            <p className="num text-caption text-text-faint">
              {msg('journal.captured')} {formatTimestamp(current.capturedAt)} ·{' '}
              {ATTACHMENT_KIND_LABEL[current.kind]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => step(-1)}
              label={msg('screenshotGallery.previousAttachment')}
              leadingIcon={<ChevronLeft size={14} aria-hidden />}
            >
              {msg('exams.previous')}
            </Button>
            <span className="num text-caption text-text-muted">
              {clamped + 1} / {attachments.length}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => step(1)}
              label={msg('screenshotGallery.nextAttachment')}
              trailingIcon={<ChevronRight size={14} aria-hidden />}
            >
              {msg('journal.next')}
            </Button>
          </div>
        </div>

        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment, position) => (
            <li key={attachment.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-pressed={position === clamped}
                aria-label={`Show ${attachment.label}`}
                className={cn(
                  'w-[112px] overflow-hidden rounded-[var(--radius-control)] border p-0.5 text-start',
                  'transition-colors duration-[var(--duration-fast)]',
                  position === clamped
                    ? 'border-primary'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <AttachmentPreview attachment={attachment} height={62} className="rounded-[6px]" />
                <span className="mt-1 block truncate px-1 pb-1 text-caption text-text-muted">
                  {ATTACHMENT_KIND_LABEL[attachment.kind]}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <Button
          variant="subtle"
          size="sm"
          onClick={() => setOpen(true)}
          label={msg('screenshotGallery.openAttachmentFullscreen')}
          leadingIcon={<Eye size={14} aria-hidden />}
        >
          {msg('journal.viewFullscreen')}
        </Button>

        <FullscreenChartViewer
          open={open}
          onOpenChange={setOpen}
          title={`${current.label}`}
          description={attachmentNote()}
          toolbar={
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => step(-1)}
                label={msg('screenshotGallery.previousAttachment')}
                leadingIcon={<ChevronLeft size={14} aria-hidden />}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => step(1)}
                label={msg('screenshotGallery.nextAttachment')}
                trailingIcon={<ChevronRight size={14} aria-hidden />}
              >
                Next
              </Button>
            </div>
          }
          closeLabel={msg('screenshotGallery.closeFullscreenAttachment')}
          footnote={msg('screenshotGallery.pressEscapeOrUseCloseToReturnTo')}
        >
          <AttachmentPreview attachment={current} height={520} />
        </FullscreenChartViewer>
      </CardContent>
    </Card>
  );
}

export type { AttachmentKind };
