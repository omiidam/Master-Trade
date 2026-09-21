import type { ContextStatus, FactSource } from '@shared/profile/model';
import { Badge, type BadgeTone } from '../Badge';
import { Tooltip } from '../Tooltip';

/**
 * The badge that keeps facts and assumptions visibly apart.
 *
 * This is the surface half of the rule that the system must distinguish confirmed user
 * input from derived values, assumptions, missing information and stale information. It
 * is deliberately blunt: an assumed value never renders in the same tone as a confirmed
 * one, because a user who cannot tell them apart will treat a guess as a statement.
 */

const STATUS_TONE: Record<ContextStatus, BadgeTone> = {
  confirmed: 'success',
  derived: 'info',
  stale: 'warning',
  assumed: 'outline',
  missing: 'neutral',
};

const STATUS_LABEL: Record<ContextStatus, string> = {
  confirmed: 'Confirmed',
  derived: 'Derived',
  stale: 'May be outdated',
  assumed: 'Assumed',
  missing: 'Missing',
};

const STATUS_EXPLANATION: Record<ContextStatus, string> = {
  confirmed: 'You told us this, and it is inside its freshness window.',
  derived: 'Computed from other values you gave us, not stated directly.',
  stale: 'You told us this, but it has aged past its freshness window for this kind of input.',
  assumed: 'Not provided by you. It may be used only as an assumption, never as a fact.',
  missing: 'Not provided. The system will ask rather than fill it in.',
};

export function ContextStatusBadge({ status }: { status: ContextStatus }) {
  return (
    <Tooltip content={STATUS_EXPLANATION[status]}>
      <Badge tone={STATUS_TONE[status]} dot aria-label={`Status: ${STATUS_LABEL[status]}`}>
        {STATUS_LABEL[status]}
      </Badge>
    </Tooltip>
  );
}

const SOURCE_LABEL: Record<FactSource, string> = {
  'user-stated': 'You stated this',
  derived: 'Computed from what you stated',
  assumed: 'Not stated — assumption only',
};

export function FactSourceBadge({ source }: { source: FactSource }) {
  return (
    <Badge tone={source === 'user-stated' ? 'outline' : 'neutral'}>{SOURCE_LABEL[source]}</Badge>
  );
}

export { STATUS_LABEL, STATUS_EXPLANATION, SOURCE_LABEL };
