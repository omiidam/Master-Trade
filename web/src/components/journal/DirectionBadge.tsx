import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Badge } from '../Badge';
import { Tooltip } from '../Tooltip';
import { DIRECTION_LABEL } from '../../mock/journal';
import type { TradeDirection } from '../../mock/journal';

const TONE = { long: 'success', short: 'danger' } as const;

/**
 * Long and short are rendered as a direction, never as a recommendation. The
 * label states the direction of the recorded trade and nothing about the next one.
 */
export function DirectionBadge({ direction }: { direction: TradeDirection }) {
  const Icon = direction === 'long' ? ArrowUpRight : ArrowDownRight;
  return (
    <Tooltip content={`Recorded direction: ${DIRECTION_LABEL[direction]}`}>
      <Badge tone={TONE[direction]} icon={<Icon size={11} aria-hidden />}>
        {DIRECTION_LABEL[direction]}
      </Badge>
    </Tooltip>
  );
}
