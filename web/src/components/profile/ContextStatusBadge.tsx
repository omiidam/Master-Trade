import type { ContextStatus, FactSource } from '@shared/profile/model';
import { Badge, type BadgeTone } from '../Badge';
import { Tooltip } from '../Tooltip';
import { liveLabels } from '../../i18n/index.js';

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

const STATUS_LABEL: Record<ContextStatus, string> = liveLabels({
  confirmed: 'profile.status.confirmed',
  derived: 'profile.status.derived',
  stale: 'profile.status.stale',
  assumed: 'profile.status.assumed',
  missing: 'profile.status.missing',
});

const STATUS_EXPLANATION: Record<ContextStatus, string> = liveLabels({
  confirmed: 'profile.status2.confirmed',
  derived: 'profile.status2.derived',
  stale: 'profile.status2.stale',
  assumed: 'profile.status2.assumed',
  missing: 'profile.status2.missing',
});

export function ContextStatusBadge({ status }: { status: ContextStatus }) {
  return (
    <Tooltip content={STATUS_EXPLANATION[status]}>
      <Badge tone={STATUS_TONE[status]} dot aria-label={`Status: ${STATUS_LABEL[status]}`}>
        {STATUS_LABEL[status]}
      </Badge>
    </Tooltip>
  );
}

const SOURCE_LABEL: Record<FactSource, string> = liveLabels({
  'user-stated': 'profile.source.user-stated',
  derived: 'profile.source.derived',
  assumed: 'profile.source.assumed',
});

export function FactSourceBadge({ source }: { source: FactSource }) {
  return (
    <Badge tone={source === 'user-stated' ? 'outline' : 'neutral'}>{SOURCE_LABEL[source]}</Badge>
  );
}

export { STATUS_LABEL, STATUS_EXPLANATION, SOURCE_LABEL };
