import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  GaugeCircle,
  History,
  PencilLine,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { FIELD_KEYS, FIELD_LABELS, type FieldKey } from '@shared/profile/model';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTile,
  CardTitle,
} from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import {
  AnalysisReadinessPanel,
  InputQualitySummary,
  MissingInformationPanel,
} from '../components/quality';
import {
  ClarifyingPrompts,
  CompletenessMeter,
  FactRow,
  ProfileEditor,
} from '../components/profile';
import { Grid, Workspace } from '../app/Workspace';
import { useProfileStore, type ProfileContextInput } from '../store/profile';
import { useQualityStore } from '../store/quality';

/**
 * Profile: what the user has declared, and what is still unanswered.
 *
 * The page exists to make three distinctions legible, because they are the difference
 * between a system that knows something and one that guesses:
 *
 *   - **stated versus assumed** — every fact row carries its source, and the editor never
 *     pre-fills an assumption;
 *   - **current versus stale** — the freshness policy is per input kind, and an aged
 *     value is labelled rather than silently reused;
 *   - **known versus missing** — the gaps are listed with the question that closes them.
 *
 * With no session there is nothing to read, and the page says so with the resolver's own
 * reason. It does not render a fixture that would look like a saved profile.
 */

const TABS = [
  { id: 'overview', label: 'Overview', icon: <UserRound size={14} aria-hidden /> },
  { id: 'context', label: 'Declared context', icon: <ShieldCheck size={14} aria-hidden /> },
  { id: 'quality', label: 'Data quality', icon: <GaugeCircle size={14} aria-hidden /> },
  { id: 'edit', label: 'Preferences', icon: <PencilLine size={14} aria-hidden /> },
  { id: 'history', label: 'History', icon: <History size={14} aria-hidden /> },
] as const;

