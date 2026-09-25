import { useMemo, useState } from 'react';
import {
  Archive,
  BadgeCheck,
  BrainCircuit,
  CircleAlert,
  CircleHelp,
  Database,
  GitBranch,
  Network,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTile,
  CardTitle,
  Section,
} from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonCard } from '../components/Skeleton';
import { Sparkline } from '../components/charts/Sparkline';
import { ClearFiltersButton, KnowledgeSearch } from '../components/memory/KnowledgeSearch';
import { MemoryCard } from '../components/memory/MemoryCard';
import { MemoryTimeline } from '../components/memory/MemoryTimeline';
import { TrustBadge } from '../components/memory/TrustBadge';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import { formatPercent, formatRelative } from '../lib/format';
import { cn } from '../lib/cn';
import {
  previewNotice,
  MEMORY_STATUS_EXPLANATION,
  MEMORY_STATUS_LABEL,
  trustPolicy,
  memoryStatus,
  mockKnowledge,
  mockKnowledgeGrowth,
  mockMemoryCategories,
  mockMemoryTimeline,
  mockSourceFacets,
  mockTrustFacets,
  type MemoryStatus,
} from '../mock/memory';
import { msg } from '../i18n/index.js';

const TABS = [
  {
    id: 'board',
    get label(): string {
      return msg('memoryPage.knowledgeBoard');
    },
    icon: <Network size={14} aria-hidden />,
  },
  {
    id: 'search',
    get label(): string {
      return msg('shell.search');
    },
    icon: <Database size={14} aria-hidden />,
  },
  {
    id: 'timeline',
    get label(): string {
      return msg('examsPage.history');
    },
    icon: <GitBranch size={14} aria-hidden />,
  },
  {
    id: 'states',
    get label(): string {
      return msg('memory.trustStates');
    },
    icon: <ShieldCheck size={14} aria-hidden />,
  },
] as const;

const STATUS_ICON = {
  verified: <BadgeCheck size={14} aria-hidden />,
  'pending-review': <CircleHelp size={14} aria-hidden />,
  unverified: <CircleAlert size={14} aria-hidden />,
  archived: <Archive size={14} aria-hidden />,
} as const;

