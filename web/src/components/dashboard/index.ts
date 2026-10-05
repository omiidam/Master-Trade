/**
 * The dashboard component family (Phase 9.3.1).
 *
 * One surface's worth of cards, kept together the way `journal/`, `portfolio/` and `decisions/`
 * keep theirs. Three rules hold for everything in here.
 *
 *   - **A component renders what it is given.** No fetching, no derivation, no formatting of a
 *     figure the server already formatted — a number computed here would be a second opinion
 *     about it.
 *   - **The states are the component's business.** Every section draws its own empty case, so a
 *     page cannot forget one and an empty section cannot be mistaken for a broken one.
 *   - **The band is the page's business.** Nothing here renders a `Grid` or a `Section`: a page
 *     owns its own layout and its own width, and a card that decided either would be taking the
 *     frame's decision away from it.
 *
 * The sections are separately importable, so a later surface (an academy summary, a learner
 * view) can use one without the other seven, and each is a different card form on purpose — a
 * roster of bars, a ranked list, a timeline, a KPI plate, a featured panel.
 */

export { MetricPlate } from './MetricPlate';
export type { MetricPlateProps } from './MetricPlate';

export { SectionLink } from './SectionLink';
export type { SectionLinkProps } from './SectionLink';

export { DomainMasteryBars } from './DomainMasteryBars';
export type { DomainMasteryBarsProps } from './DomainMasteryBars';

export { RankedDomainList } from './RankedDomainList';
export type { RankedDomainListProps } from './RankedDomainList';

export { AgentLevelSection } from './AgentLevelSection';
export type { AgentLevelSectionProps } from './AgentLevelSection';

export { StreakSection } from './StreakSection';
export type { StreakSectionProps } from './StreakSection';

export { ExamScoreSection } from './ExamScoreSection';
export type { ExamScoreSectionProps } from './ExamScoreSection';

export { KnowledgeMasterySection } from './KnowledgeMasterySection';
export type { KnowledgeMasterySectionProps } from './KnowledgeMasterySection';

export { CourseLessonSection } from './CourseLessonSection';
export type { CourseLessonSectionProps } from './CourseLessonSection';

export { WeakAreasSection } from './WeakAreasSection';
export type { WeakAreasSectionProps } from './WeakAreasSection';

export { RecentErrorsSection } from './RecentErrorsSection';
export type { RecentErrorsSectionProps } from './RecentErrorsSection';

export { MarketSummarySection } from './MarketSummarySection';
export type { MarketSummarySectionProps } from './MarketSummarySection';
