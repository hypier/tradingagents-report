import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';

import { InstrumentLogo } from '@/frontend/components/instrument-logo';
import { Badge } from '@/frontend/components/ui/badge';
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
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-2.5',
        'quote-flash',
      )}
    >
      <Badge
        variant="secondary"
        className="h-5 border-transparent bg-muted px-1.5 font-mono text-[11px] font-medium tracking-wide text-foreground"
      >
        {ticker}
      </Badge>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatLocaleNumber(quote.price)}
      </span>
      <span
        className={cn(
          'font-mono text-[11px] tabular-nums',
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
        className="transition-colors hover:bg-muted/50"
      >
        {content}
      </Link>
    );
  }
  return content;
}

/**
 * White ticker ribbon — codes sit on gray badges.
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
        'group relative overflow-hidden border-b border-border bg-background',
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

/** Elevated index strip — card surface; name quiet, price + change lead. */
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
    <div className="border-b border-border bg-card">
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
                'flex h-12 min-w-0 items-center gap-2.5 px-3 quote-flash sm:px-4',
                index % 2 === 1 && 'border-l border-border',
                index > 0 && 'lg:border-l lg:border-border',
                index >= 2 &&
                  count > 2 &&
                  'border-t border-border lg:border-t-0',
                isUp && 'bg-market-up-bg',
                isDown && 'bg-market-down-bg',
              )}
            >
              <InstrumentLogo
                symbol={quote.symbol}
                logoUrl={quote.logo_url}
                size="sm"
                className="hidden shrink-0 sm:flex"
              />
              <p className="min-w-0 flex-1 truncate font-mono text-xs tracking-wide text-muted-foreground">
                {label}
              </p>
              <div className="flex shrink-0 items-baseline gap-2 font-mono">
                <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
                  {formatLocaleNumber(quote.price)}
                </p>
                <p
                  className={cn(
                    'text-xs tabular-nums',
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
                className="block min-w-0 transition-colors hover:brightness-[0.98] dark:hover:brightness-110"
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
