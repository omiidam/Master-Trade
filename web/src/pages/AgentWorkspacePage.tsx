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
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { ReadOnlyValue } from '../components/Input';
import { Reveal } from '../components/Reveal';
import { Workspace } from '../app/Workspace';
import { ApiError } from '../api/client.js';
import { clientForApiSession } from '../api/session.js';
import { EPISTEMIC_LABEL } from '../mock/data';
import { formatTimestamp } from '../lib/format';
import { useUiStore } from '../store/ui';
import { usePageView } from '../store/pageContext';
import { msg } from '../i18n/index.js';
import type { AgentChatData } from '@shared/api/contracts';
import type { EpistemicKind } from '@shared/types';

/**
 * The composer's tools, stated as data so each one carries why it is not available.
 *
 * None of these exists in this build, and that is the point: they are drawn disabled and explained
 * rather than omitted, because the composer's shape is part of the design — and a tool that appears
 * the moment it works is worse than one that was never there.
 */
const COMPOSER_TOOLS: readonly ComposerTool[] = [
  {
    get label(): string {
      return msg('agentWorkspacePage.attachAFile');
    },
    icon: <Paperclip size={15} aria-hidden />,
    get blockedReason(): string {
      return msg('agentWorkspacePage.attachmentsAreNotPartOfThisBuild');
    },
  },
  {
    get label(): string {
      return msg('agentWorkspacePage.addAnIntegration');
    },
    icon: <Grid2x2Plus size={15} aria-hidden />,
    get blockedReason(): string {
      return msg('agentWorkspacePage.theToolRegistryIsDeclaredInTheBackend');
    },
  },
  {
    get label(): string {
      return msg('agentWorkspacePage.fetchFromTheWeb');
    },
    icon: <Globe size={15} aria-hidden />,
    get blockedReason(): string {
      return msg('agentWorkspacePage.theAgentCallsDeterministicLocalToolsOnlyIt');
    },
  },
];

/** Examples of what the surface is for. Labels, not shortcuts — see `MessageComposer`. */
const COMPOSER_EXAMPLES: readonly string[] = [
  'Size a position from a 1% risk budget',
  'Why was this rule proposal rejected?',
  'Review my last journal entry',
];

/**
 * One turn of the live transcript.
 *
 * Every entry is something that actually happened: a message that was sent, an answer the
 * server returned, and — for an answer — the run the Run Manager tracked it under. Nothing
 * on this page is prewritten.
 */
interface AlphaTurn {
  id: string;
  role: 'user' | 'agent';
  text: string;
  epistemicKind: EpistemicKind;
  createdAt: string;
  sources: readonly string[];
  /** The server's identifiers and run facts, carried so the turn can show how it ran. */
  runId?: string;
  runState?: string;
  startedAt?: string;
  durationMs?: number | null;
  correlationId?: string;
  model?: string;
}

/** The server's epistemic label, with the honest fallback for a label we don't know. */
function asEpistemicKind(value: string): EpistemicKind {
  return value === 'fact' || value === 'analysis' || value === 'hypothesis' ? value : 'uncertainty';
}

/** Build the transcript entry for one answered turn, from the response the server sent. */
function turnFromResponse(data: AgentChatData, id: string): AlphaTurn {
  return {
    id,
    role: 'agent',
    text: data.reply,
    epistemicKind: asEpistemicKind(data.epistemicKind),
    createdAt: new Date().toISOString(),
    sources: [...new Set(data.statements.flatMap((statement) => statement.sources))],
    ...(data.run === undefined
      ? {}
      : {
          runId: data.run.runId,
          runState: data.run.state,
          startedAt: data.run.startedAt,
          durationMs: data.run.durationMs,
        }),
    correlationId: data.correlationId,
    model: data.model,
  };
}

