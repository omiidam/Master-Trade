import { useState } from 'react';
import {
  Database,
  KeyRound,
  Layers,
  Monitor,
  Palette,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/Card';
import { ReadOnlyValue } from '../components/Input';
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import { THEME } from '../design/tokens';
import { useShellStatus } from '../desktop/useShellStatus';
import { mockBudget, mockProviders, mockSystemStatus } from '../mock/data';
import { useUiStore } from '../store/ui';
import { cn } from '../lib/cn';

const PROVIDER_TONE = {
  configured: 'primary',
  missing: 'warning',
  'offline-default': 'neutral',
} as const;

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} aria-hidden /> },
  { id: 'providers', label: 'AI providers', icon: <Sparkles size={14} aria-hidden /> },
  { id: 'data', label: 'Data & safety', icon: <ShieldCheck size={14} aria-hidden /> },
  { id: 'advanced', label: 'Advanced', icon: <Sliders size={14} aria-hidden /> },
] as const;

export function SettingsPage() {
  const [tab, setTab] = useState<string>('appearance');
  const direction = useUiStore((state) => state.direction);
  const setDirection = useUiStore((state) => state.setDirection);
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);
  const shell = useShellStatus();

  return (
    <Workspace
      title="Settings"
      description="Appearance, direction, providers and the safety posture of the workstation. Secrets live in the OS keychain — configuration holds references only."
    >
      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Settings sections"
      >
        <TabPanel value="appearance" className="space-y-4">
          <Grid columns={2}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Writing direction</CardTitle>
                  <CardDescription>
                    The layout uses logical properties, so mirroring needs no second stylesheet
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
                    Left to right
                  </Button>
                  <Button
                    variant={direction === 'rtl' ? 'primary' : 'secondary'}
                    onClick={() => setDirection('rtl')}
                    aria-pressed={direction === 'rtl'}
                  >
                    Right to left
                  </Button>
                </div>
                <p className="text-caption text-text-faint">
                  Charts and numeric readouts stay LTR on purpose: financial time series are read
                  left-to-right.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-body">Density</CardTitle>
                  <CardDescription>How much of the workspace is used by chrome</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant={density === 'comfortable' ? 'primary' : 'secondary'}
                    onClick={() => setDensity('comfortable')}
                    aria-pressed={density === 'comfortable'}
                  >
                    Comfortable
                  </Button>
                  <Button
                    variant={density === 'compact' ? 'primary' : 'secondary'}
                    onClick={() => setDensity('compact')}
                    aria-pressed={density === 'compact'}
                  >
                    Compact
                  </Button>
                </div>
                <p className="text-caption text-text-faint">
                  Desktop-first: the layout targets 1280px and above and reflows below.
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Theme</CardTitle>
                <CardDescription>
                  {THEME.name} · {THEME.mode}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  ['--color-primary', 'Primary'],
                  ['--color-info', 'Info'],
                  ['--color-ai', 'AI'],
                  ['--color-warning', 'Warning'],
                  ['--color-danger', 'Danger'],
                ].map(([token, label]) => (
                  <div
                    key={token}
                    className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-2.5 py-1.5"
                  >
                    <span
                      aria-hidden
                      className="h-4 w-4 rounded-[4px]"
                      style={{ backgroundColor: `var(${token})` }}
                    />
                    <span className="text-caption text-text-muted">{label}</span>
                    <span className="num text-caption text-text-faint">{token}</span>
                  </div>
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
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Desktop host</CardTitle>
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
                label="Local API"
                value={
                  shell.status?.apiBaseUrl
                    ? `${shell.status.apiBaseUrl} · ${shell.processState}`
                    : shell.inShell
                      ? `not running (${shell.processState})`
                      : 'not available in a browser'
                }
                hint="The bundled API binds 127.0.0.1 only, on a fixed port, with a per-launch token."
              />
              <ReadOnlyValue
                label="Credential store"
                value={
                  shell.inShell
                    ? 'OS keychain'
                    : 'unavailable here — keys can only be entered in the desktop app'
                }
                hint="Windows Credential Manager, macOS Keychain or Secret Service. Never a file."
              />
              <ReadOnlyValue
                label="Offline cache"
                value={
                  shell.inShell
                    ? 'app-data directory, bounded to 4 MB'
                    : 'not available in a browser'
                }
                hint="Lesson content and last-known status survive without a network."
              />
              <ReadOnlyValue
                label="Shell protocol"
                value={
                  shell.status
                    ? `v${shell.status.protocolVersion} · ${shell.status.capabilities.length} capabilities`
                    : shell.error
                      ? `host did not answer: ${shell.error}`
                      : 'unknown'
                }
                hint="A protocol mismatch is refused rather than guessed at."
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
            <CardContent className="border-t border-border pt-3 text-caption text-text-faint">
              The shell grants the interface no filesystem, path, shell or network permission. Every
              privileged action — the keychain, the cache, exports, the bundled API process — is a
              typed command implemented in Rust, and the allow-list is verified in CI.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Model providers</CardTitle>
                <CardDescription>
                  Provider-specific code lives only in the adapter layer
                </CardDescription>
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
                  <Tooltip content="Key entry arrives with the desktop shell (OS keychain), not the web preview.">
                    <span>
                      <Button variant="secondary" size="sm" disabled>
                        {provider.state === 'missing' ? 'Add key' : 'Manage'}
                      </Button>
                    </span>
                  </Tooltip>
                </div>
              ))}
            </CardContent>
            <CardContent className="border-t border-border pt-3 text-caption text-text-faint">
              The gateway owns fallback order, retries, timeouts and budget refusal. A provider can
              fail without the permission model changing: the model may request a tool, never run
              one.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Budget</CardTitle>
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
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Safety posture</CardTitle>
                <CardDescription>
                  Enforced in code and covered by tests, not a setting
                </CardDescription>
              </div>
              <ShieldCheck size={15} aria-hidden className="text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Grid columns={2}>
                <ReadOnlyValue label="Operating mode" value={mockSystemStatus.safety.mode} />
                <ReadOnlyValue
                  label="Live trading"
                  value="disabled by design"
                  hint="No operation, tool, job kind or config key exists for it."
                />
                <ReadOnlyValue
                  label="Broker execution"
                  value="disabled by design"
                  hint="The type system has no true value for this flag."
                />
                <ReadOnlyValue
                  label="Model-direct tool execution"
                  value="forbidden"
                  hint="Tool execution always passes through the orchestrator's permission check."
                />
              </Grid>
              <p className="text-caption text-text-faint">
                These are start-up assertions, not preferences: the process refuses to start if any
                of them is ever switched on.
              </p>
            </CardContent>
          </Card>

          <Grid columns={2}>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Data provenance policy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>Synthetic training data must be labelled wherever it appears.</p>
                <p>
                  Historical data is stated as historical; live data is not permitted in training.
                </p>
                <p>Unverified memory enters context as uncertainty, never as fact.</p>
              </CardContent>
            </Card>
            <Card tone="sunken">
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database size={15} aria-hidden className="text-text-faint" />
                  <span className="text-caption font-medium text-text">Local data</span>
                </div>
                <ReadOnlyValue
                  label="Database"
                  value="data/master-trade.db"
                  hint="SQLite, WAL mode."
                />
                <ReadOnlyValue
                  label="File storage"
                  value="data/files"
                  hint="Content-addressed blobs."
                />
                <p className="text-caption text-text-faint">
                  Nothing is stored in a browser or sent anywhere in this phase.
                </p>
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Background jobs</CardTitle>
                <CardDescription>
                  Queue states. The durable worker loop exists; the Activity page reads the real
                  queue whenever a session is available, and shows these fixtures only when it is
                  not.
                </CardDescription>
              </div>
              <Badge tone="outline">sample rows</Badge>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {mockSystemStatus.jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="num w-14 shrink-0 text-caption text-text-faint">{job.id}</span>
                  <span className="min-w-0 flex-1 truncate text-body text-text">{job.kind}</span>
                  <span className="num text-caption text-text-faint">attempt {job.attempts}</span>
                  <Badge tone={job.status === 'succeeded' ? 'primary' : 'info'}>{job.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Grid columns={2}>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ReadOnlyValue
                  label="API version"
                  value="v1"
                  hint="Breaking changes add a version."
                />
                <ReadOnlyValue
                  label="Realtime path"
                  value="/ws"
                  hint="Authenticated WebSocket, loopback only. The Activity page opens it when a session exists."
                />
                <ReadOnlyValue label="Audit retention" value="365 days" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Secrets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>
                  Configuration stores references such as keychain:llm.openai, never key values.
                </p>
                <p>Logs redact credentials recursively before anything is written.</p>
                <p>This interface never displays a secret, not even masked.</p>
              </CardContent>
            </Card>
          </Grid>

          <InterfaceStatesPanel
            states={['loading', 'empty', 'error']}
            title="Interface states, all three"
            description="Every data surface in this workstation owes you these three. They are the real components, shown empty: no placeholder number stands in for a value that has not been read."
            loadingTitle="Reading configuration"
            loadingDescription="A skeleton holds the layout while settings are read from disk or from the shell, so nothing jumps when they arrive."
            emptyTitle="Nothing configured yet"
            emptyDescription="A fresh install has no providers and no stored references; that is a normal state and says so rather than showing an error."
            errorTitle="Configuration could not be read"
            errorDescription="A failed read reports its typed code, and a retry is offered only when retrying can succeed — never for a refused credential."
            errorCode="UNAUTHENTICATED"
            hint="A state is only shown when a surface can actually reach it; adding a fourth state here would mean adding a behaviour, not a picture."
          />
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
