import { CircleDashed, ShieldAlert } from 'lucide-react';
import type { AssumptionNotice as AssumptionNoticeView } from '@shared/quality/readiness';
import { Badge } from '../Badge';
import { Card } from '../Card';
import { cn } from '../../lib/cn';
import { inputLabel } from './labels';

/**
 * One substitution the analysis would have to make, stated before it is made.
 *
 * The distinction this component exists to keep is **who decided**. A `user-premise` is
 * the user saying "treat this as X for this question" — a declaration, permitted, and
 * the only route to a labelled hypothetical. A `system` origin is the system substituting
 * its own value, which is exactly what the product rules forbid: it is rendered as
 * refused, with the reason, so it can never read as an accepted premise.
 *
 * `permitted` is shown rather than inferred from `origin`, because the two are separate
 * facts in the contract and a UI that derived one from the other would be making a policy
 * decision in a component.
 */

const ORIGIN_LABEL: Readonly<Record<AssumptionNoticeView['origin'], string>> = {
  'user-premise': 'You declared this premise',
  system: 'System substitution — refused',
};

export interface AssumptionNoticeProps {
  notice: AssumptionNoticeView;
  className?: string;
}

export function AssumptionNotice({ notice, className }: AssumptionNoticeProps) {
  const refused = !notice.permitted;

  return (
    <Card
      as="article"
      tone={refused ? 'default' : 'sunken'}
      emphasis={refused ? 'danger' : 'none'}
      wash={refused}
      className={cn('space-y-2 p-3', className)}
      aria-label={`Assumption: ${inputLabel(notice.field)}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {refused ? (
          <ShieldAlert size={14} aria-hidden className="text-danger" />
        ) : (
          <CircleDashed size={14} aria-hidden className="text-text-muted" />
        )}
        <span className="text-body font-medium text-text">{notice.label}</span>
        <Badge tone={refused ? 'danger' : 'warning'}>{ORIGIN_LABEL[notice.origin]}</Badge>
        <Badge tone={refused ? 'outline' : 'info'}>
          {notice.permitted ? 'Permitted, and labelled' : 'Not permitted'}
        </Badge>
      </div>

      <p className="text-body text-text-muted">{notice.statement}</p>
      <p className="text-caption text-text-faint">{notice.reason}</p>
    </Card>
  );
}
