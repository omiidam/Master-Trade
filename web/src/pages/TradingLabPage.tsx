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
import { MOCK_DATA_NOTICE, mockBars, mockDashboard, mockLabSetups } from '../mock/data';
import { cn } from '../lib/cn';

const SETUP_TONE = {
  reviewed: 'primary',
  draft: 'outline',
  'awaiting-review': 'warning',
} as const;

const TABS = [
  { id: 'review', label: 'Setup review' },
  { id: 'risk', label: 'Risk math' },
  { id: 'rules', label: 'Rule proposals' },
] as const;

export function TradingLabPage() {
  const [tab, setTab] = useState<string>('review');

  return (
    <Workspace
      title="Trading lab"
      description="A training surface for reviewing practice setups and risk math. Read-only: there is no order entry, no broker connection and no execution path anywhere in this application."
      actions={
        <>
          <Badge tone="outline" icon={<Lock size={12} aria-hidden />}>
            read-only
          </Badge>
          <Tooltip content="No execution capability exists in the system, so nothing here can be armed.">
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
        aria-label="Trading lab sections"
      >
        <TabPanel value="review" className="space-y-4">
          <Card>
            <CardHeader divider>
              <div>
                <CardTitle>Practice chart</CardTitle>
                <CardDescription>
                  {mockDashboard.symbol} · {mockDashboard.timeframe} · synthetic series for layout
                  review
                </CardDescription>
              </div>
              <Badge tone="info">chart adapter</Badge>
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
          <p className="text-caption text-text-faint">{MOCK_DATA_NOTICE}</p>
        </TabPanel>

        <TabPanel value="risk" className="space-y-4">
          <Grid columns={2}>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Position size calculator</CardTitle>
                  <CardDescription>
                    Deterministic tool input — the model never performs this arithmetic
                  </CardDescription>
                </div>
                <Calculator size={15} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Practice account balance">
                    {({ id }) => <Input id={id} disabled placeholder="25,000.00" />}
                  </Field>
                  <Field label="Risk per trade (%)">
                    {({ id }) => <Input id={id} disabled placeholder="1.00" />}
                  </Field>
                  <Field label="Entry">
                    {({ id }) => <Input id={id} disabled placeholder="184.20" />}
                  </Field>
                  <Field label="Stop">
                    {({ id }) => <Input id={id} disabled placeholder="181.90" />}
                  </Field>
                </div>
                <Tooltip content="The tool registry and risk math are implemented; this phase only ships the interface, so the panel is inert.">
                  <span>
                    <Button
                      variant="primary"
                      disabled
                      leadingIcon={<Calculator size={14} aria-hidden />}
                    >
                      Calculate position size
                    </Button>
                  </span>
                </Tooltip>
              </CardContent>
            </Card>

            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Tool result</CardTitle>
                  <CardDescription>
                    Where a tool result will appear, with provenance
                  </CardDescription>
                </div>
                <Wrench size={15} aria-hidden className="text-text-faint" />
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Wrench size={22} aria-hidden />}
                  title="No result yet"
                  description="The risk tools exist in the backend and are covered by tests, but the interface is not wired to them in this phase."
                  hint="When wired, the panel shows the tool name, its inputs and a fact label — never a model-authored number."
                />
              </CardContent>
            </Card>
          </Grid>

          <InterfaceStatesPanel
            states={['loading', 'error']}
            title="States around a tool call"
            description="A tool call is a round trip. These are the two states that follow it; the empty pre-call state is the panel above."
            loadingTitle="Running the deterministic tool"
            loadingDescription="A pending tool shows the tool's name and inputs, never a provisional number — a number that later changes is worse than a spinner."
            errorTitle="The tool call failed"
            errorDescription="A refusal or a failure is shown with its typed code: a denied operation and an unavailable tool are different answers and must not read the same."
            errorCode="FORBIDDEN"
            hint="No button on this page can arm anything: the application has no order path, so a risk figure can only ever inform a study decision."
          />
        </TabPanel>

        <TabPanel value="rules" className="space-y-4">
          <Card>
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">Proposed process rule</CardTitle>
                <CardDescription>
                  Proposals are drafts until an evaluation and a human approval exist
                </CardDescription>
              </div>
              <Badge tone="warning" dot>
                awaiting approval
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardTile space="roomy">
                <p className="text-caption text-text-muted">Rule text</p>
                <p className="mt-1 text-body text-text">
                  “Skip any setup where the invalidation level cannot be written before entry.”
                </p>
                <p className="mt-2 text-caption text-text-faint">
                  Status: draft → evaluation attached → awaiting human activation
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
                  Deterministic evaluation: sample size, expectancy and an explicit
                  <em> inconclusive </em> verdict when the evidence is thin.
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="warning">
                      <Gavel size={10} strokeWidth={2.5} />
                    </AgentBadge>
                  }
                >
                  Human decision: only an owner may decide, and the requester cannot approve their
                  own proposal.
                </AgentCardItem>
                <AgentCardItem
                  badge={
                    <AgentBadge tone="accent">
                      <ShieldCheck size={10} strokeWidth={2.5} />
                    </AgentBadge>
                  }
                >
                  Activation: refused without a non-expired approval row referencing this proposal.
                </AgentCardItem>
              </AgentCardList>
              <div className="flex flex-wrap gap-2">
                <Tooltip content="Approval workflow lands with the persistence slice; the gate is already enforced in the backend.">
                  <span>
                    <Button variant="primary" disabled>
                      Request approval
                    </Button>
                  </span>
                </Tooltip>
                <Button variant="ghost" disabled>
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
