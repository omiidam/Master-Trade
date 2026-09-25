import { useId, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ASSET_CLASSES,
  CAPITAL_RANGES,
  EXPERIENCE_LEVELS,
  HORIZON_BANDS,
  LEARNING_GOALS,
  MAX_WEIGHT_PERCENT,
  MIN_WEIGHT_PERCENT,
  RISK_TOLERANCE_BANDS,
  TIMEFRAMES,
  TRADING_STYLES,
  emptyField,
  statedField,
  type AssetClass,
  type CapitalRange,
  type ContextField,
  type HorizonBand,
  type Holding,
  type LearningGoal,
  type ProfileTimeframe,
  type RiskToleranceBand,
  type TradingContext,
  type TradingStyle,
} from '@shared/profile/model';
import { Button } from '../Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../Card';
import { Field, Input, Select } from '../Input';
import { formatFieldValue } from './FactRow';
import { cn } from '../../lib/cn';
import { msg } from '../../i18n/index.js';

/**
 * The editable form for the declared context.
 *
 * Two rules shape it:
 *
 *   1. **A value with source `assumed` is never pre-filled.** Showing an assumption in an
 *      editable box is how an assumption becomes a "fact" — the user confirms a default
 *      they never chose. Only values the user gave us appear as current; everything else
 *      starts empty and has to be answered.
 *   2. **The server is the authority on validity.** The only checks here are the ones a
 *      person cannot be expected to get right by hand (weight ranges, duplicate symbols).
 *      Contradictions, bounds and vocabulary are validated by the shared schema on the
 *      way in, and the rejection comes back with the offending fields named.
 *
 * The whole document is submitted, never a patch: a merge would make "unchanged" and
 * "forgotten" indistinguishable.
 */

export interface ProfileEditorProps {
  context: TradingContext;
  saving: boolean;
  /** Field-level problems from the last rejected write, keyed by field name. */
  serverErrors?: { field: string; problem: string }[];
  onSubmit: (context: Omit<TradingContext, 'version' | 'createdAt'>) => void;
  onCancel?: () => void;
}

function current<T>(field: ContextField<T>): T | null {
  // An assumed value is not current: it was never stated.
  return field.source === 'assumed' ? null : field.value;
}

