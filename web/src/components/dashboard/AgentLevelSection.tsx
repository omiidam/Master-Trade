/**
 * Agent level — the identity figure of the overview.
 *
 * The level is the curriculum's own stage, not a score, so the plate states the stage and puts
 * the evidence beside it (how many recorded attempts produced it). When there is no level there
 * is no zero to show instead: the plate says nothing is recorded yet and offers the way to start.
 */

import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { MetricPlate } from './MetricPlate';
import { SectionLink } from './SectionLink';
import { msg } from '../../i18n/index.js';

export interface AgentLevelSectionProps {
  /** The server's derivation, or `null` when the account has no progress at all. */
  level: string | null;
  /** Recorded attempts behind the figure — the plate's evidence line. */
  attempts: number;
  /** Whether a course is in progress, which is what the module marker reports. */
  inCourse: boolean;
  onOpenAcademy: () => void;
}

export function AgentLevelSection({
  level,
  attempts,
  inCourse,
  onOpenAcademy,
}: AgentLevelSectionProps) {
  const attemptsWord =
    attempts === 1 ? msg('dashboard.attemptsOne') : msg('dashboard.attemptsMany');

  return (
    <MetricPlate
      label={msg('dashboard.agentLevel')}
      badge={inCourse ? <Badge tone="primary">{msg('dashboard.module')}</Badge> : null}
      value={level === null ? undefined : <span className="text-metric text-text">{level}</span>}
      detail={
        level === null ? undefined : (
          <>
            <span className="num">{attempts}</span> {attemptsWord}{' '}
            {msg('dashboard.basedOnAttempts')}
          </>
        )
      }
      empty={
        <EmptyState
          title={msg('dashboard.nothingYet')}
          description={msg('dashboard.noProgressRecordedYet')}
        />
      }
      note={msg('dashboard.levelIsTheCurriculumStage')}
      interactive
      action={<SectionLink label={msg('dashboard.openAcademy')} onOpen={onOpenAcademy} />}
    />
  );
}
