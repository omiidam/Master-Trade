import { useState } from 'react';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  Gavel,
  Info,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react';
import { Badge, EpistemicBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { Field, ReadOnlyValue, Textarea } from '../components/Input';
import { Reveal } from '../components/Reveal';
import { Tooltip } from '../components/Tooltip';
import { Workspace } from '../app/Workspace';
import {
  EPISTEMIC_LABEL,
  MOCK_DATA_NOTICE,
  mockConversation,
  mockSystemStatus,
} from '../mock/data';
import { formatTimestamp } from '../lib/format';
import { useUiStore } from '../store/ui';

export function AgentWorkspacePage() {
  const setPage = useUiStore((state) => state.setPage);
  const [draft, setDraft] = useState('');

  return (
    <Workspace
      title="AI workspace"
      description="Conversation with the training agent. Answers separate fact from analysis, hypothesis and uncertainty, and every number comes from a deterministic tool."
      actions={
        <>
          <Badge tone="ai" icon={<Sparkles size={12} aria-hidden />}>
            model not connected
          </Badge>
          <Badge tone="neutral">{mockSystemStatus.agentState}</Badge>
        </>
      }
    >
      {/* A responsive grid must declare a zero-minimum base track. Declaring it only at `xl`
          leaves the implicit `auto` track below that breakpoint, whose minimum is the item's
          min-content — so one long unbreakable label inside a card sets the page's *minimum*
          width and the document scrolls sideways on a phone. `grid-cols-1` is
          `minmax(0,1fr)`, the same minimum the `xl` template already declares. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <ErrorState
            severity="warning"
            title="No model provider is configured"
            description="The orchestrator, permission checks and tool registry are built, but no hosted provider is registered in this phase, so the conversation below is a static example."
            code="PROVIDER_UNAVAILABLE"
            action={
              <Button size="sm" variant="secondary" onClick={() => setPage('settings')}>
                Review provider settings
              </Button>
            }
          />

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Conversation</CardTitle>
                <CardDescription>
                  Each message shows its epistemic label and its sources
                </CardDescription>
              </div>
              <Badge tone="warning" dot>
                mock transcript
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockConversation.map((message, index) => {
                const isAgent = message.role === 'agent';
                return (
                  <Reveal key={message.id} index={index}>
                    <article
                      className={
                        isAgent
                          ? 'rounded-[var(--radius-panel)] border border-border bg-surface-sunken p-3.5'
                          : 'rounded-[var(--radius-panel)] border border-[#1b2c49] bg-info-soft/60 p-3.5'
                      }
                    >
                      <header className="flex flex-wrap items-center gap-2">
                        <span
                          aria-hidden
                          className={
                            isAgent
                              ? 'grid h-6 w-6 place-items-center rounded-full bg-ai-soft text-ai'
                              : 'grid h-6 w-6 place-items-center rounded-full bg-info-soft text-info'
                          }
                        >
                          {isAgent ? <Bot size={13} /> : <User size={13} />}
                        </span>
                        <span className="text-caption font-medium text-text">
                          {isAgent ? 'Training agent' : 'You'}
                        </span>
                        <EpistemicBadge kind={message.epistemicKind} />
                        <span className="num ms-auto text-caption text-text-faint">
                          {formatTimestamp(message.createdAt)}
                        </span>
                      </header>
                      <p className="mt-2 text-body leading-relaxed text-text">{message.text}</p>
                      {message.sources.length > 0 ? (
                        <footer className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-caption text-text-faint">Sources</span>
                          {message.sources.map((source) => (
                            <Badge key={source} tone="outline">
                              {source}
                            </Badge>
                          ))}
                        </footer>
                      ) : null}
                    </article>
                  </Reveal>
                );
              })}
            </CardContent>
          </Card>

          <InterfaceStatesPanel
            states={['loading', 'empty']}
            title="States a turn goes through"
            description="A turn is a round trip with a provider that may be slow, and a conversation can simply be new. Both are shown here as the real components the wired version will use."
            loadingTitle="Waiting for a structured answer"
            loadingDescription="While a turn is in flight the answer area holds its shape; no partial sentence is rendered, because a half-arrived claim can read as a finished one."
            emptyTitle="This conversation has no turns yet"
            emptyDescription="A new conversation says so, and what it will show: statements labelled fact, analysis, hypothesis or uncertainty, each with its sources."
            hint="Chain-of-thought is never displayed, requested or stored — the answer is a structured summary or a failed turn."
          />

          <Card>
            <CardContent className="space-y-3">
              <Field
                label="Message"
                hint="Sending is disabled: no provider is registered, and the interface must not imply a working model."
              >
                {({ id, 'aria-describedby': describedBy }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask about a lesson, a risk calculation or a past session…"
                    disabled
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-xl text-caption text-text-faint">
                  The agent may <em>request</em> tools; only the orchestrator runs them, after a
                  permission check, and results are recorded with provenance.
                </p>
                <Tooltip content="Phase 3.3 wires a real provider behind the LLM gateway.">
                  <span>
                    <Button variant="primary" disabled leadingIcon={<Send size={14} aria-hidden />}>
                      Send
                    </Button>
                  </span>
                </Tooltip>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Run context</CardTitle>
                <CardDescription>What the orchestrator would assemble</CardDescription>
              </div>
              <Cpu size={15} aria-hidden className="text-text-faint" />
            </CardHeader>
            <CardContent className="space-y-3">
              <ReadOnlyValue label="Agent lifecycle state" value={mockSystemStatus.agentState} />
              <ReadOnlyValue
                label="Provider"
                value="none registered"
                hint="Scripted offline adapter remains the deterministic default."
              />
              <ReadOnlyValue
                label="Budget used"
                value={`$${mockSystemStatus.llmBudgetUsedUsd.toFixed(2)} of $25.00`}
                hint="Requests are refused once the monthly budget is spent."
              />
              <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2">
                <p className="text-caption text-text-muted">Context sections</p>
                <ul className="mt-1 space-y-1 text-caption text-text-faint">
                  <li>Instructions — versioned, never dropped</li>
                  <li>Memory — provenance required, unverified labelled uncertainty</li>
                  <li>History — recent turns under a token budget</li>
                  <li>Data — market data with a mandatory provenance label</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Tool request path</CardTitle>
                <CardDescription>Model output never becomes action directly</CardDescription>
              </div>
              <Wrench size={15} aria-hidden className="text-text-faint" />
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-caption text-text-muted">
                {[
                  'Model returns a tool-call request (arguments only).',
                  'Orchestrator checks the operation against the permission table.',
                  'Allowed: the deterministic tool runs and its result is recorded with provenance.',
                  'Denied: the run is blocked with a reason, and the attempt stays visible in the audit trail.',
                ].map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="num shrink-0 text-text-faint">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-caption text-text-faint">
                The gateway holds no tool registry and exposes no execution method.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Rule proposals</CardTitle>
                <CardDescription>Idea → evaluation → human approval</CardDescription>
              </div>
              <Gavel size={15} aria-hidden className="text-text-faint" />
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-caption text-text-muted">
                <CheckCircle2 size={14} aria-hidden className="text-primary" />
                Proposed rule
              </div>
              <div className="flex items-center gap-2 text-caption text-text-muted">
                <BrainCircuit size={14} aria-hidden className="text-info" />
                Deterministic evaluation attached
              </div>
              <div className="flex items-center gap-2 text-caption text-text-muted">
                <Gavel size={14} aria-hidden className="text-warning" />
                Awaiting your approval — self-approval is rejected
              </div>
              <p className="text-caption text-text-faint">
                Activation is impossible without a recorded human approval; automation cannot
                self-authorize.
              </p>
            </CardContent>
          </Card>

          <Card tone="sunken">
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} aria-hidden className="text-primary" />
                <span className="text-caption font-medium text-text">Unchanged guarantees</span>
              </div>
              <ul className="space-y-1 text-caption text-text-muted">
                <li className="flex items-center gap-1.5">
                  <Database size={12} aria-hidden className="text-text-faint" />
                  Live trading: disabled
                </li>
                <li className="flex items-center gap-1.5">
                  <Database size={12} aria-hidden className="text-text-faint" />
                  Broker execution: disabled
                </li>
                <li className="flex items-center gap-1.5">
                  <Database size={12} aria-hidden className="text-text-faint" />
                  Model-authored memory can never become trusted knowledge
                </li>
              </ul>
              <p className="text-caption text-text-faint">{MOCK_DATA_NOTICE}</p>
            </CardContent>
          </Card>

          <p className="flex items-start gap-1.5 text-caption text-text-faint">
            <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
            Epistemic labels: {EPISTEMIC_LABEL.fact}, {EPISTEMIC_LABEL.analysis},{' '}
            {EPISTEMIC_LABEL.hypothesis}, {EPISTEMIC_LABEL.uncertainty}.
          </p>
        </aside>
      </div>
    </Workspace>
  );
}
