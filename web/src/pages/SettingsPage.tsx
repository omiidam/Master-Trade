import { useState, type ReactNode } from 'react';
import {
  Database,
  KeyRound,
  Languages,
  Layers,
  Monitor,
  Palette,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { AgentCardItem, AgentCardList, AgentCheck } from '../components/agent/AgentCard';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardDivider,
  CardHeader,
  CardTile,
  CardTitle,
} from '../components/Card';
import { ReadOnlyValue } from '../components/Input';
import { FeedbackStatesPanel } from '../components/FeedbackStates';
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import { THEME } from '../design/tokens';
import { useShellStatus } from '../desktop/useShellStatus';
import { mockBudget, mockProviders, mockSystemStatus } from '../mock/data';
import { LANGUAGE_PREFERENCES, type LanguagePreference } from '../language/preference';
import { useUiStore } from '../store/ui';
import { cn } from '../lib/cn';
import { msg, type MessageKey } from '../i18n/index.js';

const PROVIDER_TONE = {
  configured: 'primary',
  missing: 'warning',
  'offline-default': 'neutral',
} as const;

const TABS = [
  { id: 'appearance', labelKey: 'settings.appearance', icon: <Palette size={14} aria-hidden /> },
  { id: 'providers', labelKey: 'settings.aiProviders', icon: <Sparkles size={14} aria-hidden /> },
  {
    id: 'data',
    labelKey: 'settings.dataSafety',
    icon: <ShieldCheck size={14} aria-hidden />,
  },
  { id: 'advanced', labelKey: 'settings.advanced', icon: <Sliders size={14} aria-hidden /> },
] as const satisfies readonly { id: string; labelKey: MessageKey; icon: ReactNode }[];

/**
 * The two languages the switch offers, and the automatic option between them.
 *
 * The labels are catalogue keys rather than strings, because this is the one control whose own wording has to
 * change as the result of using it: a switch that stayed in English while the interface became Persian would
 * be the first thing a Persian reader saw.
 */
const LANGUAGE_OPTION_KEYS: Readonly<Record<LanguagePreference, MessageKey>> = {
  auto: 'settings.languageAutomatic',
  fa: 'settings.languagePersian',
  en: 'settings.languageEnglish',
};

