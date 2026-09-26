import { Badge } from '../Badge';
import { Tooltip } from '../Tooltip';
import { COMPLIANCE_EXPLANATION, COMPLIANCE_LABEL } from '../../mock/journal';
import type { RuleCompliance } from '../../mock/journal';

const TONE = {
  compliant: 'success',
  partial: 'warning',
  violation: 'danger',
  'not-assessed': 'outline',
} as const;

/**
 * Rule compliance is reported separately from the result on purpose: a profitable
 * trade can still be a rule break, and a clean loss can still be compliant. The
 * tooltip states what each state means so the badge is never read as a grade.
 */
export function RuleComplianceBadge({
  compliance,
  wrap,
}: {
  compliance: RuleCompliance;
  /** False in a table cell, where a chip is one line — see `BadgeProps.wrap`. */
  wrap?: boolean;
}) {
  return (
    <Tooltip content={COMPLIANCE_EXPLANATION[compliance]}>
      <Badge tone={TONE[compliance]} wrap={wrap}>
        {COMPLIANCE_LABEL[compliance]}
      </Badge>
    </Tooltip>
  );
}