export function MemoryPage() {
  const [tab, setTab] = useState<string>('board');
  const [query, setQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<readonly string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<readonly string[]>([]);

  const categoryLabel = (categoryId: string) =>
    mockMemoryCategories.find((category) => category.id === categoryId)?.label ?? categoryId;

  const counts = useMemo(() => {
    const initial: Record<MemoryStatus, number> = {
      verified: 0,
      'pending-review': 0,
      unverified: 0,
      archived: 0,
    };
    for (const record of mockKnowledge) initial[memoryStatus(record)] += 1;
    return initial;
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mockKnowledge.filter((record) => {
      const status = memoryStatus(record);
      if (statusFilters.length > 0 && !statusFilters.includes(status)) return false;
      if (
        sourceFilters.length > 0 &&
        !record.sources.some((source) => sourceFilters.includes(source.kind))
      ) {
        return false;
      }
      if (needle.length === 0) return true;
      const haystack = [
        record.title,
        record.summary,
        ...record.tags,
        ...record.sources.map((source) => `${source.ref} ${source.label}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, statusFilters, sourceFilters]);

  const toggle = (id: string, current: readonly string[], set: (next: readonly string[]) => void) =>
    set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const recordTitles = Object.fromEntries(mockKnowledge.map((record) => [record.id, record.title]));
  const verifiedSeries = mockKnowledgeGrowth.map((point) => point.verified);
  const growthTotal = mockKnowledgeGrowth[mockKnowledgeGrowth.length - 1]?.verified ?? 0;
  const activeRecords = mockKnowledge.filter((record) => memoryStatus(record) !== 'archived');
  const filtersActive = statusFilters.length > 0 || sourceFilters.length > 0 || query.length > 0;

  return (
    <Workspace
      title={msg('memory.knowledgeMemory')}
      description={msg('memoryPage.whatTheAgentMayUseWhereEachClaim')}
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            provenance required
          </Badge>
          <Tooltip content={previewNotice()}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        <Card surface="data">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('memory.knowledgeBase')}</CardTitle>
              <CardDescription>{msg('memory.recordsAcrossFiveCategories')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-3">
            <span className="num text-metric text-text">
              {mockMemoryCategories.reduce((sum, category) => sum + category.count, 0)}
            </span>
            <Sparkline values={verifiedSeries} width={80} height={22} tone="primary" />
          </CardContent>
          <CardFooter className="text-caption text-text-faint">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp size={12} aria-hidden />
              {growthTotal} {msg('memory.verifiedRecordsAtTheEndOf')}
            </span>
          </CardFooter>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('memory.trustMix')}</CardTitle>
              <CardDescription>{msg('memory.illustrativeSampleOfNineRecords')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['verified', 'pending-review', 'unverified', 'archived'] as const).map((status) => (
              <div key={status} className="flex items-center justify-between gap-2">
                <TrustBadge status={status} />
                <span className="num text-caption text-text-muted">{counts[status]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('memory.verifiedShare')}</CardTitle>
              <CardDescription>{msg('memory.ofTheRecordsInTheIllustrative')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">
              {formatPercent((counts.verified / mockKnowledge.length) * 100, 0)}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              {msg('memory.theRestIsUnverifiedOrAwaiting')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('memory.trustPolicy')}</CardTitle>
              <CardDescription>{msg('memory.whatKeepsTheKnowledgeBaseHonest')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-caption text-text-muted">{trustPolicy()}</CardContent>
          <CardFooter className="text-caption text-text-faint">
            <span className="num">{msg('memory.contextKindForTrust')}</span>
          </CardFooter>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('memory.memorySections')}
      >
        <TabPanel value="board" className="space-y-4">
          <Card surface="featured">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('memory.knowledgeGrowth')}</CardTitle>
                <CardDescription>{msg('memory.recordsPerMonthByTrustSix')}</CardDescription>
              </div>
              <Badge tone="neutral">{msg('memory.illustrative')}</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                {mockKnowledgeGrowth.map((point) => {
                  const total = point.verified + point.pending + point.unverified;
                  return (
                    <div key={point.month} className="flex flex-1 flex-col items-center gap-1.5">
                      <div
                        role="img"
                        aria-label={`${point.month}: ${point.verified} verified, ${point.pending} pending, ${point.unverified} unverified`}
                        className="flex h-28 w-full flex-col justify-end gap-0.5"
                      >
                        <span
                          className="w-full rounded-t-[2px] bg-ai/70"
                          style={{ height: `${(point.unverified / 60) * 100}%` }}
                        />
                        <span
                          className="w-full bg-warning/70"
                          style={{ height: `${(point.pending / 60) * 100}%` }}
                        />
                        <span
                          className="w-full rounded-b-[2px] bg-primary"
                          style={{ height: `${(point.verified / 60) * 100}%` }}
                        />
                      </div>
                      <span className="text-caption text-text-faint">{point.month}</span>
                      <span className="num text-caption text-text-muted">{total}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-text-faint">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
                  {msg('memory.verified')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-warning/70" />
                  {msg('memory.pendingReview')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-ai/70" />
                  {msg('memory.unverified')}
                </span>
              </div>
            </CardContent>
          </Card>

          <Section
            title={msg('memory.categories')}
            description={msg('memoryPage.knowledgeIsFiledByWhatItIsFor')}
          >
            <Grid columns={3}>
              {mockMemoryCategories.map((category) => (
                <Card surface="metric" key={category.id}>
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">{category.label}</CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </div>
                    <Badge tone="outline">{category.count}</Badge>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-2 text-caption text-text-faint">
                    <span>
                      {mockKnowledge.filter((record) => record.categoryId === category.id).length}{' '}
                      {msg('memory.inTheSample')}
                    </span>
                    <span className="num">{category.id}</span>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          </Section>

          <Section
            title={msg('memory.recentKnowledge')}
            description={msg('memoryPage.liveRecordsOnlyArchivedItemsAreKeptAnd')}
          >
            <Grid columns={2}>
              {activeRecords.map((record) => (
                <MemoryCard
                  key={record.id}
                  record={record}
                  categoryLabel={categoryLabel(record.categoryId)}
                />
              ))}
            </Grid>
          </Section>

          <ErrorState
            severity="info"
            title={msg('memory.notAConnectedKnowledgeBase')}
            description={previewNotice()}
            code="PREVIEW_FIXTURE"
            action={
              <span className="text-caption">
                The vector store, embedding provider and repositories exist in the backend; this
                interface renders typed examples of their shapes.
              </span>
            }
          />
        </TabPanel>

        <TabPanel value="search" className="space-y-4">
          <KnowledgeSearch
            facets={mockTrustFacets}
            facetLabel={msg('memoryPage.trustState')}
            title={msg('memory.searchTheKnowledgeBase')}
            description={msg('memoryPage.literalTextMatchingOverTheIllustrativeSetPlus')}
            value={query}
            onValueChange={setQuery}
            activeFacets={statusFilters}
            onToggleFacet={(id) => toggle(id, statusFilters, setStatusFilters)}
            resultCount={results.length}
          />
          <KnowledgeSearch
            facets={mockSourceFacets}
            facetLabel={msg('memoryPage.sourceKind')}
            title={msg('memory.filterBySource')}
            description={msg('memoryPage.whereTheRecordCameFromAnIndependent')}
            showInput={false}
            value={query}
            onValueChange={setQuery}
            activeFacets={sourceFilters}
            onToggleFacet={(id) => toggle(id, sourceFilters, setSourceFilters)}
            resultCount={results.length}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-text-faint">
              {msg('memory.filtersAreIndependentTrustAndSource')}
            </p>
            <ClearFiltersButton
              onClear={() => {
                setQuery('');
                setStatusFilters([]);
                setSourceFilters([]);
              }}
              disabled={!filtersActive}
            />
          </div>

          {results.length === 0 ? (
            <EmptyState
              icon={<BrainCircuit size={22} aria-hidden />}
              title={msg('memory.noRecordsMatchThisFilter')}
              description={msg('memoryPage.thePreviewFilterMatchesLiteralTextOnlySemantic')}
              hint={msg('memoryPage.anEmptyResultStatesWhichFilterProducedIt')}
            />
          ) : (
            <Grid columns={2}>
              {results.map((record) => (
                <MemoryCard
                  key={record.id}
                  record={record}
                  categoryLabel={categoryLabel(record.categoryId)}
                  variant="compact"
                />
              ))}
            </Grid>
          )}
        </TabPanel>

        <TabPanel value="timeline" className="space-y-4">
          <MemoryTimeline entries={mockMemoryTimeline} recordTitles={recordTitles} />
          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('memory.appendOnly')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                `memory_versions` is append-only in the database: every revision, trust change and
                tombstone adds an entry rather than editing one.
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('memory.verificationIsRecorded')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('memory.aPromotionToVerifiedOrAuthoritative')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('memory.deletionIsATombstone')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('memory.removingKnowledgeMarksItArchivedAnd')}
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="states" className="space-y-4">
          <Section
            title={msg('memory.trustStates')}
            description={msg('memoryPage.fourStatesEachWithWhatItMeansFor')}
          >
            <Grid columns={2}>
              {(['verified', 'pending-review', 'unverified', 'archived'] as const).map((status) => (
                <Card surface="metric" key={status}>
                  <CardHeader divider>
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="text-text-faint">
                        {STATUS_ICON[status]}
                      </span>
                      <CardTitle className="text-body">{MEMORY_STATUS_LABEL[status]}</CardTitle>
                    </div>
                    <TrustBadge status={status} />
                  </CardHeader>
                  <CardContent className="space-y-2 text-caption text-text-muted">
                    <p>{MEMORY_STATUS_EXPLANATION[status]}</p>
                    <p className="text-text-faint">
                      {mockKnowledge.filter((record) => memoryStatus(record) === status).length}{' '}
                      {msg('memory.exampleRecordsInThisState')}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          </Section>

          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('exams.loading')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={4} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('exams.empty')}</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Database size={22} aria-hidden />}
                  title={msg('memory.noKnowledgeRecorded')}
                  description={msg('memoryPage.aFreshlyStartedProfileHasNoRecordsThat')}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('memory.unverifiedWarning')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ErrorState
                  severity="warning"
                  title={msg('memory.retrievedButNotTrusted')}
                  description={msg('memoryPage.unverifiedRecordsMayBeUsedAsContextBut')}
                  code="POLICY_VIOLATION"
                />
              </CardContent>
            </Card>
          </Grid>

          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('memory.archivedRecords')}</CardTitle>
                <CardDescription>{msg('memory.tombstonedRetainedAsEvidence')}</CardDescription>
              </div>
              <Badge tone="outline" icon={<Archive size={12} aria-hidden />}>
                {counts.archived} {msg('journal.archived')}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockKnowledge
                .filter((record) => memoryStatus(record) === 'archived')
                .map((record) => (
                  <CardTile key={record.id} className={cn('')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body text-text">{record.title}</span>
                      <TrustBadge status="archived" />
                    </div>
                    <p className="mt-1 text-caption text-text-muted">{record.summary}</p>
                    <p className="mt-1 text-caption text-text-faint">
                      {msg('memory.updated')} {formatRelative(record.updatedAt)} {msg('memory.v')}
                      {record.version}
                    </p>
                  </CardTile>
                ))}
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
