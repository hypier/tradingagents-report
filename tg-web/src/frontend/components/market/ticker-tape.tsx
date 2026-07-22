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
    <div className="-mx-3 border-y border-border sm:-mx-5 lg:-mx-6">
      <div
        className={cn(
          'grid min-w-0',
          count === 1
            ? 'grid-cols-1'
            : 'grid-cols-2 lg:[grid-template-columns:repeat(var(--pinned-cols),minmax(0,1fr))]',
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
                'flex h-full min-w-0 flex-col gap-2 px-3 py-3 quote-flash sm:px-4 lg:flex-row lg:items-center lg:gap-3',
                index % 2 === 1 && 'border-l border-border',
                index > 0 && 'lg:border-l lg:border-border',
                index >= 2 &&
                  count > 2 &&
                  'border-t border-border lg:border-t-0',
                isUp && 'bg-market-up-bg',
                isDown && 'bg-market-down-bg',
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <InstrumentLogo
                  symbol={quote.symbol}
                  logoUrl={quote.logo_url}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-normal tracking-tight text-foreground">
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
              </div>
              <div className="flex shrink-0 items-baseline justify-between gap-3 font-mono lg:ml-auto lg:block lg:text-right">
                <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground sm:text-base">
                  {formatLocaleNumber(quote.price)}
                </p>
                <p
                  className={cn(
                    'text-xs tabular-nums lg:mt-0.5',
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
    </div>
  );
}
