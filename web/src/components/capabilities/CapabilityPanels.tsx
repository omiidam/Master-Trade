/**
 * The capability surface, as components.
 *
 * Presentation only, and here that is a security property rather than a style choice: the browser
 * resolves no capability, checks no permission and looks up no entitlement. Every `state` and every
 * reason below is the server's own, carried through unchanged, because the moment a surface decides
 * that something is allowed it has become the thing that authorizes — and a frontend restriction is
 * never an authorization.
 *
 * Three presentation rules:
 *
 *   1. **Availability and readiness are shown as two facts.** A capability that is declared and
 *      unbuilt wears "not available yet" whatever the caller's inputs say, and a built one whose
 *      inputs are incomplete wears the input state. Collapsing them would tell somebody to go and
 *      declare a risk tolerance for a feature that is not there.
 *   2. **A badge is never the only signal.** Every badge here sits beside a sentence, because colour
 *      alone is not a message a screen reader or a colour-blind reader receives.
 *   3. **What a capability will not do is on the panel.** `claims` includes the denials — no
 *      position sizing, no prediction, no execution — so the limits travel with the description
 *      rather than living in a document nobody opens.
 */

import type { ReactNode } from 'react';
import type {
  CapabilitiesViewData,
  CapabilityModuleView,
  CapabilityStageView,
  CapabilityView,
} from '@shared/api/contracts';
import {
  CAPABILITY_STATE_LABEL,
  CAPABILITY_STATE_MEANING,
  type CapabilityState,
} from '@shared/capabilities/model';
import { Badge } from '../Badge';
import type { BadgeTone } from '../Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTile,
  CardTitle,
  Section,
} from '../Card';
import { cn } from '../../lib/cn';

/**
 * How a capability state is presented.
 *
 * `UNAVAILABLE` is deliberately `outline` rather than `danger`: a capability this build has not
 * shipped is a delivery gap, not a fault of the person looking at it, and colouring it red would
 * read as an error they had caused.
 */
export const STATE_TONE: Readonly<Record<CapabilityState, BadgeTone>> = {
  READY: 'success',
  READY_WITH_LIMITATIONS: 'warning',
  REQUIRES_CLARIFICATION: 'warning',
  BLOCKED: 'danger',
  UNAVAILABLE: 'outline',
};

// Re-exported from the contract rather than reworded here: a surface that invents its own label for
// `UNAVAILABLE` will eventually invent its own meaning for it, and the meaning is what stops
// "your inputs are ready" being said about a capability that does not exist.
export const STATE_LABEL = CAPABILITY_STATE_LABEL;
export { CAPABILITY_STATE_MEANING };

export function CapabilityStateBadge({
  state,
  className,
}: {
  state: CapabilityState;
  className?: string;
}) {
  return (
    <Badge tone={STATE_TONE[state]} dot className={className}>
      {STATE_LABEL[state]}
    </Badge>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-caption text-text">{children}</dd>
    </div>
  );
}

/** One declared capability. */
export function CapabilityCard({ capability }: { capability: CapabilityView }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="text-body">{capability.name}</CardTitle>
          <CardDescription>{capability.categoryLabel}</CardDescription>
        </div>
        <CapabilityStateBadge state={capability.state} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-caption text-text-muted">{capability.description}</p>

        {/* The reason, in the server's words, with the state's full meaning. */}
        <CardTile as="p" tone="raised" className="text-caption text-text">
          {capability.stateReason}
        </CardTile>

        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Fact label="Availability">
            {capability.availability.replaceAll('-', ' ')}
            {capability.producesFigures ? ' · produces figures' : ' · produces no figures'}
          </Fact>
          <Fact label="Weight">
            {capability.riskLevel} — {capability.riskMeaning}
          </Fact>
          <Fact label="Deterministic engine">
            {capability.engineCapability ?? 'none: nothing here is computed'}
          </Fact>
          <Fact label="Operation the role table decides">
            {capability.operation ?? 'none declared'}
          </Fact>
          <Fact label="Metered as">{capability.feature ?? 'not metered'}</Fact>
          <Fact label="Who may ask">
            {capability.humanOnly
              ? 'a person only'
              : capability.modelMayRequest
                ? 'a person, or the model on your behalf'
                : 'not requestable by the model'}
          </Fact>
          <Fact label="Memory it may cite">
            {capability.memoryPolicy === 'cite-verified-only'
              ? 'verified records only'
              : 'any record, with its verification state attached'}
          </Fact>
          <Fact label="Outputs">{capability.outputs.join(', ')}</Fact>
        </dl>

        <div className="space-y-1.5">
          <p className="text-caption font-medium text-text">
            What this claims, and what it does not
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {capability.claims.map((claim) => (
              <li key={claim} className="text-caption text-text-muted">
                {claim}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <p className="text-caption font-medium text-text">Provenance requirement</p>
          <p className="text-caption text-text-muted">{capability.provenance.statement}</p>
          {capability.provenance.requiresProvenance ? (
            <Badge tone="info">Required before a figure exists</Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {capability.modules.map((module) => (
            <Badge key={module} tone="outline">
              {module}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The modules a capability system composes, with what each is for.
 *
 * `composedBy` is rendered rather than implied, because a module nobody composes would be a diagram
 * rather than an architecture — and the registry refuses one.
 */
export function ModuleMap({ modules }: { modules: readonly CapabilityModuleView[] }) {
  return (
    <Section
      title="Modules"
      description="What each module contributes, and which capabilities compose it. The registry refuses a module that no capability uses."
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.id}>
            <CardHeader>
              <CardTitle className="text-body">{module.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-caption text-text-muted">{module.role}</p>
              <div className="flex flex-wrap gap-1.5">
                {module.composedBy.map((capabilityId) => (
                  <Badge key={capabilityId} tone="outline">
                    {capabilityId}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/**
 * The declared pipeline.
 *
 * Served from the same declaration the server plans a run from, so this cannot become a diagram of
 * a flow that no longer happens.
 */
export function CapabilityPipeline({ stages }: { stages: readonly CapabilityStageView[] }) {
  return (
    <Section
      title="How a request is handled"
      description="The order the server applies, and what stops a request at each stage. It is declared once and served, so the description and the behaviour cannot drift."
    >
      <ol className="space-y-2">
        {stages.map((stage, index) => (
          <li key={stage.id}>
            <Card>
              <CardContent className="flex gap-3 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    'border border-border bg-surface-raised text-caption font-medium text-text-muted',
                  )}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-body font-medium text-text">{stage.label}</p>
                  <p className="text-caption text-text-muted">{stage.meaning}</p>
                  <p className="text-caption text-text-muted">
                    <span className="font-medium text-text">If it does not pass: </span>
                    {stage.blocks}
                  </p>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** The counts a catalogue view leads with. No score, and no user text. */
export function CapabilitySummary({
  view,
  className,
}: {
  view: CapabilitiesViewData;
  className?: string;
}) {
  const counts = (
    ['READY', 'READY_WITH_LIMITATIONS', 'REQUIRES_CLARIFICATION', 'BLOCKED', 'UNAVAILABLE'] as const
  ).map((state) => ({
    state,
    count: view.capabilities.filter((capability) => capability.state === state).length,
  }));

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5', className)}>
      {counts.map((entry) => (
        <CardTile key={entry.state} tone="raised" className="min-w-0">
          <p className="text-caption text-text-muted">{STATE_LABEL[entry.state]}</p>
          <p className="mt-0.5 text-title font-semibold tabular-nums text-text">{entry.count}</p>
        </CardTile>
      ))}
    </div>
  );
}