export function ProfilePage() {
  const status = useProfileStore((state) => state.status);
  const profile = useProfileStore((state) => state.profile);
  const unavailableReason = useProfileStore((state) => state.unavailableReason);
  const error = useProfileStore((state) => state.error);
  const saving = useProfileStore((state) => state.saving);
  const saveError = useProfileStore((state) => state.saveError);
  const lastSaved = useProfileStore((state) => state.lastSaved);
  const load = useProfileStore((state) => state.load);
  const save = useProfileStore((state) => state.save);
  const clearSaveResult = useProfileStore((state) => state.clearSaveResult);

  const qualityStatus = useQualityStore((state) => state.status);
  const qualityAssessment = useQualityStore((state) => state.assessment);
  const qualityUnavailable = useQualityStore((state) => state.unavailableReason);
  const qualityError = useQualityStore((state) => state.error);
  const loadQuality = useQualityStore((state) => state.load);

  const [tab, setTab] = useState<string>('overview');

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  /**
   * The assessment is requested when the tab is opened, not with the page.
   *
   * It is computed against the stored context and the clock, and it is only meaningful
   * while its tab is on screen — fetching it for every visitor would spend a request on
   * a panel most readers never open, and would show a verdict that predates an edit made
   * a moment later.
   */
  useEffect(() => {
    if (tab === 'quality' && qualityStatus === 'idle') void loadQuality();
  }, [tab, qualityStatus, loadQuality]);

  const assessment = profile?.assessment ?? null;

  /** Field keys ordered required-first, so the actionable rows come first. */
  const orderedKeys = useMemo<FieldKey[]>(() => {
    if (!assessment) return [...FIELD_KEYS];
    const rank = (key: FieldKey): number => {
      const field = assessment.fields.find((item) => item.key === key);
      if (!field?.required) return 3;
      if (field.status === 'missing' || field.status === 'assumed') return 0;
      if (field.status === 'stale') return 1;
      return 2;
    };
    return [...FIELD_KEYS].sort((a, b) => rank(a) - rank(b));
  }, [assessment]);

  const handleSubmit = (context: ProfileContextInput): void => {
    void save(context).then((result) => {
      if (result) setTab('overview');
    });
  };

  if (status === 'idle' || status === 'loading') {
    return (
      <Workspace
        title="Profile"
        description="Your declared trading context: what you have told Master Trade, and what is still open."
      >
        <Grid columns={3}>
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardContent className="space-y-3 pt-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </Grid>
      </Workspace>
    );
  }

  if (status === 'unavailable') {
    return (
      <Workspace
        title="Profile"
        description="Your declared trading context: what you have told Master Trade, and what is still open."
      >
        <ErrorState
          severity="info"
          title="No profile to show yet"
          description={`${unavailableReason ?? 'The profile could not be reached.'} Nothing is displayed in its place: a profile is personal data, so a fixture would be worse than an empty page.`}
        />
      </Workspace>
    );
  }

  if (status === 'error' || profile === null || assessment === null) {
    return (
      <Workspace
        title="Profile"
        description="Your declared trading context: what you have told Master Trade, and what is still open."
      >
        <ErrorState
          title="Could not read the profile"
          description={error?.message ?? 'The request failed without a reason.'}
          code={error?.code}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      </Workspace>
    );
  }

  const statements = assessment.fields.reduce<Record<string, number>>((counts, field) => {
    counts[field.status] = (counts[field.status] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <Workspace
      title="Profile"
      description="Your declared trading context: what you have told Master Trade, and what is still open."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline" dot>
          {profile.contextSet ? `Context version ${profile.version}` : 'No context saved yet'}
        </Badge>
        <Badge tone="neutral">{profile.displayName}</Badge>
        <Badge tone="neutral">{profile.timezone}</Badge>
        {assessment.complete ? (
          <Badge tone="success">Every required field is current</Badge>
        ) : (
          <Badge tone="warning">
            {assessment.gaps.length + assessment.stale.length} field(s) open
          </Badge>
        )}
        <Tooltip content="The agent may only use your declared context as input. It never writes to it, and it never fills a blank with a default.">
          <Badge tone="info">Declared by you</Badge>
        </Tooltip>
      </div>

      {lastSaved ? (
        <ErrorState
          severity="info"
          title={`Saved as context version ${lastSaved.version}`}
          description={`${lastSaved.note} ${
            lastSaved.questions.length > 0 ? 'See the prompts below for what does not line up.' : ''
          }`.trim()}
          action={
            <Button size="sm" variant="ghost" onClick={clearSaveResult}>
              Dismiss
            </Button>
          }
        />
      ) : null}

      <Tabs items={TABS} value={tab} onValueChange={setTab} aria-label="Profile sections">
        <TabPanel value="overview" className="space-y-4">
          <Grid columns={2}>
            <CompletenessMeter assessment={assessment} />
            <Card>
              <CardHeader divider>
                <CardTitle>How to read this page</CardTitle>
                <CardDescription>
                  Every value is labelled with where it came from and whether it is still current.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-body text-text-muted">
                <p>
                  <span className="text-text">Confirmed</span> — you told us this, inside its
                  freshness window.
                </p>
                <p>
                  <span className="text-text">May be outdated</span> — you told us this, but it has
                  aged past the window for this kind of input.
                </p>
                <p>
                  <span className="text-text">Assumed</span> — not provided. It is never treated as
                  a fact, and it never appears pre-filled in the editor.
                </p>
                <p>
                  <span className="text-text">Missing</span> — nothing is stored. Capabilities that
                  need it ask, or stay limited and say why.
                </p>
                <p className="text-caption text-text-faint">
                  {statements.confirmed ?? 0} confirmed · {statements.derived ?? 0} derived ·{' '}
                  {statements.stale ?? 0} may be outdated · {statements.assumed ?? 0} assumed ·{' '}
                  {statements.missing ?? 0} missing
                </p>
              </CardContent>
            </Card>
          </Grid>

          <ClarifyingPrompts
            prompts={profile.prompts}
            questions={assessment.issues.filter((issue) => issue.severity === 'question')}
            onAnswer={() => setTab('edit')}
          />
        </TabPanel>

        <TabPanel value="context" className="space-y-4">
          <Card>
            <CardHeader divider>
              <CardTitle>Declared context</CardTitle>
              <CardDescription>
                {FIELD_KEYS.length} fields. The value, its source and its age are shown together,
                because a value without its source is a value you cannot weigh.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {orderedKeys.map((key) => {
                const field = assessment.fields.find((item) => item.key === key);
                const raw = profile.context[key];
                if (!field || raw === undefined) return null;
                return (
                  <FactRow
                    key={key}
                    fieldKey={key}
                    field={raw as never}
                    status={field.status}
                    ageDays={field.ageDays}
                    required={field.required}
                  />
                );
              })}
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="quality" className="space-y-4">
          {qualityStatus === 'idle' || qualityStatus === 'loading' ? (
            <Card>
              <CardHeader divider>
                <CardTitle>Assessing the declared inputs</CardTitle>
                <CardDescription>
                  Deterministic checks over what you have declared and what each capability declares
                  it needs. No language model is consulted.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ) : null}

          {qualityStatus === 'unavailable' ? (
            <ErrorState
              severity="info"
              title="Could not assess the declared inputs"
              description={`${qualityUnavailable ?? 'The assessment could not be reached.'} No sample assessment is shown in its place: a quality verdict that was not computed would be an invented claim about your own inputs.`}
            />
          ) : null}

          {qualityStatus === 'error' ? (
            <ErrorState
              title="The assessment failed"
              description={qualityError?.message ?? 'The request failed without a reason.'}
              code={qualityError?.code}
              action={
                <Button size="sm" variant="secondary" onClick={() => void loadQuality()}>
                  Try again
                </Button>
              }
            />
          ) : null}

          {qualityStatus === 'ready' && qualityAssessment !== null ? (
            <>
              <InputQualitySummary
                report={qualityAssessment.report}
                contextVersion={qualityAssessment.contextVersion}
                contextSet={qualityAssessment.contextSet}
                asOf={qualityAssessment.asOf}
              />

              <MissingInformationPanel
                gaps={qualityAssessment.report.gaps}
                clarifications={qualityAssessment.decisions.flatMap(
                  (decision) => decision.clarifications,
                )}
                onAnswer={() => setTab('edit')}
              />

              <section className="space-y-3" aria-label="Analysis readiness">
                <div className="space-y-1">
                  <h3 className="text-body font-medium text-text">
                    May each analysis run, and in what form?
                  </h3>
                  <p className="text-body text-text-muted">
                    The same gate the agent consults before a model is asked to reason. It is
                    evaluated here from the stored context, on the server, so the answer you read
                    and the answer the agent acts on are one and the same.
                  </p>
                  <p className="text-caption text-text-faint">
                    Market data for this deployment:{' '}
                    {qualityAssessment.marketData.available
                      ? `${qualityAssessment.marketData.barCount} bar(s), source ${
                          qualityAssessment.marketData.source ?? 'unrecorded'
                        }`
                      : `not available — ${qualityAssessment.marketData.detail}`}
                  </p>
                </div>

                {qualityAssessment.decisions.map((decision) => (
                  <AnalysisReadinessPanel
                    key={decision.requestedType}
                    decision={decision}
                    onAnswer={() => setTab('edit')}
                  />
                ))}
              </section>

              <p className="text-caption text-text-faint">{qualityAssessment.note}</p>
            </>
          ) : null}
        </TabPanel>

        <TabPanel value="edit" className="space-y-4">
          {saveError ? (
            <ErrorState
              title="The context was not saved"
              description={saveError.message}
              code={saveError.code}
              severity={saveError.retryable ? 'warning' : 'error'}
            />
          ) : null}
          <ProfileEditor
            context={profile.context}
            saving={saving}
            serverErrors={saveError?.fields ?? []}
            onSubmit={handleSubmit}
            onCancel={() => setTab('overview')}
          />
        </TabPanel>

        <TabPanel value="history" className="space-y-4">
          <Card>
            <CardHeader divider>
              <CardTitle>Context history</CardTitle>
              <CardDescription>
                Versions are append-only. A save adds a version; nothing is rewritten, so the
                context an answer was given from stays recoverable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile.history.length === 0 ? (
                <EmptyState
                  icon={<History size={18} aria-hidden />}
                  title="No versions yet"
                  description="Saving preferences creates the first version of your context."
                />
              ) : (
                <ul className="space-y-2">
                  {profile.history.map((entry) => (
                    <CardTile
                      key={entry.version}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-body text-text">Version {entry.version}</span>
                      <span className="text-caption text-text-muted">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                      <Badge tone="neutral">
                        {entry.changedBy === profile.userId ? 'You' : entry.changedBy}
                      </Badge>
                    </CardTile>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {profile.prompts.length > 0 ? (
            <ErrorState
              severity="warning"
              title="Some context is still missing"
              description="Nothing is inferred to fill the gap: the fields stay empty and the affected analysis stays limited."
              action={
                <Button size="sm" variant="secondary" onClick={() => setTab('edit')}>
                  <AlertTriangle size={14} aria-hidden /> Answer what is open
                </Button>
              }
            />
          ) : null}
        </TabPanel>
      </Tabs>

      <p className="text-caption text-text-faint">
        {profile.note} Field labels: {FIELD_LABELS.experienceLevel}, {FIELD_LABELS.riskTolerance}{' '}
        and {FIELD_LABELS.horizon} are the examples used in this description.
      </p>
    </Workspace>
  );
}
