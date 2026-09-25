import { useMemo, useState, type ReactNode } from 'react';
import { CircleAlert, FileText, Paperclip, Save, Send, Trash2 } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { ErrorState } from '../ErrorState';
import { Field, Input, Textarea } from '../Input';
import { Modal } from '../Modal';
import { Tooltip } from '../Tooltip';
import { Alert } from '../Alert';
import { FormSection } from './FormSection';
import { ChecklistField } from './ChecklistField';
import { PsychologyScale } from './PsychologyScale';
import { cn } from '../../lib/cn';
import {
  ATTACHMENT_KIND_LABEL,
  EMOTIONAL_STATE_LABEL,
  attachmentNote,
  JOURNAL_RULE_CHECKLIST,
  MARKET_LABEL,
  SESSION_LABEL,
  STATUS_LABEL,
  TRADE_SETUPS,
  TRADE_TIMEFRAMES,
  DIRECTION_LABEL,
} from '../../mock/journal';
import { EMPTY_TRADE_FORM, validateTradeForm } from './tradeFormModel';
import type { TradeFormSectionId, TradeFormValues } from './tradeFormModel';
import type {
  AttachmentKind,
  EmotionalState,
  TradeDirection,
  TradeMarket,
  TradeStatus,
  TradingSession,
} from '../../mock/journal';
import { msg } from '../../i18n/index.js';

export { EMPTY_TRADE_FORM, validateTradeForm, countFormErrors } from './tradeFormModel';
export type { TradeFormErrors, TradeFormSectionId, TradeFormValues } from './tradeFormModel';

const SECTION_TITLES: Record<TradeFormSectionId, string> = {
  get information(): string {
    return msg('tradeForm.tradeInformation');
  },
  get risk(): string {
    return msg('tradeForm.executionAndRisk');
  },
  get context(): string {
    return msg('tradeForm.marketContext');
  },
  get plan(): string {
    return msg('tradeForm.tradingPlan');
  },
  get psychology(): string {
    return msg('journal.psychology');
  },
  get review(): string {
    return msg('journal.review');
  },
  get attachments(): string {
    return msg('tradeForm.attachments');
  },
};

export interface TradeFormProps {
  initial?: TradeFormValues;
  /**
   * The journal store. When it is absent the form still validates, and submitting
   * reports the store as unavailable rather than pretending a write succeeded.
   */
  onSubmit?: (values: TradeFormValues) => Promise<void>;
  onSaveDraft?: (values: TradeFormValues) => Promise<void>;
  onCancel?: () => void;
  className?: string;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; mode: 'submitted' | 'draft' }
  | { kind: 'failed'; code: string; message: string };

/**
 * The Add Trade form.
 *
 * Seven sections, staged as a collapsible sequence rather than one long wall of
 * fields. The order is the order the decision is made in: what the trade was,
 * what it risked, what the market looked like, what the plan was, how it felt,
 * what it taught, and what evidence is attached.
 *
 * Three behaviours are deliberate:
 *   - **a section cannot hide its own errors** — the count travels with the
 *     collapsed header, so validation never looks like a passing form;
 *   - **leaving with unsaved changes is a decision, not an accident** — cancelling
 *     opens a confirmation naming exactly what would be lost;
 *   - **no fake write** — with no journal store connected, submission reports the
 *     typed reason and keeps the values. A form that says "saved" when nothing was
 *     stored is the worst possible behaviour for a journal.
 */