/** A transport failure as one line the error surface can render verbatim. */
function describeFailure(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.describe()}`;
  return error instanceof Error ? error.message : 'The request failed without a reason.';
}

export function AgentWorkspacePage() {
  const setPage = useUiStore((state) => state.setPage);
  const [draft, setDraft] = usePageView<string>('agent', 'draft', '');
  const [turns, setTurns] = useState<readonly AlphaTurn[]>([]);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** The model label the last answer carried, until one has: null means not answered yet. */
  const [model, setModel] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<NonNullable<AgentChatData['run']> | null>(null);
  const [lastUsage, setLastUsage] = useState<NonNullable<AgentChatData['usage']> | null>(null);
  /**
   * This page's conversation identifier. One per open page, sent with every message, so the
   * transcript and the server's own records answer to the same name — the server reports the
   * per-turn correlation id and run id back, and both are shown rather than inferred.
   */
  const [conversationId] = useState(
    () => `conv_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
  );

  /**
   * Send the draft through the real pipeline: agent.chat → Run Manager → Agent Loop →
   * harness → adapter → provider gateway. The composer is locked while a turn is in flight
   * (one turn at a time), and a failure is reported as a failure — the transcript never
   * receives an answer that did not come back from the server.
   */
  const send = async () => {
    const message = draft.trim();
    if (message === '' || running) return;
    setRunning(true);
    setFailure(null);
    try {
      const client = await clientForApiSession();
      if ('reason' in client) {
        // Nothing was sent, so the draft stays exactly where the person left it.
        setFailure(client.reason);
        return;
      }
      const askedAt = new Date().toISOString();
      const userTurn: AlphaTurn = {
        id: `t-${askedAt}-${turns.length}`,
        role: 'user',
        text: message,
        epistemicKind: 'fact',
        createdAt: askedAt,
        sources: [],
      };
      setTurns((previous) => [...previous, userTurn]);
      setDraft('');
      const data = await client.agentChat({ message, conversationId });
      setTurns((previous) => [...previous, turnFromResponse(data, `t-${data.correlationId}`)]);
      setModel(data.model);
      setLastRun(data.run ?? null);
      setLastUsage(data.usage ?? null);
    } catch (error) {
      setFailure(describeFailure(error));
    } finally {
      setRunning(false);
    }
  };

  // The provider question is answered by the server, not guessed: an offline deterministic
  // adapter says so in its model label, and until an answer carries one the badge says it is
  // still checking rather than claiming either way.
  const offline = model === null ? null : /scripted|offline/i.test(model);
  const statusLabel = running ? 'RUNNING' : (lastRun?.state ?? 'idle');

  return (
    <Workspace
      actions={
        <>
          <Badge tone="ai" icon={<Sparkles size={12} aria-hidden />}>
            {model === null ? 'checking model' : offline ? 'model not connected' : model}
          </Badge>
          <Badge tone="neutral">{statusLabel}</Badge>
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
          {failure !== null ? (
            <ErrorState
              severity="warning"
              title="The last message did not get an answer"
              description={failure}
              code="REQUEST_FAILED"
              action={
                <Button size="sm" variant="secondary" onClick={() => setFailure(null)}>
                  Dismiss
                </Button>
              }
            />
          ) : null}

          {offline === true ? (
            <ErrorState
              severity="warning"
              title={msg('agent.noModelProviderIsConfigured')}
              description={msg(
                'agentWorkspacePage.theOrchestratorPermissionChecksAndToolRegistryAre',
              )}
              code="PROVIDER_UNAVAILABLE"
              action={
                <Button size="sm" variant="secondary" onClick={() => setPage('settings')}>
                  Review provider settings
                </Button>
              }
            />
          ) : null}

          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('agent.conversation')}</CardTitle>
                <CardDescription>{msg('agent.eachMessageShowsItsEpistemicLabel')}</CardDescription>
              </div>
              <Badge tone="outline">{conversationId}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Execution, as the server reports it: the run's own state while a turn is in
                  flight, and the recorded terminal state after it. The pipeline line is what
                  this alpha surface exists to make visible — the request's actual path. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-caption">
                <span className="font-medium text-text">Agent status:</span>
                <Badge tone={running ? 'ai' : 'neutral'} dot={running}>
                  {statusLabel}
                </Badge>
                <span className="font-medium text-text">Pipeline:</span>
                <span className="text-text-faint">Agent Loop → LLM Gateway → Response</span>
              </div>

              {turns.length === 0 ? (
                <EmptyState
                  title="No turns yet"
                  description="Ask about a trading concept, market structure or risk management. Nothing on this page is prewritten: every answer below comes from the server's agent pipeline, tracked as a run."
                />
              ) : (
                turns.map((message, index) => {
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
                        {/*
                          `dir="auto"` on the body: a turn is written in the language whoever wrote it chose,
                          which is not always the language the interface is being read in. The transcript keeps
                          its own order either way — the bubble stays where the flow puts it — and only the
                          paragraph's *internal* direction follows its first strong character.
                        */}
                        <p dir="auto" className="mt-2 text-body leading-relaxed text-text">
                          {message.text}
                        </p>
                        {message.sources.length > 0 ? (
                          <footer className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-caption text-text-faint">
                              {msg('agent.sources')}
                            </span>
                            {message.sources.map((source) => (
                              <Badge key={source} tone="outline">
                                {source}
                              </Badge>
                            ))}
                          </footer>
                        ) : null}
                        {/* How this answer ran, exactly as the Run Manager recorded it: run id,
                            terminal state, duration and the correlation id that ties the turn to
                            the server's own log. Facts from the record, never derived here. */}
                        {isAgent && message.runId !== undefined ? (
                          <footer className="num mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-text-faint">
                            <span>run {message.runId}</span>
                            <span aria-hidden>·</span>
                            <span>{message.runState}</span>
                            {message.durationMs != null ? (
                              <>
                                <span aria-hidden>·</span>
                                <span>{message.durationMs} ms</span>
                              </>
                            ) : null}
                            {message.correlationId !== undefined ? (
                              <>
                                <span aria-hidden>·</span>
                                <span>{message.correlationId}</span>
                              </>
                            ) : null}
                          </footer>
                        ) : null}
                      </Card>
                    </Reveal>
                  );
                })
              )}
            </CardContent>
          </Card>

          <InterfaceStatesPanel
            states={['loading', 'empty']}
            title={msg('agent.statesATurnGoesThrough')}
            description={msg('agentWorkspacePage.aTurnIsARoundTripWithA')}
            loadingTitle={msg('agentWorkspacePage.waitingForAStructuredAnswer')}
            loadingDescription={msg('agentWorkspacePage.whileATurnIsInFlightTheAnswer')}
            emptyTitle={msg('agentWorkspacePage.thisConversationHasNoTurnsYet')}
            emptyDescription={msg('agentWorkspacePage.aNewConversationSaysSoAndWhatIt')}
            hint={msg('agentWorkspacePage.chainOfThoughtIsNeverDisplayedRequestedOrStored')}
          />

          <Card>
            <CardContent>
              <MessageComposer
                label={msg('agentWorkspacePage.messageToTheTrainingAgent')}
                value={draft}
                onValueChange={setDraft}
                tools={COMPOSER_TOOLS}
                examples={COMPOSER_EXAMPLES}
                {...(running
                  ? {
                      blockedReason:
                        'The agent is running this turn. The composer returns when it answers.',
                    }
                  : {})}
                onSubmit={send}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <AgentCard
            title={msg('agent.runContext')}
            description={msg('agentWorkspacePage.whatTheOrchestratorWouldAssemble')}
            icon={<Cpu size={15} aria-hidden />}
          >
            <div className="flex flex-col gap-3">
              <ReadOnlyValue
                label={msg('agentWorkspacePage.agentLifecycleState')}
                value={statusLabel}
              />
              <ReadOnlyValue
                label={msg('agentWorkspacePage.provider')}
                value={model ?? 'not answered yet'}
                hint={msg(
                  'agentWorkspacePage.scriptedOfflineAdapterRemainsTheDeterministicDefault',
                )}
              />
              <ReadOnlyValue label="Conversation" value={conversationId} />
              <ReadOnlyValue
                label="Last run"
                value={lastRun?.runId ?? 'no run yet'}
                hint={
                  lastRun === null
                    ? 'Every chat turn becomes a tracked run with an id, a state and a start time.'
                    : `state ${lastRun.state} · started ${lastRun.startedAt}${
                        lastRun.durationMs != null ? ` · ${lastRun.durationMs} ms` : ''
                      }`
                }
              />
              <ReadOnlyValue
                label="Turns metered"
                value={
                  lastUsage === null
                    ? 'no metered turn yet'
                    : `${lastUsage.balance} credits after the last turn`
                }
                hint={msg('agentWorkspacePage.requestsAreRefusedOnceTheMonthlyBudgetIs')}
              />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-caption font-medium text-text-muted">
                {msg('agent.contextSections')}
              </p>
              <AgentCardList>
                {[
                  msg('agentWorkspacePage.instructionsVersionedNeverDropped'),
                  msg('agentWorkspacePage.memoryProvenanceRequiredUnverifiedLabelledUncertaint'),
                  msg('agentWorkspacePage.historyRecentTurnsUnderATokenBudget'),
                  msg('agentWorkspacePage.dataMarketDataWithAMandatoryProvenance'),
                ].map((section) => (
                  <AgentCardItem key={section} badge={<AgentCheck />}>
                    {section}
                  </AgentCardItem>
                ))}
              </AgentCardList>
            </div>
          </AgentCard>

          <AgentCard
            title={msg('agent.toolRequestPath')}
            description={msg('agentWorkspacePage.modelOutputNeverBecomesActionDirectly')}
            icon={<Wrench size={15} aria-hidden />}
          >
            <div className="flex flex-col gap-3">
              {/* A sequence, drawn as a sequence: check marks would say each step had already
                  happened. The badge geometry is identical to the other cards, so the family holds
                  together without pretending a pipeline is a list of results. */}
              <AgentCardList ordered>
                {[
                  msg('agentWorkspacePage.modelReturnsAToolCallRequestArgumentsOnly'),
                  msg('agentWorkspacePage.orchestratorChecksTheOperationAgainstThePermissionTa'),
                  msg('agentWorkspacePage.allowedTheDeterministicToolRunsAndItsResult'),
                  msg('agentWorkspacePage.deniedTheRunIsBlockedWithAReason'),
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
                {msg('agent.theGatewayHoldsNoToolRegistry')}
              </p>
            </div>
          </AgentCard>

          {/* The one active ring on the screen: this is the card that is waiting for a decision, and
              a sweeping light is how a screen says "here" without a second badge. */}
          <AgentCard
            ring="active"
            title={msg('agent.ruleProposals')}
            description={msg('agentWorkspacePage.ideaEvaluationHumanApproval')}
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
                  {msg('agent.proposedRule')}
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="info">
                      <BrainCircuit size={10} />
                    </AgentBadge>
                  }
                >
                  {msg('agent.deterministicEvaluationAttached')}
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="warning">
                      <Gavel size={10} />
                    </AgentBadge>
                  }
                >
                  {msg('agent.awaitingYourApprovalSelfApprovalIs')}
                </AgentCardItem>
              </AgentCardList>

              <p className="text-caption text-text-faint">
                {msg('agent.activationIsImpossibleWithoutARecorded')}
              </p>
            </div>
          </AgentCard>

          <AgentCard
            title={msg('agent.unchangedGuarantees')}
            description={msg('agentWorkspacePage.whatTheAgentCannotDoWhateverItSays')}
            icon={<ShieldCheck size={15} aria-hidden />}
          >
            <div className="flex flex-col gap-3">
              <AgentCardList>
                {[
                  msg('agentWorkspacePage.liveTradingDisabled'),
                  msg('agentWorkspacePage.brokerExecutionDisabled'),
                  msg('agentWorkspacePage.modelAuthoredMemoryCanNeverBecomeTrustedKnowledge'),
                ].map((guarantee) => (
                  <AgentCardItem key={guarantee} badge={<AgentCheck />}>
                    <span className="inline-flex items-center gap-1.5">
                      <Database size={12} aria-hidden className="shrink-0 text-text-faint" />
                      {guarantee}
                    </span>
                  </AgentCardItem>
                ))}
              </AgentCardList>

              <p className="text-caption text-text-faint">
                Alpha build: the transcript holds only turns you actually sent. Every answer above
                is exactly what the server returned, and each one names the run it ran under.
              </p>
            </div>
          </AgentCard>

          <p className="flex items-start gap-1.5 text-caption text-text-faint">
            <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
            {msg('agent.epistemicLabels')} {EPISTEMIC_LABEL.fact}, {EPISTEMIC_LABEL.analysis},{' '}
            {EPISTEMIC_LABEL.hypothesis}, {EPISTEMIC_LABEL.uncertainty}.
          </p>
        </aside>
      </div>
    </Workspace>
  );
}
