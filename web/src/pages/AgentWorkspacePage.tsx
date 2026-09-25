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
import { EPISTEMIC_LABEL, mockDataNotice, mockConversation, mockSystemStatus } from '../mock/data';
import { formatTimestamp } from '../lib/format';
import { useUiStore } from '../store/ui';
import { msg } from '../i18n/index.js';

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

export function AgentWorkspacePage() {
  const setPage = useUiStore((state) => state.setPage);
  const [draft, setDraft] = useState('');

  return (
    <Workspace
      title={msg('agent.aIWorkspace')}
      description={msg('agentWorkspacePage.conversationWithTheTrainingAgentAnswersSeparateFact')}
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

          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('agent.conversation')}</CardTitle>
                <CardDescription>{msg('agent.eachMessageShowsItsEpistemicLabel')}</CardDescription>
              </div>
              <Badge tone="warning" dot>
                {msg('agent.mockTranscript')}
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
                    </Card>
                  </Reveal>
                );
              })}
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
                blockedReason={msg('agentWorkspacePage.sendingIsDisabledNoProviderIsRegisteredAnd')}
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
                value={mockSystemStatus.agentState}
              />
              <ReadOnlyValue
                label={msg('agentWorkspacePage.provider')}
                value="none registered"
                hint={msg(
                  'agentWorkspacePage.scriptedOfflineAdapterRemainsTheDeterministicDefault',
                )}
              />
              <ReadOnlyValue
                label={msg('agentWorkspacePage.budgetUsed')}
                value={`$${mockSystemStatus.llmBudgetUsedUsd.toFixed(2)} of $25.00`}
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

              <p className="text-caption text-text-faint">{mockDataNotice()}</p>
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
