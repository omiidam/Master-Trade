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
import { msg } from '../i18n/index.js';

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
  {
    id: 'overview',
    get label(): string {
      return msg('dashboardPage.overview');
    },
    icon: <UserRound size={14} aria-hidden />,
  },
  {
    id: 'context',
    get label(): string {
      return msg('profile.declaredContext');
    },
    icon: <ShieldCheck size={14} aria-hidden />,
  },
  {
    id: 'quality',
    get label(): string {
      return msg('portfolio.dataQuality');
    },
    icon: <GaugeCircle size={14} aria-hidden />,
  },
  {
    id: 'edit',
    get label(): string {
      return msg('profilePage.preferences');
    },
    icon: <PencilLine size={14} aria-hidden />,
  },
  {
    id: 'history',
    get label(): string {
      return msg('examsPage.history');
    },
    icon: <History size={14} aria-hidden />,
  },
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
        title={msg('profile.profile')}
        description={msg('profilePage.yourDeclaredTradingContextWhatYouHaveTold')}
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
        title={msg('profile.profile')}
        description={msg('profilePage.yourDeclaredTradingContextWhatYouHaveTold')}
      >
        <ErrorState
          severity="info"
          title={msg('profile.noProfileToShowYet')}
          description={`${unavailableReason ?? 'The profile could not be reached.'} Nothing is displayed in its place: a profile is personal data, so a fixture would be worse than an empty page.`}
        />
      </Workspace>
    );
  }

  if (status === 'error' || profile === null || assessment === null) {
    return (
      <Workspace
        title={msg('profile.profile')}
        description={msg('profilePage.yourDeclaredTradingContextWhatYouHaveTold')}
      >
        <ErrorState
          title={msg('profile.couldNotReadTheProfile')}
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
      title={msg('profile.profile')}
      description={msg('profilePage.yourDeclaredTradingContextWhatYouHaveTold')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline" dot>
          {profile.contextSet ? `Context version ${profile.version}` : 'No context saved yet'}
        </Badge>
        <Badge tone="neutral">{profile.displayName}</Badge>
        <Badge tone="neutral">{profile.timezone}</Badge>
        {assessment.complete ? (
          <Badge tone="success">{msg('profile.everyRequiredFieldIsCurrent')}</Badge>
        ) : (
          <Badge tone="warning">
            {assessment.gaps.length + assessment.stale.length} {msg('profile.fieldSOpen')}
          </Badge>
        )}
        <Tooltip content={msg('profilePage.theAgentMayOnlyUseYourDeclaredContext')}>
          <Badge tone="info">{msg('profile.declaredByYou')}</Badge>
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

      <Tabs
        items={TABS}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('profile.profileSections')}
      >
        <TabPanel value="overview" className="space-y-4">
          <Grid columns={2}>
            <CompletenessMeter assessment={assessment} />
            <Card>
              <CardHeader divider>
                <CardTitle>{msg('profile.howToReadThisPage')}</CardTitle>
                <CardDescription>{msg('profile.everyValueIsLabelledWithWhere')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-body text-text-muted">
                <p>
                  <span className="text-text">{msg('profile.confirmed')}</span>{' '}
                  {msg('profile.youToldUsThisInsideIts')}
                </p>
                <p>
                  <span className="text-text">{msg('profile.mayBeOutdated')}</span>{' '}
                  {msg('profile.youToldUsThisButIt')}
                </p>
                <p>
                  <span className="text-text">{msg('profile.assumed')}</span>{' '}
                  {msg('profile.notProvidedItIsNeverTreated')}
                </p>
                <p>
                  <span className="text-text">{msg('profile.missing')}</span>{' '}
                  {msg('profile.nothingIsStoredCapabilitiesThatNeed')}
                </p>
                <p className="text-caption text-text-faint">
                  {statements.confirmed ?? 0} {msg('profile.confirmed2')} {statements.derived ?? 0}{' '}
                  {msg('profile.derived')} {statements.stale ?? 0} {msg('profile.mayBeOutdated2')}{' '}
                  {statements.assumed ?? 0} {msg('profile.assumed2')} {statements.missing ?? 0}{' '}
                  {msg('profile.missing2')}
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
              <CardTitle>{msg('profile.declaredContext')}</CardTitle>
              <CardDescription>
                {FIELD_KEYS.length} {msg('profile.fieldsTheValueItsSourceAnd')}
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
                <CardTitle>{msg('profile.assessingTheDeclaredInputs')}</CardTitle>
                <CardDescription>
                  {msg('profile.deterministicChecksOverWhatYouHave')}
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
              title={msg('profile.couldNotAssessTheDeclaredInputs')}
              description={`${qualityUnavailable ?? 'The assessment could not be reached.'} No sample assessment is shown in its place: a quality verdict that was not computed would be an invented claim about your own inputs.`}
            />
          ) : null}

          {qualityStatus === 'error' ? (
            <ErrorState
              title={msg('profile.theAssessmentFailed')}
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

              <section className="space-y-3" aria-label={msg('profile.analysisReadiness')}>
                <div className="space-y-1">
                  <h3 className="text-body font-medium text-text">
                    {msg('profile.mayEachAnalysisRunAndIn')}
                  </h3>
                  <p className="text-body text-text-muted">
                    {msg('profile.theSameGateTheAgentConsults')}
                  </p>
                  <p className="text-caption text-text-faint">
                    {msg('profile.marketDataForThisDeployment')}{' '}
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
              title={msg('profile.theContextWasNotSaved')}
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
              <CardTitle>{msg('profile.contextHistory')}</CardTitle>
              <CardDescription>{msg('profile.versionsAreAppendOnlyASave')}</CardDescription>
            </CardHeader>
            <CardContent>
              {profile.history.length === 0 ? (
                <EmptyState
                  icon={<History size={18} aria-hidden />}
                  title={msg('profile.noVersionsYet')}
                  description={msg('profilePage.savingPreferencesCreatesTheFirstVersionOfYour')}
                />
              ) : (
                <ul className="space-y-2">
                  {profile.history.map((entry) => (
                    <CardTile
                      key={entry.version}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-body text-text">
                        {msg('decisions.version')} {entry.version}
                      </span>
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
              title={msg('profile.someContextIsStillMissing')}
              description={msg('profilePage.nothingIsInferredToFillTheGapThe')}
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
        {profile.note} {msg('profile.fieldLabels')} {FIELD_LABELS.experienceLevel},{' '}
        {FIELD_LABELS.riskTolerance} {msg('academy.and')} {FIELD_LABELS.horizon}{' '}
        {msg('profile.areTheExamplesUsedInThis')}
      </p>
    </Workspace>
  );
}
