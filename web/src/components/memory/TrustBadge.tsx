import { BadgeCheck, CircleAlert, CircleHelp, Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '../Badge';
import { Tooltip } from '../Tooltip';
import {
  MEMORY_STATUS_EXPLANATION,
  MEMORY_STATUS_LABEL,
  type MemoryStatus,
} from '../../mock/memory';

const TONE: Record<MemoryStatus, BadgeTone> = {
  verified: 'primary',
  'pending-review': 'warning',
  unverified: 'ai',
  archived: 'outline',
};

const ICON: Record<MemoryStatus, ReactNode> = {
  verified: <BadgeCheck size={12} aria-hidden />,
  'pending-review': <CircleHelp size={12} aria-hidden />,
  unverified: <CircleAlert size={12} aria-hidden />,
  archived: <Archive size={12} aria-hidden />,
};

export interface TrustBadgeProps {
  status: MemoryStatus;
  /** `dot` for dense lists, `icon` where there is room for the glyph. */
  variant?: 'dot' | 'icon';
  className?: string;
  /** Overrides the default label — used where the row already states the trust. */
  label?: string;
}

/**
 * Trust state of a knowledge record.
 *
 * The four states are the product's honesty mechanism: a reader can always tell
 * whether something was checked, is waiting to be checked, was never checked, or
 * has been tombstoned. The tooltip text comes from one shared table so the badge
 * and the explanation cannot drift apart.
 */
export function TrustBadge({ status, variant = 'icon', className, label }: TrustBadgeProps) {
  return (
    <Tooltip content={MEMORY_STATUS_EXPLANATION[status]}>
      <Badge
        tone={TONE[status]}
        {...(variant === 'icon' ? { icon: ICON[status] } : { dot: status !== 'archived' })}
        className={className}
      >
        {label ?? MEMORY_STATUS_LABEL[status]}
      </Badge>
    </Tooltip>
  );
}
