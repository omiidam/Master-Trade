import { useState } from 'react';
import { Calculator, Check, FileText, Gavel, Lock, ShieldCheck, Wrench } from 'lucide-react';
import { AgentBadge, AgentCardItem, AgentCardList } from '../components/agent/AgentCard';
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
import { ChartAdapter } from '../components/charts/ChartAdapter';
import { EmptyState } from '../components/EmptyState';
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { Field, Input } from '../components/Input';
import { Reveal } from '../components/Reveal';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import { mockDataNotice, mockBars, mockDashboard, mockLabSetups } from '../mock/data';
import { cn } from '../lib/cn';
import { msg } from '../i18n/index.js';

const SETUP_TONE = {
  reviewed: 'primary',
  draft: 'outline',
  'awaiting-review': 'warning',
} as const;

const TABS = [
  {
    id: 'review',
    get label(): string {
      return msg('tradingLabPage.setupReview');
    },
  },
  {
    id: 'risk',
    get label(): string {
      return msg('tradingLabPage.riskMath');
    },
  },
  {
    id: 'rules',
    get label(): string {
      return msg('agent.ruleProposals');
    },
  },
] as const;

export function TradingLabPage() {
  const [tab, setTab] = useState<string>('review');

  return (
    <Workspace
      title={msg('lab.tradingLab')}
      description={msg('tradingLabPage.aTrainingSurfaceForReviewingPracticeSetupsAnd')}
      actions={
        <>
          <Badge tone="outline" icon={<Lock size={12} aria-hidden />}>
            read-only
          </Badge>
          <Tooltip content={msg('tradingLabPage.noExecutionCapabilityExistsInTheSystemSo')}>
            <Badge tone="primary" icon={<ShieldCheck size={12} aria-hidden />}>
              execution impossible
            </Badge>
          </Tooltip>
        </>
      }
    >
      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('lab.tradingLabSections')}
      >
        <TabPanel value="review" className="space-y-4">
          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle>{msg('lab.practiceChart')}</CardTitle>
                <CardDescription>
                  {mockDashboard.symbol} · {mockDashboard.timeframe}{' '}
                  {msg('lab.syntheticSeriesForLayoutReview')}
                </CardDescription>
              </div>
              <Badge tone="info">{msg('dashboard.chartAdapter')}</Badge>
            </CardHeader>
            <CardContent>
              <ChartAdapter
                bars={mockBars}
                symbol={mockDashboard.symbol}
                timeframe={mockDashboard.timeframe}
                provenance={mockDashboard.dataProvenance}
                source="synthetic-generator"
                updatedAt={mockDashboard.lastUpdated}
                height={300}
              />
            </CardContent>
          </Card>

          <Grid columns={3}>
            {mockLabSetups.map((setup, index) => (
              <Reveal key={setup.id} index={index}>
                <Card>
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">{setup.title}</CardTitle>
                      <CardDescription className="flex flex-wrap gap-1.5 pt-1">
                        {setup.tags.map((tag) => (
                          <Badge key={tag} tone="outline">
                            {tag}
                          </Badge>
                        ))}
                      </CardDescription>
                    </div>
                    <Badge tone={SETUP_TONE[setup.status]} dot={setup.status !== 'draft'}>
                      {setup.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1.5">
                      {setup.checklist.map((item) => (
                        <li key={item.label} className="flex items-center gap-2 text-caption">
                          <span
                            aria-hidden
                            className={cn(
                              'grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border',
                              item.done
                                ? 'border-primary bg-primary-soft text-primary'
                                : 'border-border-strong text-transparent',
                            )}
                          >
                            <Check size={11} />
                          </span>
                          <span className={item.done ? 'text-text-muted' : 'text-text-faint'}>
                            {item.label}
                          </span>
                          <span className="sr-only">{item.done ? 'done' : 'not done'}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-caption text-text-faint">{setup.note}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </Grid>
          <p className="text-caption text-text-faint">{mockDataNotice()}</p>
        </TabPanel>

        <TabPanel value="risk" className="space-y-4">
          <Grid columns={2}>
            <Card surface="action">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('lab.positionSizeCalculator')}</CardTitle>
                  <CardDescription>
                    {msg('lab.deterministicToolInputTheModelNever')}
                  </CardDescription>
                </div>
                <Calculator size={15} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={msg('tradingLabPage.practiceAccountBalance')}>
                    {({ id }) => <Input id={id} disabled placeholder="25,000.00" />}
                  </Field>
                  <Field label={msg('tradingLabPage.riskPerTrade')}>
                    {({ id }) => <Input id={id} disabled placeholder="1.00" />}
                  </Field>
                  <Field label={msg('evaluationPanels.entry')}>
                    {({ id }) => <Input id={id} disabled placeholder="184.20" />}
                  </Field>
                  <Field label={msg('tradeRow.stop')}>
                    {({ id }) => <Input id={id} disabled placeholder="181.90" />}
                  </Field>
                </div>
                {/* The reference closes a card whose job ends in one control with a full-width pill.
                    The wrapper is a block so `w-full` resolves against the card's body rather than
                    the inline box a bare `<span>` would give it. */}
                <Tooltip content={msg('tradingLabPage.theToolRegistryAndRiskMathAreImplemented')}>
                  <span className="block">
                    <Button
                      variant="primary"
                      shape="pill"
                      fullWidth
                      disabled
                      leadingIcon={<Calculator size={14} aria-hidden />}
                    >
                      {msg('lab.calculatePositionSize')}
                    </Button>
                  </span>
                </Tooltip>
              </CardContent>
            </Card>

            <Card surface="metric">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('lab.toolResult')}</CardTitle>
                  <CardDescription>{msg('lab.whereAToolResultWillAppear')}</CardDescription>
                </div>
                <Wrench size={15} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Wrench size={22} aria-hidden />}
                  title={msg('lab.noResultYet')}
                  description={msg('tradingLabPage.theRiskToolsExistInTheBackendAnd')}
                  hint={msg('tradingLabPage.whenWiredThePanelShowsTheToolName')}
                />
              </CardContent>
            </Card>
          </Grid>

          <InterfaceStatesPanel
            states={['loading', 'error']}
            title={msg('lab.statesAroundAToolCall')}
            description={msg('tradingLabPage.aToolCallIsARoundTripThese')}
            loadingTitle={msg('tradingLabPage.runningTheDeterministicTool')}
            loadingDescription={msg('tradingLabPage.aPendingToolShowsTheToolSNameAnd')}
            errorTitle={msg('tradingLabPage.theToolCallFailed')}
            errorDescription={msg('tradingLabPage.aRefusalOrAFailureIsShownWith')}
            errorCode="FORBIDDEN"
            hint={msg('tradingLabPage.noButtonOnThisPageCanArmAnything')}
          />
        </TabPanel>

        <TabPanel value="rules" className="space-y-4">
          <Card surface="featured">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('lab.proposedProcessRule')}</CardTitle>
                <CardDescription>{msg('lab.proposalsAreDraftsUntilAnEvaluation')}</CardDescription>
              </div>
              <Badge tone="warning" dot>
                {msg('lab.awaitingApproval')}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardTile space="roomy">
                <p className="text-caption text-text-muted">{msg('lab.ruleText')}</p>
                <p className="mt-1 text-body text-text">
                  {msg('lab.skipAnySetupWhereTheInvalidation')}
                </p>
                <p className="mt-2 text-caption text-text-faint">
                  {msg('lab.statusDraftEvaluationAttachedAwaitingHuman')}
                </p>
              </CardTile>
              {/*
                A sequence, so the list is `ordered` — the `<ol>` the reference's row family chooses
                when the rows are steps rather than statements. The glyph stays, moved into the
                mark, so the tone of each stage is still readable at a glance.
              */}
              <AgentCardList ordered>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="info">
                      <FileText size={10} strokeWidth={2.5} />
                    </AgentBadge>
                  }
                >
                  {msg('lab.deterministicEvaluationSampleSizeExpectancyAnd')}
                  <em> {msg('lab.inconclusive')} </em> {msg('lab.verdictWhenTheEvidenceIsThin')}
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="warning">
                      <Gavel size={10} strokeWidth={2.5} />
                    </AgentBadge>
                  }
                >
                  {msg('lab.humanDecisionOnlyAnOwnerMay')}
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="accent">
                      <ShieldCheck size={10} strokeWidth={2.5} />
                    </AgentBadge>
                  }
                >
                  {msg('lab.activationRefusedWithoutANonExpired')}
                </AgentCardItem>
              </AgentCardList>
              <div className="flex flex-wrap gap-2">
                <Tooltip
                  content={msg('tradingLabPage.approvalWorkflowLandsWithThePersistenceSliceThe')}
                >
                  <span>
                    <Button variant="primary" disabled>
                      {msg('lab.requestApproval')}
                    </Button>
                  </span>
                </Tooltip>
                <Button variant="ghost" disabled>
                  {msg('lab.reject')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
