import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';

import { InstrumentLogo } from '@/frontend/components/instrument-logo';
import { cn } from '@/frontend/lib/utils';
import { formatLocaleNumber } from '@/frontend/lib/format-locale';
import type { MarketTapeQuote } from '@/shared/market-board';

function changeClass(changePercent: number) {
  if (changePercent > 0) return 'text-market-up';
  if (changePercent < 0) return 'text-market-down';
  return 'text-muted-foreground';
}

function symbolLabel(symbol: string) {
  return symbol.includes(':') ? symbol.split(':', 2)[1]! : symbol;
}

/** Single-line ticker unit — no cell borders; continuous floor scroll. */
function TapeChip({
  quote,
  flashKey,
}: {
  quote: MarketTapeQuote;
  flashKey?: string | number;
}) {
  const changeLabel = `${quote.change_percent >= 0 ? '+' : ''}${quote.change_percent.toFixed(2)}%`;
  const ticker = symbolLabel(quote.symbol);
  const content = (
    <span
      key={flashKey}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-3',
        'quote-flash',
      )}
    >
      <InstrumentLogo
        symbol={quote.symbol}
        logoUrl={quote.logo_url}
        size="xs"
      />
      <span className="font-mono text-xs font-medium tracking-wide text-foreground">
        {ticker}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground">
        {formatLocaleNumber(quote.price)}
      </span>
      <span
        className={cn(
          'font-mono text-xs tabular-nums',
          changeClass(quote.change_percent),
        )}
      >
        {changeLabel}
      </span>
    </span>
  );

  if (quote.linkable) {
    return (
      <Link
        to={`/stocks/${encodeURIComponent(quote.symbol)}`}
        className="transition-colors hover:bg-muted/40"
      >
        {content}
      </Link>
    );
  }
  return content;
}

/**
 * Full-bleed ticker ribbon: flush to pane edges, no vertical cell rules.
 */
export function TickerTape({
  items,
  className,
  updatedAt,
}: {
  items: MarketTapeQuote[];
  className?: string;
  /** Bumps flash animation when tape refetches. */
  updatedAt?: number;
}) {
  if (!items.length) return null;
  const loop = [...items, ...items];

  return (
    <div
      className={cn(
        'group relative overflow-hidden border-b border-border bg-card',
        className,
      )}
    >
      <div className="ticker-tape-track flex w-max items-center group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:w-full motion-reduce:overflow-x-auto">
        {loop.map((quote, index) => (
          <TapeChip
            key={`${quote.symbol}-${index}`}
            quote={quote}
            flashKey={updatedAt}
          />
        ))}
      </div>
    </div>
  );
}

/** Ruled index strip — equal-width cells that always fill the row. */
export function PinnedIndices({
  items,
  updatedAt,
}: {
  items: MarketTapeQuote[];
  updatedAt?: number;
}) {
  if (!items.length) return null;
  const count = items.length;

  return (
    <div
      className={cn(
        'grid border-y border-border',
        count === 1 ? 'grid-cols-1' : 'grid-cols-2',
        'sm:[grid-template-columns:repeat(var(--pinned-cols),minmax(0,1fr))]',
      )}
      style={{ '--pinned-cols': String(count) } as CSSProperties}
    >
      {items.map((quote, index) => {
        const label = symbolLabel(quote.symbol);
        const changeLabel = `${quote.change_percent >= 0 ? '+' : ''}${quote.change_percent.toFixed(2)}%`;
        const isUp = quote.change_percent > 0;
        const isDown = quote.change_percent < 0;
        const cell = (
          <div
            key={updatedAt}
            className={cn(
              'flex h-full items-center gap-3 px-4 py-3 quote-flash',
              index % 2 === 1 && 'border-l border-border',
              index > 0 && 'sm:border-l sm:border-border',
              index >= 2 && count > 2 && 'border-t border-border sm:border-t-0',
              isUp && 'bg-market-up-bg',
              isDown && 'bg-market-down-bg',
            )}
          >
            <InstrumentLogo
              symbol={quote.symbol}
              logoUrl={quote.logo_url}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium tracking-tight text-foreground">
                {quote.name || label}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">
                {label}
                {quote.currency ? (
                  <span className="text-muted-foreground/70">
                    {' '}
                    / {quote.currency}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="shrink-0 text-right font-mono">
              <p className="text-base font-semibold tabular-nums tracking-tight text-foreground">
                {formatLocaleNumber(quote.price)}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-xs tabular-nums',
                  changeClass(quote.change_percent),
                )}
              >
                {changeLabel}
              </p>
            </div>
          </div>
        );
        if (quote.linkable) {
          return (
            <Link
              key={quote.symbol}
              to={`/stocks/${encodeURIComponent(quote.symbol)}`}
              className="block min-w-0 transition-colors hover:bg-muted/30"
            >
              {cell}
            </Link>
          );
        }
        return (
          <div key={quote.symbol} className="min-w-0">
            {cell}
          </div>
        );
      })}
    </div>
  );
}