export function TradeForm({
  initial = EMPTY_TRADE_FORM,
  onSubmit,
  onSaveDraft,
  onCancel,
  className,
}: TradeFormProps) {
  const [values, setValues] = useState<TradeFormValues>(initial);
  const [open, setOpen] = useState<TradeFormSectionId>('information');
  const [touched, setTouched] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const errors = useMemo(() => validateTradeForm(values), [values]);
  const errorCount = Object.values(errors).reduce((sum, list) => sum + (list?.length ?? 0), 0);
  const dirty = touched && JSON.stringify(values) !== JSON.stringify(initial);

  const set = <Key extends keyof TradeFormValues>(key: Key, value: TradeFormValues[Key]) => {
    setTouched(true);
    setSubmitState({ kind: 'idle' });
    setValues((current) => ({ ...current, [key]: value }));
  };

  const section = (id: TradeFormSectionId): ReactNode => {
    const issues = errors[id]?.length ?? 0;
    return (
      <FormSection
        key={id}
        step={SECTION_ORDER.indexOf(id) + 1}
        title={SECTION_TITLES[id]}
        description={SECTION_HINT[id]}
        summary={SECTION_SUMMARY[id](values)}
        issues={issues}
        open={open === id}
        onOpenChange={(next) => setOpen(next ? id : 'information')}
      >
        {issues > 0 ? (
          <ul className="mb-3 space-y-1 rounded-[var(--radius-control)] border border-danger-border bg-danger-soft px-3 py-2">
            {errors[id]?.map((message) => (
              <li key={message} className="flex items-start gap-2 text-caption text-danger">
                <CircleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
                {message}
              </li>
            ))}
          </ul>
        ) : null}
        {SECTION_BODY[id]}
      </FormSection>
    );
  };

  const text = (
    key: keyof TradeFormValues,
    label: string,
    options: { hint?: string; placeholder?: string; type?: string; className?: string } = {},
  ) => (
    <Field
      label={label}
      {...(options.hint ? { hint: options.hint } : {})}
      className={options.className}
    >
      {({ id, 'aria-describedby': describedBy }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          {...(options.type ? { type: options.type } : {})}
          {...(options.placeholder ? { placeholder: options.placeholder } : {})}
          value={String(values[key])}
          onChange={(event) => set(key, event.target.value as never)}
        />
      )}
    </Field>
  );

  const area = (key: keyof TradeFormValues, label: string, hint?: string) => (
    <Field label={label} {...(hint ? { hint } : {})} className="md:col-span-2">
      {({ id, 'aria-describedby': describedBy }) => (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          value={String(values[key])}
          onChange={(event) => set(key, event.target.value as never)}
        />
      )}
    </Field>
  );

  const select = <Value extends string>(
    key: keyof TradeFormValues,
    label: string,
    options: readonly { value: Value; label: string }[],
    hint?: string,
  ) => (
    <Field label={label} {...(hint ? { hint } : {})}>
      {({ id, 'aria-describedby': describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          className="h-9 w-full rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 text-body text-text hover:border-border-strong focus:border-primary focus:outline-none"
          value={String(values[key])}
          onChange={(event) => set(key, event.target.value as never)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  const SECTION_ORDER: readonly TradeFormSectionId[] = [
    'information',
    'risk',
    'context',
    'plan',
    'psychology',
    'review',
    'attachments',
  ];

  const SECTION_HINT: Record<TradeFormSectionId, string> = {
    information: msg('tradeForm.whatWasTradedWhenAndFromWhichSetup'),
    risk: msg('tradeForm.theLevelsAndTheRiskTheseMustAgree'),
    context: msg('tradeForm.whatTheChartLookedLikeBeforeTheEntry'),
    plan: msg('tradeForm.thePlanWrittenBeforeEntryAndTheChecklist'),
    psychology: msg('tradeForm.selfReportedRecordedAtTheTimeRatherThanReconstructed'),
    review: msg('tradeForm.whatItTaughtARecordWithNoReview'),
    attachments: msg('tradeForm.screenshotsAndMarkupsThatSupportTheRecord'),
  };

  const SECTION_SUMMARY: Record<TradeFormSectionId, (values: TradeFormValues) => string> = {
    information: (v) =>
      `${v.symbol === '' ? 'no symbol yet' : v.symbol} · ${DIRECTION_LABEL[v.direction]} · ${
        TRADE_SETUPS.find((setup) => setup.id === v.setupId)?.label ?? 'no setup chosen'
      }`,
    risk: (v) =>
      v.entryPrice === ''
        ? 'no levels entered yet'
        : `entry ${v.entryPrice} · invalidation ${v.stopLoss || '—'} · target ${v.takeProfit || '—'}`,
    context: (v) =>
      v.higherTimeframeBias === '' ? 'no context written yet' : v.higherTimeframeBias.slice(0, 96),
    plan: (v) =>
      v.thesis === ''
        ? 'no thesis written yet'
        : `${v.checklist.length} of ${JOURNAL_RULE_CHECKLIST.length} checklist items marked`,
    psychology: (v) =>
      `${EMOTIONAL_STATE_LABEL[v.beforeEntry]} before · ${EMOTIONAL_STATE_LABEL[v.afterExit]} after · discipline ${v.discipline}/10`,
    review: (v) => (v.lesson === '' ? 'no lesson written yet' : v.lesson.slice(0, 96)),
    attachments: (v) =>
      v.attachments.length === 0
        ? 'no attachments selected'
        : v.attachments.map((kind) => ATTACHMENT_KIND_LABEL[kind]).join(' · '),
  };

  const SECTION_BODY: Record<TradeFormSectionId, ReactNode> = {
    information: (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {text('symbol', msg('tradeForm.symbol'), {
          placeholder: 'ES, EURUSD, AAPL…',
          hint: msg('tradeForm.theInstrumentAsYourPlatformNamesIt'),
        })}
        {select(
          'market',
          msg('tradeFilters.market'),
          (Object.keys(MARKET_LABEL) as TradeMarket[]).map((key) => ({
            value: key,
            label: MARKET_LABEL[key],
          })),
        )}
        {select(
          'direction',
          msg('tradeFilters.direction'),
          (Object.keys(DIRECTION_LABEL) as TradeDirection[]).map((key) => ({
            value: key,
            label: DIRECTION_LABEL[key],
          })),
          msg('tradeForm.changingThisReChecksTheLevelsInTheNext'),
        )}
        {select(
          'status',
          msg('tradeForm.tradeStatus'),
          (Object.keys(STATUS_LABEL) as TradeStatus[]).map((key) => ({
            value: key,
            label: STATUS_LABEL[key],
          })),
        )}
        {text('date', msg('tradeForm.tradeDate'), { type: 'date' })}
        {text('entryTime', msg('tradeForm.entryTime'), { type: 'time' })}
        {text('exitTime', msg('tradeForm.exitTime'), {
          type: 'time',
          hint: msg('tradeForm.leaveEmptyWhileTheTradeIsOpen'),
        })}
        {select(
          'session',
          msg('tradeForm.tradingSession'),
          (Object.keys(SESSION_LABEL) as TradingSession[]).map((key) => ({
            value: key,
            label: SESSION_LABEL[key],
          })),
        )}
        {select(
          'timeframe',
          msg('tradeForm.timeframe'),
          TRADE_TIMEFRAMES.map((frame) => ({ value: frame, label: frame })),
          msg('tradeForm.theTimeframeTheSetupWasReadOn'),
        )}
        <div className="md:col-span-2 xl:col-span-3">
          {select(
            'setupId',
            msg('tradeFilters.setup'),
            [
              { value: '', label: msg('tradeForm.chooseASetup') },
              ...TRADE_SETUPS.map((setup) => ({ value: setup.id, label: setup.label })),
            ],
            msg('tradeForm.aResultWithoutItsSetupCannotBeReviewed'),
          )}
        </div>
      </div>
    ),
    risk: (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {text('entryPrice', msg('tradeForm.entryPrice'), { type: 'number' })}
        {text('exitPrice', msg('tradeForm.exitPrice'), {
          type: 'number',
          hint: msg('tradeForm.emptyWhileTheTradeIsOpen'),
        })}
        {text('stopLoss', msg('tradeForm.stopLossInvalidation'))}
        {text('takeProfit', msg('tradeForm.takeProfit'))}
        {text('positionSize', msg('riskSummary.positionSize'), { type: 'number' })}
        {text('plannedRisk', msg('tradeForm.plannedRiskAccountCurrency'), { type: 'number' })}
        {text('plannedRr', msg('tradeForm.plannedRewardToRisk'), {
          type: 'number',
          hint: msg('tradeForm.plannedNotAchieved'),
        })}
        {text('actualR', msg('tradeForm.actualRRealised'), {
          type: 'number',
          hint: msg('tradeForm.leaveEmptyUntilTheTradeIsScored'),
        })}
        {text('commission', msg('tradeForm.commission'), { type: 'number' })}
        {text('fees', msg('riskSummary.fees'), { type: 'number' })}
        <p className="text-caption text-text-faint md:col-span-2 xl:col-span-3">
          {msg('journal.theFormChecksThatTheLevels')}
        </p>
      </div>
    ),
    context: (
      <div className="grid gap-3 md:grid-cols-2">
        {area('higherTimeframeBias', msg('tradeForm.higherTimeframeBias'))}
        {area('marketStructure', msg('profile.array.market-structure'))}
        {area('liquidityContext', msg('tradeForm.liquidityContext'))}
        {area('keyZone', msg('tradeForm.keyZone'))}
        {area('entryConfirmation', msg('tradeForm.entryConfirmation'))}
        {area('confluences', msg('tradeForm.confluences'), msg('tradeForm.onePerLine'))}
        {area('volatility', msg('tradeForm.volatilityConditions'))}
        {area('newsExposure', msg('tradeForm.newsExposure'))}
      </div>
    ),
    plan: (
      <div className="grid gap-3 md:grid-cols-2">
        {area('thesis', msg('tradeForm.tradeThesis'))}
        {area('entryRationale', msg('tradeForm.entryRationale'))}
        {area(
          'invalidation',
          msg('tradeForm.invalidationCondition'),
          msg('tradeForm.requiredWhatMakesThisTradeWrong'),
        )}
        {area('management', msg('tradeForm.plannedManagement'))}
        {area('exitPlan', msg('tradeForm.exitPlan'))}
        <div className="md:col-span-2">
          <ChecklistField
            label={msg('tradeForm.ruleChecklist')}
            hint={msg('tradeForm.markTheItemsSatisfiedBeforeEntryAnUnmarked')}
            items={JOURNAL_RULE_CHECKLIST}
            selected={values.checklist}
            onToggle={(itemId) =>
              set(
                'checklist',
                values.checklist.includes(itemId)
                  ? values.checklist.filter((item) => item !== itemId)
                  : [...values.checklist, itemId],
              )
            }
          />
        </div>
        <div className="md:col-span-2">
          {select(
            'compliance',
            msg('tradeForm.planCompliance'),
            [
              { value: 'compliant', label: msg('tradeForm.compliantEveryRuleFollowed') },
              { value: 'partial', label: msg('tradeForm.partialAtLeastOneRuleMissed') },
              { value: 'violation', label: msg('journal.compliance.violation') },
              { value: 'not-assessed', label: msg('tradeForm.notAssessedYet') },
            ] as const,
            msg('tradeForm.reportingABreakHonestlyIsWorthMoreThan'),
          )}
        </div>
      </div>
    ),
    psychology: (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {select(
            'beforeEntry',
            msg('tradeForm.emotionalStateBeforeEntry'),
            (Object.keys(EMOTIONAL_STATE_LABEL) as EmotionalState[]).map((key) => ({
              value: key,
              label: EMOTIONAL_STATE_LABEL[key],
            })),
          )}
          {select(
            'duringTrade',
            msg('tradeForm.emotionalStateDuringTheTrade'),
            (Object.keys(EMOTIONAL_STATE_LABEL) as EmotionalState[]).map((key) => ({
              value: key,
              label: EMOTIONAL_STATE_LABEL[key],
            })),
          )}
          {select(
            'afterExit',
            msg('tradeForm.emotionalStateAfterExit'),
            (Object.keys(EMOTIONAL_STATE_LABEL) as EmotionalState[]).map((key) => ({
              value: key,
              label: EMOTIONAL_STATE_LABEL[key],
            })),
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PsychologyScale
            label={msg('quality.dimension.confidence')}
            value={values.confidence}
            onChange={(value) => set('confidence', value)}
          />
          <PsychologyScale
            label={msg('tradeForm.fear')}
            value={values.fear}
            onChange={(value) => set('fear', value)}
            caution
          />
          <PsychologyScale
            label={msg('tradeForm.greed')}
            value={values.greed}
            onChange={(value) => set('greed', value)}
            caution
          />
          <PsychologyScale
            label="FOMO"
            value={values.fomo}
            onChange={(value) => set('fomo', value)}
            caution
          />
          <PsychologyScale
            label={msg('tradeForm.hesitation')}
            value={values.hesitation}
            onChange={(value) => set('hesitation', value)}
            caution
          />
          <PsychologyScale
            label={msg('tradeForm.impulsiveness')}
            value={values.impulsiveness}
            onChange={(value) => set('impulsiveness', value)}
            caution
          />
          <PsychologyScale
            label={msg('tradeForm.discipline')}
            value={values.discipline}
            onChange={(value) => set('discipline', value)}
          />
        </div>
        <p className="text-caption text-text-faint">
          {msg('journal.selfReportedAndTimestampedTheseAre')}
        </p>
      </div>
    ),
    review: (
      <div className="grid gap-3 md:grid-cols-2">
        {area(
          'mistakes',
          msg('journal.mistakes'),
          msg('tradeForm.onePerLineTheseBecomeCountableTags'),
        )}
        {area('wentWell', msg('tradeForm.whatWentWell'), msg('tradeForm.onePerLine'))}
        {area('improvements', msg('tradeForm.improvementsToMake'), msg('tradeForm.onePerLine'))}
        {area('lesson', msg('tradeForm.mainLesson'))}
        {area('adjustment', msg('tradeForm.futureAdjustment'))}
        {area('tags', msg('tradeForm.tags'), msg('tradeForm.commaSeparatedEGASetupRunnerHeld'))}
        {area('notes', msg('tradeForm.notes'))}
        <p className="text-caption text-text-faint md:col-span-2">
          {msg('journal.aReviewIsWrittenFromThe')}
        </p>
      </div>
    ),
    attachments: (
      <div className="space-y-3">
        <p className="text-caption text-text-muted">{attachmentNote()}</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(ATTACHMENT_KIND_LABEL) as AttachmentKind[]).map((kind) => {
            const attached = values.attachments.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={attached}
                onClick={() =>
                  set(
                    'attachments',
                    attached
                      ? values.attachments.filter((item) => item !== kind)
                      : [...values.attachments, kind],
                  )
                }
                className={cn(
                  'flex flex-col items-start gap-1 rounded-[var(--radius-control)] border border-dashed p-3 text-start',
                  'transition-colors duration-[var(--duration-fast)]',
                  attached
                    ? 'border-primary bg-primary-soft'
                    : 'border-border-strong bg-surface-sunken hover:border-border',
                )}
              >
                <span className="flex items-center gap-2 text-caption text-text">
                  <Paperclip size={13} aria-hidden />
                  {ATTACHMENT_KIND_LABEL[kind]}
                </span>
                <span className="text-caption text-text-faint">
                  {attached ? 'slot marked as attached' : 'no file selected'}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-caption text-text-faint">
          {msg('journal.attachmentSlotsAreRecordedAsMetadata')}
        </p>
      </div>
    ),
  };

  const run = async (mode: 'submitted' | 'draft') => {
    setTouched(true);
    if (mode === 'submitted' && errorCount > 0) {
      setSubmitState({
        kind: 'failed',
        code: 'JOURNAL_VALIDATION_FAILED',
        message: `${errorCount} field ${errorCount === 1 ? 'problem' : 'problems'} must be resolved before this record can be submitted. Nothing was saved, and the form still holds what you entered.`,
      });
      return;
    }
    setSubmitState({ kind: 'saving' });
    const handler = mode === 'submitted' ? onSubmit : onSaveDraft;
    if (!handler) {
      setSubmitState({
        kind: 'failed',
        code: 'JOURNAL_STORE_UNAVAILABLE',
        message:
          mode === 'submitted'
            ? 'No journal store is connected in this phase, so the record could not be written. The form kept your values.'
            : 'No journal store is connected in this phase, so the draft was not stored. The form kept your values.',
      });
      return;
    }
    try {
      await handler(values);
      setSubmitState({ kind: 'saved', mode });
    } catch (error) {
      setSubmitState({
        kind: 'failed',
        code: 'JOURNAL_WRITE_FAILED',
        message: error instanceof Error ? error.message : 'The write failed.',
      });
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-title font-semibold text-text">{msg('journal.newTradeRecord')}</h3>
          <p className="mt-0.5 max-w-3xl text-caption text-text-muted">
            {msg('journal.sevenSectionsOpenedOneAtA')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={errorCount === 0 ? 'success' : 'danger'}>
            {errorCount === 0 ? 'no blocking problems' : `${errorCount} blocking`}
          </Badge>
          {dirty ? (
            <Badge tone="warning">{msg('journal.unsavedChanges')}</Badge>
          ) : (
            <Badge tone="outline">{msg('journal.unchanged')}</Badge>
          )}
        </div>
      </header>

      {submitState.kind === 'failed' ? (
        <ErrorState
          severity={submitState.code === 'JOURNAL_STORE_UNAVAILABLE' ? 'info' : 'error'}
          title={
            submitState.code === 'JOURNAL_STORE_UNAVAILABLE'
              ? 'Not saved — the store is not connected'
              : submitState.code === 'JOURNAL_VALIDATION_FAILED'
                ? 'Not submitted — the record is incomplete'
                : 'The write failed'
          }
          description={submitState.message}
          code={submitState.code}
        />
      ) : null}

      {submitState.kind === 'saved' ? (
        <Alert
          tone="success"
          title={submitState.mode === 'submitted' ? 'Record written' : 'Draft written'}
          description={msg('tradeForm.aWrittenRecordIsAppendedToTheJournal')}
        />
      ) : null}

      <div className="space-y-2">{SECTION_ORDER.map((id) => section(id))}</div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-panel)] border border-border bg-bg-elevated/95 px-4 py-3 shadow-popover backdrop-blur">
        <p className="text-caption text-text-faint">
          {dirty
            ? 'This record has unsaved changes.'
            : 'Nothing entered yet, so there is nothing to save.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              if (dirty) {
                setConfirmDiscard(true);
                return;
              }
              onCancel?.();
            }}
            label={msg('tradeForm.cancelThisTradeRecord')}
            leadingIcon={<Trash2 size={14} aria-hidden />}
          >
            {msg('journal.cancel')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            disabled={submitState.kind === 'saving'}
            onClick={() => void run('draft')}
            label={msg('tradeForm.saveThisRecordAsADraft')}
            leadingIcon={<Save size={14} aria-hidden />}
          >
            {msg('journal.saveDraft')}
          </Button>
          <Tooltip content={msg('tradeForm.submittingValidatesTheRecordAndWritesItTo')}>
            <Button
              variant="primary"
              size="md"
              disabled={submitState.kind === 'saving'}
              onClick={() => void run('submitted')}
              label={msg('tradeForm.submitThisTradeRecord')}
              leadingIcon={<Send size={14} aria-hidden />}
            >
              {msg('journal.submitTrade')}
            </Button>
          </Tooltip>
        </div>
      </footer>

      <Modal
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={msg('journal.discardThisRecord')}
        description={msg('tradeForm.leavingNowDropsEverythingEnteredOnThisForm')}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setConfirmDiscard(false)}
              label={msg('tradeForm.keepEditingThisRecord')}
            >
              Keep editing
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                setConfirmDiscard(false);
                setValues(initial);
                setTouched(false);
                setSubmitState({ kind: 'idle' });
                onCancel?.();
              }}
              label={msg('tradeForm.discardThisTradeRecord')}
              leadingIcon={<FileText size={14} aria-hidden />}
            >
              Discard and leave
            </Button>
          </>
        }
      >
        <p className="text-caption text-text-muted">
          {values.symbol === ''
            ? 'The record has no symbol yet.'
            : `The record is for ${values.symbol}.`}{' '}
          {values.checklist.length} {msg('journal.checklist')}{' '}
          {values.checklist.length === 1 ? 'item is' : 'items are'} {msg('journal.markedAnd')}{' '}
          {values.attachments.length}{' '}
          {values.attachments.length === 1 ? 'attachment slot is' : 'attachment slots are'}{' '}
          {msg('journal.selected')}
        </p>
      </Modal>
    </div>
  );
}
