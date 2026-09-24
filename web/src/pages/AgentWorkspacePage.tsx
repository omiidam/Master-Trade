import { useState } from 'react';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Database,
  Gavel,
  Globe,
  Grid2x2Plus,
  Info,
  Paperclip,
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react';
import {
  AgentBadge,
  AgentCard,
  AgentCardItem,
  AgentCardList,
  AgentCheck,
  type ComposerTool,
  MessageComposer,
} from '../components/agent';
import { Badge, EpistemicBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { ReadOnlyValue } from '../components/Input';
import { Reveal } from '../components/Reveal';
import { Workspace } from '../app/Workspace';
import {
  EPISTEMIC_LABEL,
  MOCK_DATA_NOTICE,
  mockConversation,
  mockSystemStatus,
} from '../mock/data';
import { formatTimestamp } from '../lib/format';
import { useUiStore } from '../store/ui';

/**
 * The composer's tools, stated as data so each one carries why it is not available.
 *
 * None of these exists in this build, and that is the point: they are drawn disabled and explained
 * rather than omitted, because the composer's shape is part of the design — and a tool that appears
 * the moment it works is worse than one that was never there.
 */
const COMPOSER_TOOLS: readonly ComposerTool[] = [
  {
    label: 'Attach a file',
    icon: <Paperclip size={15} aria-hidden />,
    blockedReason: 'Attachments are not part of this build.',
  },
  {
    label: 'Add an integration',
    icon: <Grid2x2Plus size={15} aria-hidden />,
    blockedReason:
      'The tool registry is declared in the backend. Nothing on this screen can widen it.',
  },
  {
    label: 'Fetch from the web',
    icon: <Globe size={15} aria-hidden />,
    blockedReason: 'The agent calls deterministic local tools only. It has no network access.',
  },
];

/** Examples of what the surface is for. Labels, not shortcuts — see `MessageComposer`. */
const COMPOSER_EXAMPLES: readonly string[] = [
  'Size a position from a 1% risk budget',
  'Why was this rule proposal rejected?',
  'Review my last journal entry',
];

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
            <CardHeader divider>
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
                    <Card
                      as="article"
                      tone={isAgent ? 'sunken' : 'default'}
                      emphasis={isAgent ? 'none' : 'info'}
                      wash={!isAgent}
                      className="p-3.5"
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
                    </Card>
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
            <CardContent>
              <MessageComposer
                label="Message to the training agent"
                value={draft}
                onValueChange={setDraft}
                tools={COMPOSER_TOOLS}
                examples={COMPOSER_EXAMPLES}
                blockedReason="Sending is disabled: no provider is registered, and the interface must not imply a working model. The agent may request tools, but only the orchestrator runs them, after a permission check, and every result is recorded with provenance."
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <AgentCard
            title="Run context"
            description="What the orchestrator would assemble"
            icon={<Cpu size={15} aria-hidden />}
          >
            <div className="flex flex-col gap-3">
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
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-caption font-medium text-text-muted">Context sections</p>
              <AgentCardList>
                {[
                  'Instructions — versioned, never dropped',
                  'Memory — provenance required, unverified labelled uncertainty',
                  'History — recent turns under a token budget',
                  'Data — market data with a mandatory provenance label',
                ].map((section) => (
                  <AgentCardItem key={section} badge={<AgentCheck />}>
                    {section}
                  </AgentCardItem>
                ))}
              </AgentCardList>
            </div>
          </AgentCard>

          <AgentCard
            title="Tool request path"
            description="Model output never becomes action directly"
            icon={<Wrench size={15} aria-hidden />}
          >
            <div className="flex flex-col gap-3">
              {/* A sequence, drawn as a sequence: check marks would say each step had already
                  happened. The badge geometry is identical to the other cards, so the family holds
                  together without pretending a pipeline is a list of results. */}
              <AgentCardList ordered>
                {[
                  'Model returns a tool-call request (arguments only).',
                  'Orchestrator checks the operation against the permission table.',
                  'Allowed: the deterministic tool runs and its result is recorded with provenance.',
                  'Denied: the run is blocked with a reason, and the attempt stays visible in the audit trail.',
                ].map((step, index) => (
                  <AgentCardItem
                    key={step}
                    badge={
                      <AgentBadge tone="neutral">
                        <span className="num text-micro">{index + 1}</span>
                      </AgentBadge>
                    }
                  >
                    {step}
                  </AgentCardItem>
                ))}
              </AgentCardList>

              <p className="text-caption text-text-faint">
                The gateway holds no tool registry and exposes no execution method.
              </p>
            </div>
          </AgentCard>

          {/* The one active ring on the screen: this is the card that is waiting for a decision, and
              a sweeping light is how a screen says "here" without a second badge. */}
          <AgentCard
            ring="active"
            title="Rule proposals"
            description="Idea → evaluation → human approval"
            icon={<Gavel size={15} aria-hidden />}
            action={
              <Button
                variant="primary"
                shape="pill"
                fullWidth
                size="sm"
                onClick={() => setPage('research')}
              >
                Review the research queue
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              <AgentCardList>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="accent">
                      <CheckCircle2 size={10} />
                    </AgentBadge>
                  }
                >
                  Proposed rule
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="info">
                      <BrainCircuit size={10} />
                    </AgentBadge>
                  }
                >
                  Deterministic evaluation attached
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="warning">
                      <Gavel size={10} />
                    </AgentBadge>
                  }
                >
                  Awaiting your approval — self-approval is rejected
                </AgentCardItem>
              </AgentCardList>

              <p className="text-caption text-text-faint">
                Activation is impossible without a recorded human approval; automation cannot
                self-authorize.
              </p>
            </div>
          </AgentCard>

          <AgentCard
            title="Unchanged guarantees"
            description="What the agent cannot do, whatever it says"
            icon={<ShieldCheck size={15} aria-hidden />}
          >
            <div className="flex flex-col gap-3">
              <AgentCardList>
                {[
                  'Live trading: disabled',
                  'Broker execution: disabled',
                  'Model-authored memory can never become trusted knowledge',
                ].map((guarantee) => (
                  <AgentCardItem key={guarantee} badge={<AgentCheck />}>
                    <span className="inline-flex items-center gap-1.5">
                      <Database size={12} aria-hidden className="shrink-0 text-text-faint" />
                      {guarantee}
                    </span>
                  </AgentCardItem>
                ))}
              </AgentCardList>

              <p className="text-caption text-text-faint">{MOCK_DATA_NOTICE}</p>
            </div>
          </AgentCard>

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
