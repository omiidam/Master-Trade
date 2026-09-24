import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { Badge } from '../Badge';
import { Button, IconButton } from '../Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../Card';
import { Input } from '../Input';
import { Tooltip } from '../Tooltip';

export interface SearchFacet {
  id: string;
  label: string;
  /** Illustrative number of records the facet would match. */
  matches: number;
}

export interface KnowledgeSearchProps {
  facets: readonly SearchFacet[];
  /** Facet group heading, e.g. "Trust" or "Source". */
  facetLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  activeFacets?: readonly string[];
  onToggleFacet?: (facetId: string) => void;
  /** Number of records the current filter matches in the illustrative set. */
  resultCount?: number;
  /** Card title; defaults to the search wording. */
  title?: string;
  description?: string;
  /** False for a facet-only group (a second filter dimension, one search box). */
  showInput?: boolean;
  className?: string;
}

/**
 * Knowledge search.
 *
 * The search box is a *literal text filter over the illustrative set*, and says
 * so. It is deliberately not dressed up as semantic retrieval: the real system
 * embeds, stores vectors and ranks by similarity in the backend, and pretending
 * a substring match is that would misrepresent the product to the person using
 * it. When the API lands, this component keeps its shape and swaps its engine.
 */
export function KnowledgeSearch({
  facets,
  facetLabel,
  value,
  onValueChange,
  activeFacets = [],
  onToggleFacet,
  resultCount,
  title = 'Search the knowledge base',
  description,
  showInput = true,
  className,
}: KnowledgeSearchProps) {
  const [showFacets, setShowFacets] = useState(true);
  const active = useMemo(() => new Set(activeFacets), [activeFacets]);

  return (
    <Card surface="data" className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">{title}</CardTitle>
          <CardDescription>
            {description ??
              (resultCount === undefined
                ? 'Literal text matching over the illustrative set'
                : `${resultCount} matching ${resultCount === 1 ? 'record' : 'records'} in the illustrative set`)}
          </CardDescription>
        </div>
        <Tooltip content={showFacets ? 'Hide filters' : 'Show filters'}>
          <IconButton
            label={showFacets ? 'Hide filters' : 'Show filters'}
            variant={showFacets ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setShowFacets((current) => !current)}
          >
            <SlidersHorizontal size={15} aria-hidden />
          </IconButton>
        </Tooltip>
      </CardHeader>

      <CardContent className="space-y-3">
        {showInput ? (
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-text-faint"
            >
              <Search size={14} />
            </span>
            <Input
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="Search by title, tag, source reference"
              aria-label="Search knowledge records"
              className="ps-8"
            />
            {value.length > 0 ? (
              <span className="absolute inset-y-0 end-1.5 flex items-center">
                <IconButton
                  label="Clear search"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onValueChange('')}
                >
                  <X size={13} aria-hidden />
                </IconButton>
              </span>
            ) : null}
          </div>
        ) : null}

        {showFacets ? (
          <div className="space-y-2">
            <p className="text-caption font-medium text-text-muted">{facetLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {facets.map((facet) => {
                const isActive = active.has(facet.id);
                return (
                  <button
                    key={facet.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onToggleFacet?.(facet.id)}
                    className="rounded-[var(--radius-pill)] focus-visible:outline-none"
                  >
                    <Badge tone={isActive ? 'primary' : 'outline'} dot={!isActive}>
                      {facet.label}
                      <span className="num ms-1 text-text-faint">{facet.matches}</span>
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <p className="text-caption text-text-faint">
          Preview filter: substring matching only. Semantic retrieval (embeddings, ranking,
          trust-filtered recall) is implemented in the backend but is not connected here.
          {showInput
            ? ''
            : ' This group narrows the same filter set — there is one search field on purpose.'}
        </p>
      </CardContent>
    </Card>
  );
}

/** Reset control for the filter set; kept separate so pages can place it. */
export function ClearFiltersButton({
  onClear,
  disabled,
}: {
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <Button size="sm" variant="ghost" onClick={onClear} disabled={disabled} className={cn('px-0')}>
      Reset filters
    </Button>
  );
}