export function ProfileEditor({
  context,
  saving,
  serverErrors = [],
  onSubmit,
  onCancel,
}: ProfileEditorProps) {
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevelish>(
    current(context.experienceLevel),
  );
  const [markets, setMarkets] = useState<AssetClass[]>(current(context.markets) ?? []);
  const [instruments, setInstruments] = useState((current(context.instruments) ?? []).join(', '));
  const [tradingStyle, setTradingStyle] = useState<TradingStyle | null>(
    current(context.tradingStyle),
  );
  const [timeframe, setTimeframe] = useState<ProfileTimeframe | null>(current(context.timeframe));
  const [learningGoals, setLearningGoals] = useState<LearningGoal[]>(
    current(context.learningGoals) ?? [],
  );
  const [capitalRange, setCapitalRange] = useState<CapitalRange | null>(
    current(context.capitalRange),
  );
  const [riskTolerance, setRiskTolerance] = useState<RiskToleranceBand | null>(
    current(context.riskTolerance),
  );
  const [horizon, setHorizon] = useState<HorizonBand | null>(current(context.horizon));
  const [holdings, setHoldings] = useState<Holding[]>(current(context.holdings) ?? []);
  const [constraints, setConstraints] = useState<string[]>(
    (current(context.constraints) ?? []).map((constraint) => constraint.statement),
  );
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const weightTotal = useMemo(
    () =>
      Math.round(holdings.reduce((sum, holding) => sum + (holding.weightPercent || 0), 0) * 100) /
      100,
    [holdings],
  );

  const errorFor = (field: string): string | undefined =>
    localErrors[field] ?? serverErrors.find((entry) => entry.field === field)?.problem;

  // Errors that belong to a repeated control (a holding row, a constraint row) rather
  // than to a single `Field`. They are announced and the control they concern is marked
  // invalid and pointed at the message, so a screen-reader user is told where it is and
  // not only what it says.
  const idBase = useId();
  const holdingsError = errorFor('holdings');
  const holdingsErrorId = `${idBase}-holdings-error`;
  const constraintsError = errorFor('constraints');
  const constraintsErrorId = `${idBase}-constraints-error`;

  function toggleAssetClass(value: AssetClass): void {
    setMarkets((list) =>
      list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
    );
  }

  function toggleGoal(value: LearningGoal): void {
    setLearningGoals((list) =>
      list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
    );
  }

  function validateLocally(): boolean {
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    for (const holding of holdings) {
      const symbol = holding.symbol.trim().toUpperCase();
      if (symbol.length === 0) continue;
      if (seen.has(symbol)) errors.holdings = `Duplicate holding for ${symbol}.`;
      seen.add(symbol);
      if (
        !Number.isFinite(holding.weightPercent) ||
        holding.weightPercent < MIN_WEIGHT_PERCENT ||
        holding.weightPercent > MAX_WEIGHT_PERCENT
      ) {
        errors.holdings = `Each weight must be between ${MIN_WEIGHT_PERCENT} and ${MAX_WEIGHT_PERCENT}.`;
      }
    }
    if (holdings.length > 0 && weightTotal > MAX_WEIGHT_PERCENT) {
      errors.holdings = `Weights total ${weightTotal}%, which is more than a whole portfolio.`;
    }
    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function submit(): void {
    if (!validateLocally()) return;
    const now = new Date().toISOString();
    onSubmit({
      experienceLevel: experienceLevel ? statedField(experienceLevel, now) : emptyField(),
      markets: markets.length > 0 ? statedField(markets, now) : emptyField(),
      instruments:
        instruments.trim().length > 0
          ? statedField(
              instruments
                .split(',')
                .map((symbol) => symbol.trim())
                .filter((symbol) => symbol.length > 0),
              now,
            )
          : emptyField(),
      tradingStyle: tradingStyle ? statedField(tradingStyle, now) : emptyField(),
      timeframe: timeframe ? statedField(timeframe, now) : emptyField(),
      learningGoals: learningGoals.length > 0 ? statedField(learningGoals, now) : emptyField(),
      capitalRange: capitalRange ? statedField(capitalRange, now) : emptyField(),
      riskTolerance: riskTolerance ? statedField(riskTolerance, now) : emptyField(),
      horizon: horizon ? statedField(horizon, now) : emptyField(),
      holdings:
        holdings.length > 0
          ? statedField(
              holdings.map((holding) => ({
                ...holding,
                symbol: holding.symbol.trim().toUpperCase(),
              })),
              now,
            )
          : emptyField(),
      constraints:
        constraints.filter((statement) => statement.trim().length > 0).length > 0
          ? statedField(
              constraints
                .filter((statement) => statement.trim().length > 0)
                .map((statement, index) => ({
                  id: `c${index + 1}`,
                  statement: statement.trim(),
                  source: 'user-stated' as const,
                })),
              now,
            )
          : emptyField(),
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader divider>
          <CardTitle>{msg('profile.tradingPreferences')}</CardTitle>
          <CardDescription>{msg('profile.onlyWhatYouTellUsIs')}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label={msg('profileEditor.experienceLevel')}
            hint={msg('profileEditor.howMuchTradingExperienceYouWouldSayYou')}
          >
            {(props) => (
              <Select
                {...props}
                value={experienceLevel ?? ''}
                onChange={(event) =>
                  setExperienceLevel((event.target.value || null) as ExperienceLevelish)
                }
              >
                <option value="">{msg('profile.notProvided')}</option>
                {EXPERIENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {formatFieldValue(level)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={msg('profileEditor.tradingStyle')}>
            {(props) => (
              <Select
                {...props}
                value={tradingStyle ?? ''}
                onChange={(event) =>
                  setTradingStyle((event.target.value || null) as TradingStyle | null)
                }
              >
                <option value="">{msg('profile.notProvided')}</option>
                {TRADING_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {formatFieldValue(style)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={msg('profileEditor.primaryTimeframe')}>
            {(props) => (
              <Select
                {...props}
                value={timeframe ?? ''}
                onChange={(event) =>
                  setTimeframe((event.target.value || null) as ProfileTimeframe | null)
                }
              >
                <option value="">{msg('profile.notProvided')}</option>
                {TIMEFRAMES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label={msg('profileEditor.horizon')}
            hint={msg('profileEditor.overWhatHorizonYouUsuallyHoldAPosition')}
          >
            {(props) => (
              <Select
                {...props}
                value={horizon ?? ''}
                onChange={(event) => setHorizon((event.target.value || null) as HorizonBand | null)}
              >
                <option value="">{msg('profile.notProvided')}</option>
                {HORIZON_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label={msg('profileEditor.riskTolerance')}
            hint={msg('profileEditor.declaredByYouTheSystemNeverAssignsOne')}
          >
            {(props) => (
              <Select
                {...props}
                value={riskTolerance ?? ''}
                onChange={(event) =>
                  setRiskTolerance((event.target.value || null) as RiskToleranceBand | null)
                }
              >
                <option value="">{msg('profile.notProvided')}</option>
                {RISK_TOLERANCE_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {formatFieldValue(band)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label={msg('profileEditor.capitalRange')}
            hint={msg('profileEditor.aBandNeverAnAmountThereIsNo')}
          >
            {(props) => (
              <Select
                {...props}
                value={capitalRange ?? ''}
                onChange={(event) =>
                  setCapitalRange((event.target.value || null) as CapitalRange | null)
                }
              >
                <option value="">{msg('profile.notProvided')}</option>
                {CAPITAL_RANGES.map((range) => (
                  <option key={range} value={range}>
                    {formatFieldValue(range)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label={msg('profileEditor.preferredInstruments')}
            hint={msg('profileEditor.commaSeparatedOptionalLeaveBlankIfYou')}
            className="md:col-span-2"
          >
            {(props) => (
              <Input
                {...props}
                value={instruments}
                placeholder={msg('profile.eURUSDAAPLBTCUSD')}
                onChange={(event) => setInstruments(event.target.value)}
              />
            )}
          </Field>

          <fieldset className="space-y-2 md:col-span-2">
            <legend className="text-caption font-medium text-text-muted">
              {msg('profile.preferredMarkets')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {ASSET_CLASSES.map((assetClass) => {
                const active = markets.includes(assetClass);
                return (
                  <button
                    key={assetClass}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleAssetClass(assetClass)}
                    className={cn(
                      'rounded-[var(--radius-pill)] border px-3 py-1 text-caption transition-colors',
                      active
                        ? 'border-primary-border bg-primary-soft text-primary'
                        : 'border-border bg-surface-sunken text-text-muted hover:border-border-strong',
                    )}
                  >
                    {formatFieldValue(assetClass)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2 md:col-span-2">
            <legend className="text-caption font-medium text-text-muted">
              {msg('profile.learningGoals')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {LEARNING_GOALS.map((goal) => {
                const active = learningGoals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleGoal(goal)}
                    className={cn(
                      'rounded-[var(--radius-pill)] border px-3 py-1 text-caption transition-colors',
                      active
                        ? 'border-primary-border bg-primary-soft text-primary'
                        : 'border-border bg-surface-sunken text-text-muted hover:border-border-strong',
                    )}
                  >
                    {formatFieldValue(goal)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader divider>
          <CardTitle>{msg('profile.existingHoldings')}</CardTitle>
          <CardDescription>{msg('profile.optionalAndByPercentageOnlyThere')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {holdings.length === 0 ? (
            <p className="text-body text-text-faint italic">
              {msg('profile.noHoldingsDescribedAnalysisThatDepends')}
            </p>
          ) : (
            <ul className="space-y-2">
              {holdings.map((holding, index) => (
                <li key={`${holding.symbol}-${index}`} className="flex items-center gap-2">
                  <Input
                    aria-label={`Holding ${index + 1} symbol`}
                    value={holding.symbol}
                    placeholder="SYMBOL"
                    aria-invalid={holdingsError ? true : undefined}
                    aria-describedby={holdingsError ? holdingsErrorId : undefined}
                    onChange={(event) =>
                      setHoldings((list) =>
                        list.map((item, position) =>
                          position === index ? { ...item, symbol: event.target.value } : item,
                        ),
                      )
                    }
                    className="max-w-40"
                  />
                  <Input
                    aria-label={`Holding ${index + 1} weight percent`}
                    type="number"
                    step="0.01"
                    min={MIN_WEIGHT_PERCENT}
                    max={MAX_WEIGHT_PERCENT}
                    value={String(holding.weightPercent)}
                    aria-invalid={holdingsError ? true : undefined}
                    aria-describedby={holdingsError ? holdingsErrorId : undefined}
                    onChange={(event) =>
                      setHoldings((list) =>
                        list.map((item, position) =>
                          position === index
                            ? { ...item, weightPercent: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    className="max-w-28"
                  />
                  <Select
                    aria-label={`Holding ${index + 1} asset class`}
                    className="max-w-40"
                    value={holding.assetClass}
                    onChange={(event) =>
                      setHoldings((list) =>
                        list.map((item, position) =>
                          position === index
                            ? { ...item, assetClass: event.target.value as AssetClass }
                            : item,
                        ),
                      )
                    }
                  >
                    {ASSET_CLASSES.map((assetClass) => (
                      <option key={assetClass} value={assetClass}>
                        {formatFieldValue(assetClass)}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove holding ${index + 1}`}
                    onClick={() =>
                      setHoldings((list) => list.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setHoldings((list) => [
                  ...list,
                  { symbol: '', assetClass: 'equity', weightPercent: 0 },
                ])
              }
            >
              <Plus size={14} aria-hidden /> {msg('profile.addHolding')}
            </Button>
            {holdings.length > 0 ? (
              <span
                className={cn(
                  'text-caption',
                  weightTotal > MAX_WEIGHT_PERCENT ? 'text-danger' : 'text-text-muted',
                )}
              >
                {msg('profile.total')} {weightTotal}%
              </span>
            ) : null}
          </div>
          {holdingsError ? (
            <p id={holdingsErrorId} className="text-caption text-danger" role="alert">
              {holdingsError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader divider>
          <CardTitle>{msg('profile.constraintsAndPreferences')}</CardTitle>
          <CardDescription>{msg('profile.boundariesYouWantRespectedInYour')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {constraints.map((statement, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label={`Constraint ${index + 1}`}
                value={statement}
                placeholder={msg('profile.noSinglePositionAbove10Of')}
                aria-invalid={constraintsError ? true : undefined}
                aria-describedby={constraintsError ? constraintsErrorId : undefined}
                onChange={(event) =>
                  setConstraints((list) =>
                    list.map((item, position) => (position === index ? event.target.value : item)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove constraint ${index + 1}`}
                onClick={() =>
                  setConstraints((list) => list.filter((_, position) => position !== index))
                }
              >
                <Trash2 size={14} aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConstraints((list) => [...list, ''])}
          >
            <Plus size={14} aria-hidden /> {msg('profile.addConstraint')}
          </Button>
          {constraintsError ? (
            <p id={constraintsErrorId} className="text-caption text-danger" role="alert">
              {constraintsError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            {msg('journal.cancel')}
          </Button>
        ) : null}
        <Button type="button" onClick={submit} disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save as a new version'}
        </Button>
      </div>
    </div>
  );
}

type ExperienceLevelish = (typeof EXPERIENCE_LEVELS)[number] | null;
