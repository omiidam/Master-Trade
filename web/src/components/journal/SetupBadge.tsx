import { Boxes, Layers, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../Badge';
import { Tooltip } from '../Tooltip';
import { SETUP_FAMILY_LABEL, setupById, setupLabel } from '../../mock/journal';
import type { SetupFamily } from '../../mock/journal';

const FAMILY_TONE = {
  continuation: 'info',
  reversal: 'warning',
  range: 'ai',
} as const;

const FAMILY_ICON: Record<SetupFamily, ReactNode> = {
  continuation: <Layers size={11} aria-hidden />,
  reversal: <RotateCcw size={11} aria-hidden />,
  range: <Boxes size={11} aria-hidden />,
};

/**
 * The setup is the journal's most important dimension: a result without the setup
 * that produced it cannot be reviewed, and two losses from different setups are
 * not the same evidence. The badge always carries the setup *premise* in its
 * tooltip, so the label cannot drift away from what the setup actually means.
 */
export function SetupBadge({
  setupId,
  wrap,
}: {
  setupId: string;
  /** False in a table cell, where a chip is one line — see `BadgeProps.wrap`. */
  wrap?: boolean;
}) {
  const setup = setupById(setupId);
  const label = setup ? setup.label : setupLabel(setupId);
  if (!setup) {
    return (
      <Badge tone="outline" icon={<Layers size={11} aria-hidden />} wrap={wrap}>
        {label}
      </Badge>
    );
  }
  return (
    <Tooltip content={`${SETUP_FAMILY_LABEL[setup.family]} — ${setup.premise}`}>
      <Badge tone={FAMILY_TONE[setup.family]} icon={FAMILY_ICON[setup.family]} wrap={wrap}>
        {label}
      </Badge>
    </Tooltip>
  );
}
