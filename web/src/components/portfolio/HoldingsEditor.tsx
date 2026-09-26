import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { PORTFOLIO_CURRENCIES } from '@shared/portfolio/model';
import type { Portfolio, PortfolioDocumentBody } from '@shared/portfolio/model';
import { ASSET_CLASSES, MAX_SYMBOL_LENGTH, SYMBOL_PATTERN } from '@shared/profile/model';
import { Badge } from '../Badge';
import { Button, IconButton } from '../Button';
import { Card, CardContent, CardHeader, CardTile, CardTitle } from '../Card';
import { Field, Input, Select } from '../Input';
import { assetClassLabel } from './labels';
import { msg } from '../../i18n/index.js';

/**
 * Declaring a composition.
 *
 * The form builds the document the API accepts, and nothing more: no id, no value, no version
 * and no timestamp travels from here, because the server mints the first and computes the
 * rest. A field this editor let a client set would be a client setting a fact about somebody's
 * portfolio.
 *
 * Three properties the shape of the form exists to keep:
 *
 *   1. **Every field is optional except the symbol.** A user may know a quantity and not an
 *      entry price, or a declared share and no price at all. Blank is stored as `null` — "I did
 *      not say" — and never defaulted to zero, because a zero quantity is a position that does
 *      not exist, which is a different statement.
 *   2. **A price is all-or-nothing.** The engine refuses a price with no observation time or no
 *      provenance, and so does the form: the price is only sent when its value and its
 *      observation time are both filled in.
 *   3. **The document is sent whole.** A declaration replaces the composition rather than
 *      patching rows, so a partly saved edit cannot leave a portfolio that is half what the
 *      user described and half what they meant.
 *
 * Validation failures come back from the server and are printed as they arrived. The form does
 * not restate a rule in the browser: two validators that can disagree is the failure mode the
 * API schema exists to avoid.
 */

interface DraftPosition {
  key: string;
  symbol: string;
  assetClass: string;
  currency: string;
  quantity: string;
  averageEntryPrice: string;
  weightPercent: string;
  price: string;
  priceObservedAt: string;
  note: string;
}

export interface HoldingsEditorProps {
  /** The current composition, so the form opens on what is stored rather than on nothing. */
  portfolio: Portfolio | null;
  saving: boolean;
  /** Field issues returned by the server, exactly as they arrived. */
  validationIssues: readonly string[];
  onSubmit: (document: PortfolioDocumentBody) => void | Promise<void>;
  onCancel?: (() => void) | undefined;
  className?: string;
}

let draftCounter = 0;

function blankPosition(): DraftPosition {
  draftCounter += 1;
  return {
    key: `draft-${draftCounter}`,
    symbol: '',
    assetClass: 'equity',
    currency: 'USD',
    quantity: '',
    averageEntryPrice: '',
    weightPercent: '',
    price: '',
    priceObservedAt: '',
    note: '',
  };
}

/**
 * The stored values, as editable text.
 *
 * A value with no observation time is deliberately **not** pre-filled: the engine treats it as
 * an assumption, and showing an assumption in an editable box is how an assumption becomes a
 * fact the user never chose.
 */
function draftFrom(position: Portfolio['positions'][number]): DraftPosition {
  draftCounter += 1;
  const stated = <T,>(field: { value: T | null; source: string }): string =>
    field.source === 'assumed' || field.value === null ? '' : String(field.value);
  return {
    key: `draft-${draftCounter}`,
    symbol: position.symbol,
    assetClass: position.assetClass,
    currency: position.currency,
    quantity: stated(position.quantity),
    averageEntryPrice: stated(position.averageEntryPrice),
    weightPercent: position.weightPercent === null ? '' : String(position.weightPercent),
    price: position.price === null ? '' : String(position.price.value),
    priceObservedAt: position.price === null ? '' : position.price.observedAt.slice(0, 16),
    note: position.note ?? '',
  };
}

function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The declared-number shape the schema expects: a value, where it came from, and when. */
function declared(raw: string) {
  return { value: numberOrNull(raw), source: 'user-stated' as const, observedAt: null };
}

