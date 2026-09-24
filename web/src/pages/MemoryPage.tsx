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
  MEMORY_PREVIEW_NOTICE,
  MEMORY_STATUS_EXPLANATION,
  MEMORY_STATUS_LABEL,
  MEMORY_TRUST_POLICY,
  memoryStatus,
  mockKnowledge,
  mockKnowledgeGrowth,
  mockMemoryCategories,
  mockMemoryTimeline,
  mockSourceFacets,
  mockTrustFacets,
  type MemoryStatus,
} from '../mock/memory';

const TABS = [
  { id: 'board', label: 'Knowledge board', icon: <Network size={14} aria-hidden /> },
  { id: 'search', label: 'Search', icon: <Database size={14} aria-hidden /> },
  { id: 'timeline', label: 'History', icon: <GitBranch size={14} aria-hidden /> },
  { id: 'states', label: 'Trust states', icon: <ShieldCheck size={14} aria-hidden /> },
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
      title="Knowledge memory"
      description="What the agent may use, where each claim came from and how much it may be trusted. Retrieval never turns unverified text into fact."
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            provenance required
          </Badge>
          <Tooltip content={MEMORY_PREVIEW_NOTICE}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Knowledge base</CardTitle>
              <CardDescription>Records across five categories</CardDescription>
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
              {growthTotal} verified records at the end of the series
            </span>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Trust mix</CardTitle>
              <CardDescription>Illustrative sample of nine records</CardDescription>
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
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Verified share</CardTitle>
              <CardDescription>Of the records in the illustrative sample</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">
              {formatPercent((counts.verified / mockKnowledge.length) * 100, 0)}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              The rest is unverified or awaiting a non-model verifier. Nothing is promoted by usage.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Trust policy</CardTitle>
              <CardDescription>What keeps the knowledge base honest</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-caption text-text-muted">{MEMORY_TRUST_POLICY}</CardContent>
          <CardFooter className="text-caption text-text-faint">
            <span className="num">contextKindForTrust()</span>
          </CardFooter>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Memory sections"
      >
        <TabPanel value="board" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Knowledge growth</CardTitle>
                <CardDescription>Records per month by trust, six months of study</CardDescription>
              </div>
              <Badge tone="neutral">illustrative</Badge>
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
                  verified
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-warning/70" />
                  pending review
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-ai/70" />
                  unverified
                </span>
              </div>
            </CardContent>
          </Card>

          <Section
            title="Categories"
            description="Knowledge is filed by what it is for, not by when it was learned."
          >
            <Grid columns={3}>
              {mockMemoryCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-body">{category.label}</CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </div>
                    <Badge tone="outline">{category.count}</Badge>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-2 text-caption text-text-faint">
                    <span>
                      {mockKnowledge.filter((record) => record.categoryId === category.id).length}{' '}
                      in the sample
                    </span>
                    <span className="num">{category.id}</span>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          </Section>

          <Section
            title="Recent knowledge"
            description="Live records only; archived items are kept and shown under History."
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
            title="Not a connected knowledge base"
            description={MEMORY_PREVIEW_NOTICE}
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
            facetLabel="Trust state"
            title="Search the knowledge base"
            description="Literal text matching over the illustrative set, plus trust filters"
            value={query}
            onValueChange={setQuery}
            activeFacets={statusFilters}
            onToggleFacet={(id) => toggle(id, statusFilters, setStatusFilters)}
            resultCount={results.length}
          />
          <KnowledgeSearch
            facets={mockSourceFacets}
            facetLabel="Source kind"
            title="Filter by source"
            description="Where the record came from — an independent question from how much it is trusted"
            showInput={false}
            value={query}
            onValueChange={setQuery}
            activeFacets={sourceFilters}
            onToggleFacet={(id) => toggle(id, sourceFilters, setSourceFilters)}
            resultCount={results.length}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-text-faint">
              Filters are independent: trust and source are separate questions about a record.
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
              title="No records match this filter"
              description="The preview filter matches literal text only. Semantic retrieval — embeddings, ranking and trust-filtered recall — is not connected, so an empty result here does not mean the knowledge base is empty."
              hint="An empty result states which filter produced it."
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
              <CardHeader>
                <CardTitle className="text-body">Append-only</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                `memory_versions` is append-only in the database: every revision, trust change and
                tombstone adds an entry rather than editing one.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Verification is recorded</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                A promotion to verified or authoritative names the human or tool that granted it.
                The model is never accepted as a verifier.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Deletion is a tombstone</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Removing knowledge marks it archived and keeps the history, so a claim that was once
                trusted remains auditable.
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="states" className="space-y-4">
          <Section
            title="Trust states"
            description="Four states, each with what it means for a reader."
          >
            <Grid columns={2}>
              {(['verified', 'pending-review', 'unverified', 'archived'] as const).map((status) => (
                <Card key={status}>
                  <CardHeader>
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
                      example records in this state.
                    </p>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          </Section>

          <Grid columns={3}>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Loading</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={4} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Empty</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Database size={22} aria-hidden />}
                  title="No knowledge recorded"
                  description="A freshly started profile has no records. That is stated, not disguised with placeholder rows."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Unverified warning</CardTitle>
              </CardHeader>
              <CardContent>
                <ErrorState
                  severity="warning"
                  title="Retrieved but not trusted"
                  description="Unverified records may be used as context, but they are labelled uncertainty and can never be presented as fact."
                  code="POLICY_VIOLATION"
                />
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Archived records</CardTitle>
                <CardDescription>Tombstoned, retained as evidence</CardDescription>
              </div>
              <Badge tone="outline" icon={<Archive size={12} aria-hidden />}>
                {counts.archived} archived
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockKnowledge
                .filter((record) => memoryStatus(record) === 'archived')
                .map((record) => (
                  <div
                    key={record.id}
                    className={cn(
                      'rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body text-text">{record.title}</span>
                      <TrustBadge status="archived" />
                    </div>
                    <p className="mt-1 text-caption text-text-muted">{record.summary}</p>
                    <p className="mt-1 text-caption text-text-faint">
                      updated {formatRelative(record.updatedAt)} · v{record.version}
                    </p>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