export function SettingsPage() {
  const [tab, setTab] = useState<string>('appearance');
  const direction = useUiStore((state) => state.direction);
  const setDirection = useUiStore((state) => state.setDirection);
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);
  const languagePreference = useUiStore((state) => state.languagePreference);
  const languageStorable = useUiStore((state) => state.languageStorable);
  const setLanguagePreference = useUiStore((state) => state.setLanguagePreference);
  const shell = useShellStatus();

  return (
    <Workspace
      title={msg('settings.settings')}
      description={msg('settingsPage.appearanceDirectionProvidersAndTheSafetyPostureOf')}
    >
      <Tabs
        items={TABS.map((item) => ({
          id: item.id,
          label: msg(item.labelKey),
          icon: item.icon,
        }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('settings.settingsSections')}
      >
        <TabPanel value="appearance" className="space-y-4">
          <Grid columns={2}>
            <Card surface="utility">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('settings.writingDirection')}</CardTitle>
                  <CardDescription>
                    {msg('settings.theLayoutUsesLogicalPropertiesSo')}
                  </CardDescription>
                </div>
                <Layers size={15} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant={direction === 'ltr' ? 'primary' : 'secondary'}
                    onClick={() => setDirection('ltr')}
                    aria-pressed={direction === 'ltr'}
                  >
                    {msg('settings.leftToRight')}
                  </Button>
                  <Button
                    variant={direction === 'rtl' ? 'primary' : 'secondary'}
                    onClick={() => setDirection('rtl')}
                    aria-pressed={direction === 'rtl'}
                  >
                    {msg('settings.rightToLeft')}
                  </Button>
                </div>
                <p className="text-caption text-text-faint">
                  {msg('settings.chartsAndNumericReadoutsStayLTR')}
                </p>
              </CardContent>
            </Card>

            <Card surface="utility">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('settings.language')}</CardTitle>
                  <CardDescription>{msg('settings.theLanguageTheAgentAnswersIn')}</CardDescription>
                </div>
                <Languages size={15} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {LANGUAGE_PREFERENCES.map((option) => (
                    <Button
                      key={option}
                      variant={languagePreference === option ? 'primary' : 'secondary'}
                      onClick={() => setLanguagePreference(option)}
                      aria-pressed={languagePreference === option}
                    >
                      {msg(LANGUAGE_OPTION_KEYS[option])}
                    </Button>
                  ))}
                </div>
                <p className="text-caption text-text-faint">
                  {languagePreference === 'auto'
                    ? msg('settings.languageAutomaticCaption')
                    : msg('settings.languageChosen', {
                        language: msg(LANGUAGE_OPTION_KEYS[languagePreference]),
                      })}
                  {languageStorable ? '' : msg('settings.languageNotStorable')}
                </p>
              </CardContent>
            </Card>

            <Card surface="utility">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('settings.density')}</CardTitle>
                  <CardDescription>{msg('settings.howMuchOfTheWorkspaceIs')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant={density === 'comfortable' ? 'primary' : 'secondary'}
                    onClick={() => setDensity('comfortable')}
                    aria-pressed={density === 'comfortable'}
                  >
                    {msg('settings.comfortable')}
                  </Button>
                  <Button
                    variant={density === 'compact' ? 'primary' : 'secondary'}
                    onClick={() => setDensity('compact')}
                    aria-pressed={density === 'compact'}
                  >
                    {msg('settings.compact')}
                  </Button>
                </div>
                <p className="text-caption text-text-faint">
                  {msg('settings.desktopFirstTheLayoutTargets1280px')}
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('settings.theme')}</CardTitle>
                <CardDescription>
                  {THEME.name} · {THEME.mode}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  ['--color-primary', msg('shell.navPrimary')],
                  ['--color-info', msg('settingsPage.info')],
                  ['--color-ai', 'AI'],
                  ['--color-warning', msg('feedbackStates.warning')],
                  ['--color-danger', msg('settingsPage.danger')],
                ].map(([token, label]) => (
                  <CardTile space="tight" key={token} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-4 w-4 rounded-[4px]"
                      style={{ backgroundColor: `var(${token})` }}
                    />
                    <span className="text-caption text-text-muted">{label}</span>
                    <span className="num text-caption text-text-faint">{token}</span>
                  </CardTile>
                ))}
              </div>
              <p className="text-caption text-text-faint">{THEME.notes}</p>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="providers" className="space-y-4">
          {/*
            The host card comes first because it decides what the rest of this tab
            can honestly claim: without the desktop shell there is no keychain to
            store a key in, and the provider rows below say so.
          */}
          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('settings.desktopHost')}</CardTitle>
                <CardDescription>
                  {shell.loading
                    ? 'Asking the host what it can do…'
                    : shell.inShell
                      ? `Running in the desktop shell · ${shell.status?.platform ?? 'unknown platform'} · v${shell.status?.appVersion ?? '?'}`
                      : 'Running in a browser: no OS keychain, no offline cache and no local API'}
                </CardDescription>
              </div>
              <Monitor size={15} aria-hidden className="text-text-faint" />
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ReadOnlyValue
                label={msg('settingsPage.localAPI')}
                value={
                  shell.status?.apiBaseUrl
                    ? `${shell.status.apiBaseUrl} · ${shell.processState}`
                    : shell.inShell
                      ? `not running (${shell.processState})`
                      : 'not available in a browser'
                }
                hint={msg('settingsPage.theBundledAPIBinds127001OnlyOnA')}
              />
              <ReadOnlyValue
                label={msg('settingsPage.credentialStore')}
                value={
                  shell.inShell
                    ? 'OS keychain'
                    : 'unavailable here — keys can only be entered in the desktop app'
                }
                hint={msg('settingsPage.windowsCredentialManagerMacOSKeychainOrSecretService')}
              />
              <ReadOnlyValue
                label={msg('settingsPage.offlineCache')}
                value={
                  shell.inShell
                    ? 'app-data directory, bounded to 4 MB'
                    : 'not available in a browser'
                }
                hint={msg('settingsPage.lessonContentAndLastKnownStatusSurviveWithoutA')}
              />
              <ReadOnlyValue
                label={msg('settingsPage.shellProtocol')}
                value={
                  shell.status
                    ? `v${shell.status.protocolVersion} · ${shell.status.capabilities.length} capabilities`
                    : shell.error
                      ? `host did not answer: ${shell.error}`
                      : 'unknown'
                }
                hint={msg('settingsPage.aProtocolMismatchIsRefusedRatherThanGuessed')}
              />
              {(shell.status?.unavailable.length ?? 0) > 0 && (
                <ul className="mt-2 space-y-1">
                  {shell.status?.unavailable.map((entry) => (
                    <li key={entry.capability} className="text-caption text-warning">
                      {entry.capability}: {entry.reason}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardDivider />
            <CardContent className="pt-3 text-caption text-text-faint">
              {msg('settings.theShellGrantsTheInterfaceNo')}
            </CardContent>
          </Card>

          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('settings.modelProviders')}</CardTitle>
                <CardDescription>{msg('settings.providerSpecificCodeLivesOnlyIn')}</CardDescription>
              </div>
              <KeyRound size={15} aria-hidden className="text-text-faint" />
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {mockProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-body text-text">{provider.label}</span>
                      <Badge tone={PROVIDER_TONE[provider.state]} dot>
                        {provider.state}
                      </Badge>
                    </div>
                    <p className="num mt-0.5 text-caption text-text-faint">{provider.secretRef}</p>
                    <p className="mt-0.5 text-caption text-text-muted">{provider.note}</p>
                  </div>
                  <Tooltip content={msg('settingsPage.keyEntryArrivesWithTheDesktopShellOS')}>
                    <span>
                      <Button variant="secondary" size="sm" disabled>
                        {provider.state === 'missing' ? 'Add key' : 'Manage'}
                      </Button>
                    </span>
                  </Tooltip>
                </div>
              ))}
            </CardContent>
            <CardDivider />
            <CardContent className="pt-3 text-caption text-text-faint">
              {msg('settings.theGatewayOwnsFallbackOrderRetries')}
            </CardContent>
          </Card>

          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('settings.budget')}</CardTitle>
                <CardDescription>
                  ${mockSystemStatus.llmBudgetUsedUsd.toFixed(2)} of $25.00 used this month
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockBudget.map((row) => (
                <div key={row.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-caption">
                    <span className="text-text-muted">{row.label}</span>
                    <span className="num text-text-faint">
                      {row.spent} / {row.budget}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(row.share * 100)}
                    aria-label={`${row.label} budget share`}
                    className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
                  >
                    <div
                      className={cn('h-full rounded-[var(--radius-pill)] bg-primary')}
                      style={{ width: `${Math.min(row.share * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="data" className="space-y-4">
          <Card surface="featured">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('shell.safetyPosture')}</CardTitle>
                <CardDescription>{msg('settings.enforcedInCodeAndCoveredBy')}</CardDescription>
              </div>
              <ShieldCheck size={15} aria-hidden className="text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Grid columns={2}>
                <ReadOnlyValue
                  label={msg('settingsPage.operatingMode')}
                  value={mockSystemStatus.safety.mode}
                />
                <ReadOnlyValue
                  label={msg('shell.liveTrading')}
                  value="disabled by design"
                  hint={msg('settingsPage.noOperationToolJobKindOrConfigKey')}
                />
                <ReadOnlyValue
                  label={msg('shell.brokerExecution')}
                  value="disabled by design"
                  hint={msg('settingsPage.theTypeSystemHasNoTrueValueFor')}
                />
                <ReadOnlyValue
                  label={msg('settingsPage.modelDirectToolExecution')}
                  value="forbidden"
                  hint={msg('settingsPage.toolExecutionAlwaysPassesThroughTheOrchestratorSPerm')}
                />
              </Grid>
              <p className="text-caption text-text-faint">
                {msg('settings.theseAreStartUpAssertionsNot')}
              </p>
            </CardContent>
          </Card>

          <Grid columns={2}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('settings.dataProvenancePolicy')}</CardTitle>
              </CardHeader>
              {/*
                Three policies, three marks. They are statements the product guarantees rather
                than actions to take, which is exactly the reference's checked list.
              */}
              <CardContent>
                <AgentCardList>
                  <AgentCardItem badge={<AgentCheck />}>
                    {msg('settings.syntheticTrainingDataMustBeLabelled')}
                  </AgentCardItem>
                  <AgentCardItem badge={<AgentCheck />}>
                    {msg('settings.historicalDataIsStatedAsHistorical')}
                  </AgentCardItem>
                  <AgentCardItem badge={<AgentCheck />}>
                    {msg('settings.unverifiedMemoryEntersContextAsUncertainty')}
                  </AgentCardItem>
                </AgentCardList>
              </CardContent>
            </Card>
            <Card tone="sunken">
              {/*
                A well still names itself. The label was a bare `<span>` beside an icon, which is
                why this card read as the one panel on the page with no head — a rule under a
                `CardTitle` is what tells a reader where the panel starts.
              */}
              <CardHeader divider>
                <div className="flex min-w-0 items-center gap-2">
                  <Database size={15} aria-hidden className="text-text-faint" />
                  <CardTitle className="text-caption">{msg('settings.localData')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <ReadOnlyValue
                  label={msg('settingsPage.database')}
                  value="data/master-trade.db"
                  hint={msg('settingsPage.sQLiteWALMode')}
                />
                <ReadOnlyValue
                  label={msg('settingsPage.fileStorage')}
                  value="data/files"
                  hint={msg('settingsPage.contentAddressedBlobs')}
                />
                <p className="text-caption text-text-faint">
                  {msg('settings.nothingIsStoredInABrowser')}
                </p>
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="advanced" className="space-y-4">
          <Card surface="utility">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('settings.backgroundJobs')}</CardTitle>
                <CardDescription>{msg('settings.queueStatesTheDurableWorkerLoop')}</CardDescription>
              </div>
              <Badge tone="outline">{msg('settings.sampleRows')}</Badge>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {mockSystemStatus.jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="num w-14 shrink-0 text-caption text-text-faint">{job.id}</span>
                  <span className="min-w-0 flex-1 truncate text-body text-text">{job.kind}</span>
                  <span className="num text-caption text-text-faint">
                    {msg('realtime.attempt')} {job.attempts}
                  </span>
                  <Badge tone={job.status === 'succeeded' ? 'primary' : 'info'}>{job.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Grid columns={2}>
            <Card surface="utility">
              <CardHeader divider>
                <CardTitle className="text-body">{msg('settings.configuration')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ReadOnlyValue
                  label={msg('settingsPage.aPIVersion')}
                  value="v1"
                  hint={msg('settingsPage.breakingChangesAddAVersion')}
                />
                <ReadOnlyValue
                  label={msg('settingsPage.realtimePath')}
                  value="/ws"
                  hint={msg('settingsPage.authenticatedWebSocketLoopbackOnlyTheActivityPageOpe')}
                />
                <ReadOnlyValue label={msg('settingsPage.auditRetention')} value="365 days" />
              </CardContent>
            </Card>
            <Card surface="utility">
              <CardHeader divider>
                <CardTitle className="text-body">{msg('settings.secrets')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>{msg('settings.configurationStoresReferencesSuchAsKeychain')}</p>
                <p>{msg('settings.logsRedactCredentialsRecursivelyBeforeAnything')}</p>
                <p>{msg('settings.thisInterfaceNeverDisplaysASecret')}</p>
              </CardContent>
            </Card>
          </Grid>

          <InterfaceStatesPanel
            states={['loading', 'empty', 'error']}
            title={msg('settings.interfaceStatesAllThree')}
            description={msg('settingsPage.everyDataSurfaceInThisWorkstationOwesYou')}
            loadingTitle={msg('settingsPage.readingConfiguration')}
            loadingDescription={msg('settingsPage.aSkeletonHoldsTheLayoutWhileSettingsAre')}
            emptyTitle={msg('settingsPage.nothingConfiguredYet')}
            emptyDescription={msg('settingsPage.aFreshInstallHasNoProvidersAndNo')}
            errorTitle={msg('settingsPage.configurationCouldNotBeRead')}
            errorDescription={msg('settingsPage.aFailedReadReportsItsTypedCodeAnd')}
            errorCode="UNAUTHENTICATED"
            hint={msg('settingsPage.aStateIsOnlyShownWhenASurface')}
          />

          <FeedbackStatesPanel
            description={msg('settingsPage.theSixThingsThisWorkstationCanSayBack')}
          />
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