export function HoldingsEditor({
  portfolio,
  saving,
  validationIssues,
  onSubmit,
  onCancel,
  className,
}: HoldingsEditorProps) {
  const [name, setName] = useState(portfolio?.name ?? 'My portfolio');
  const [baseCurrency, setBaseCurrency] = useState<string>(portfolio?.baseCurrency ?? 'USD');
  const [cashWeight, setCashWeight] = useState<string>(
    portfolio?.cashWeightPercent === null || portfolio?.cashWeightPercent === undefined
      ? ''
      : String(portfolio.cashWeightPercent),
  );
  const [positions, setPositions] = useState<DraftPosition[]>(() =>
    portfolio === null || portfolio.positions.length === 0
      ? [blankPosition()]
      : portfolio.positions.map(draftFrom),
  );
  const [formError, setFormError] = useState<string | null>(null);

  function update(key: string, patch: Partial<DraftPosition>): void {
    setPositions((current) =>
      current.map((position) => (position.key === key ? { ...position, ...patch } : position)),
    );
  }

  function validateLocally(): boolean {
    const seen = new Set<string>();
    for (const position of positions) {
      const symbol = position.symbol.trim();
      if (symbol.length === 0) {
        setFormError('Every position needs a symbol.');
        return false;
      }
      if (symbol.length > MAX_SYMBOL_LENGTH || !SYMBOL_PATTERN.test(symbol)) {
        setFormError(
          `"${symbol}" is not a symbol this product recognises: letters, digits and . : / _ - only, up to ${MAX_SYMBOL_LENGTH} characters.`,
        );
        return false;
      }
      const key = symbol.toUpperCase();
      if (seen.has(key)) {
        setFormError(`"${key}" is listed more than once, so its size would be ambiguous.`);
        return false;
      }
      seen.add(key);
    }
    return true;
  }

  function submit(): void {
    setFormError(null);
    if (!validateLocally()) return;

    const document: PortfolioDocumentBody = {
      name: name.trim().length === 0 ? 'My portfolio' : name.trim(),
      baseCurrency: baseCurrency as PortfolioDocumentBody['baseCurrency'],
      cashWeightPercent: numberOrNull(cashWeight),
      positions: positions.map((position) => {
        const currency =
          position.currency as PortfolioDocumentBody['positions'][number]['currency'];
        const observedAt = position.priceObservedAt.trim();
        const hasPrice = position.price.trim().length > 0 && observedAt.length > 0;
        return {
          symbol: position.symbol.trim().toUpperCase(),
          assetClass:
            position.assetClass as PortfolioDocumentBody['positions'][number]['assetClass'],
          currency,
          quantity: declared(position.quantity),
          averageEntryPrice: declared(position.averageEntryPrice),
          price: hasPrice
            ? {
                value: Number(position.price),
                currency,
                // The datetime-local control yields a local wall time; it is stored as the
                // instant the user meant rather than silently reinterpreted as UTC.
                observedAt: new Date(observedAt).toISOString(),
                provenance: {
                  source: 'user' as const,
                  ref: 'declared-in-form',
                  trust: 'unverified' as const,
                  recordedAt: new Date(observedAt).toISOString(),
                },
              }
            : null,
          weightPercent: numberOrNull(position.weightPercent),
          ...(position.note.trim().length === 0 ? {} : { note: position.note.trim() }),
        };
      }),
    };

    void onSubmit(document);
  }

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Save size={16} aria-hidden className="text-text-muted" />
          <CardTitle>{msg('portfolio.declareTheComposition')}</CardTitle>
          <Badge tone="outline">{msg('portfolio.replacesTheCurrentVersion')}</Badge>
          <Badge tone="neutral">{msg('portfolio.everyFigureIsComputedOnThe')}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={msg('holdingsEditor.name')}>
            {(inputProps) => (
              <Input
                {...inputProps}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
            )}
          </Field>

          <Field label={msg('holdingsEditor.baseCurrency')}>
            {(inputProps) => (
              <Select
                {...inputProps}
                value={baseCurrency}
                onChange={(event) => setBaseCurrency(event.target.value)}
              >
                {PORTFOLIO_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label={msg('holdingsEditor.cashWeight')}
            hint={msg('holdingsEditor.optionalTheShareHeldAsCashWhenYou')}
          >
            {(inputProps) => (
              <Input
                {...inputProps}
                inputMode="decimal"
                value={cashWeight}
                onChange={(event) => setCashWeight(event.target.value)}
                placeholder={msg('portfolio.blankStaysBlank')}
              />
            )}
          </Field>
        </div>

        <div className="space-y-3">
          {positions.map((position, index) => (
            <CardTile as="fieldset" key={position.key} space="roomy" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-body font-medium text-text">
                  {msg('portfolio.position2')} {index + 1}
                </legend>
                <IconButton
                  label={`Remove position ${index + 1}`}
                  variant="ghost"
                  size="sm"
                  disabled={positions.length === 1}
                  onClick={() =>
                    setPositions((current) => current.filter((entry) => entry.key !== position.key))
                  }
                >
                  <Trash2 size={14} aria-hidden />
                </IconButton>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={msg('tradeForm.symbol')} hint={msg('holdingsEditor.required')}>
                  {(inputProps) => (
                    <Input
                      {...inputProps}
                      value={position.symbol}
                      onChange={(event) => update(position.key, { symbol: event.target.value })}
                      placeholder={msg('portfolio.eGVOO')}
                    />
                  )}
                </Field>

                <Field label={msg('holdingsEditor.assetClass')}>
                  {(inputProps) => (
                    <Select
                      {...inputProps}
                      value={position.assetClass}
                      onChange={(event) => update(position.key, { assetClass: event.target.value })}
                    >
                      {ASSET_CLASSES.map((assetClass) => (
                        <option key={assetClass} value={assetClass}>
                          {assetClassLabel(assetClass)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label={msg('evaluationPanels.currency')}>
                  {(inputProps) => (
                    <Select
                      {...inputProps}
                      value={position.currency}
                      onChange={(event) => update(position.key, { currency: event.target.value })}
                    >
                      {PORTFOLIO_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  label={msg('portfolio.quantity')}
                  hint={msg('holdingsEditor.blankStaysBlankNeverReadAsZero')}
                >
                  {(inputProps) => (
                    <Input
                      {...inputProps}
                      inputMode="decimal"
                      value={position.quantity}
                      onChange={(event) => update(position.key, { quantity: event.target.value })}
                    />
                  )}
                </Field>

                <Field label={msg('holdingsEditor.averageEntryPrice')}>
                  {(inputProps) => (
                    <Input
                      {...inputProps}
                      inputMode="decimal"
                      value={position.averageEntryPrice}
                      onChange={(event) =>
                        update(position.key, { averageEntryPrice: event.target.value })
                      }
                    />
                  )}
                </Field>

                <Field label={msg('holdingsEditor.currentPrice')}>
                  {(inputProps) => (
                    <Input
                      {...inputProps}
                      inputMode="decimal"
                      value={position.price}
                      onChange={(event) => update(position.key, { price: event.target.value })}
                    />
                  )}
                </Field>

                <Field
                  label={msg('holdingsEditor.priceObservedAt')}
                  hint={msg('holdingsEditor.requiredWithAPriceAnUndatedPriceIs')}
                >
                  {(inputProps) => (
                    <Input
                      {...inputProps}
                      type="datetime-local"
                      value={position.priceObservedAt}
                      onChange={(event) =>
                        update(position.key, { priceObservedAt: event.target.value })
                      }
                    />
                  )}
                </Field>

                <Field
                  label={msg('holdingsEditor.declaredWeight')}
                  hint={msg('holdingsEditor.optionalAndUsedOnlyWhenNoPriceExists')}
                >
                  {(inputProps) => (
                    <Input
                      {...inputProps}
                      inputMode="decimal"
                      value={position.weightPercent}
                      onChange={(event) =>
                        update(position.key, { weightPercent: event.target.value })
                      }
                    />
                  )}
                </Field>
              </div>

              <Field label={msg('feedbackStates.note')}>
                {(inputProps) => (
                  <Input
                    {...inputProps}
                    value={position.note}
                    onChange={(event) => update(position.key, { note: event.target.value })}
                  />
                )}
              </Field>
            </CardTile>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<Plus size={14} aria-hidden />}
          onClick={() => setPositions((current) => [...current, blankPosition()])}
        >
          {msg('portfolio.addPosition')}
        </Button>

        {formError === null ? null : (
          <p role="alert" className="text-body text-danger">
            {formError}
          </p>
        )}

        {validationIssues.length > 0 ? (
          <div className="space-y-1 rounded-[var(--radius-control)] border border-danger/40 bg-danger-soft px-3 py-2">
            <p className="text-body font-medium text-danger">
              {msg('portfolio.theDeclarationWasRejectedByThe')}
            </p>
            <ul className="list-disc space-y-0.5 ps-5 text-body text-text" role="list">
              {validationIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={submit}
            disabled={saving}
            leadingIcon={<Save size={14} aria-hidden />}
          >
            {saving ? 'Saving…' : 'Save declaration'}
          </Button>
          {onCancel === undefined ? null : (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              {msg('journal.cancel')}
            </Button>
          )}
        </div>

        <p className="text-caption text-text-faint">{msg('portfolio.nothingHereIsValuedInThe')}</p>
      </CardContent>
    </Card>
  );
}
