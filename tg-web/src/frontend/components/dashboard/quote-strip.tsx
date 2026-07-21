import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { InstrumentIdentity } from '@/frontend/components/instrument-identity';
import { Avatar, AvatarFallback, AvatarImage } from '@/frontend/components/ui/avatar';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import {
  formatLocaleDateTimeValue,
  formatLocaleNumber,
} from '@/frontend/lib/format-locale';
import { snapshotFreshness, formatSnapshotDelay } from '@/frontend/lib/snapshot-freshness';
import { cn } from '@/frontend/lib/utils';
import { formatDisplayTicker } from '@/shared/listing';

export type QuoteStripData = {
  ticker: string;
  display_ticker?: string;
  display_name?: string;
  last_price?: number;
  change?: number;
  change_percent?: number;
  currency?: string;
  source?: string;
  as_of?: string;
  update_mode?: string;
  delay_seconds?: number;
  logo_url?: string;
};

function marketMoveVariant(changePercent?: number) {
  if (changePercent === undefined || changePercent === 0) return 'outline';
  return changePercent > 0 ? 'up' : 'down';
}

export function QuoteStrip({
  quote,
  loading,
  detailHref,
  className,
  variant = 'strip',
}: {
  quote?: QuoteStripData | null;
  loading?: boolean;
  detailHref?: string;
  className?: string;
  /** strip = inline under search; panel = stacked card for rail */
  variant?: 'strip' | 'panel';
}) {
  const { t } = useTranslation('home');
  const freshness = snapshotFreshness({
    asOf: quote?.as_of,
    updateMode: quote?.update_mode,
    delaySeconds: quote?.delay_seconds,
  });
  const delayLabel = formatSnapshotDelay({
    asOf: quote?.as_of,
    updateMode: quote?.update_mode,
    delaySeconds: quote?.delay_seconds,
  });
  const changePercent = quote?.change_percent;
  const change = quote?.change;
  const isUp = changePercent !== undefined && changePercent > 0;
  const isDown = changePercent !== undefined && changePercent < 0;
  const isPanel = variant === 'panel';

  const changeAmountLabel =
    change !== undefined
      ? `${change >= 0 ? '+' : ''}${formatLocaleNumber(change)}`
      : null;
  const changePercentLabel =
    changePercent === undefined
      ? null
      : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
  const moveLabel =
    changePercentLabel === null
      ? t('snapshot.changeUnavailable')
      : changeAmountLabel
        ? `${changeAmountLabel} (${changePercentLabel})`
        : changePercentLabel;

  if (loading) {
    return (
      <Skeleton
        className={cn(isPanel ? 'h-36 w-full' : 'h-[4.75rem] w-full', className)}
      />
    );
  }

  if (!quote) {
    return (
      <div
        className={cn(
          'flex gap-3 border border-dashed border-border bg-muted/25',
          isPanel
            ? 'flex-col items-center px-4 py-6 text-center'
            : 'items-center px-3.5 py-3.5',
          className,
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center border border-border bg-card text-primary">
          <Search className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('snapshot.emptyTitle')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t('snapshot.emptyBody')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border border-border bg-card',
        isPanel
          ? 'flex flex-col gap-3 px-4 py-4'
          : 'flex flex-wrap items-center gap-x-4 gap-y-2.5 px-3.5 py-3',
        isUp && 'border-market-up/25 bg-market-up-bg/20',
        isDown && 'border-market-down/25 bg-market-down-bg/20',
        className,
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-3', isPanel && 'w-full items-start')}>
        <Avatar
          className={cn(
            'shrink-0 !rounded-none after:hidden',
            isPanel ? 'size-14!' : 'size-10!',
          )}
          data-logo-url={quote.logo_url}
        >
          <AvatarImage
            key={quote.logo_url ?? 'missing'}
            src={quote.logo_url}
            alt={t('snapshot.logoAlt', {
              name: quote.display_name ?? quote.ticker,
            })}
            className="!rounded-none object-contain"
          />
          <AvatarFallback className="!rounded-none text-sm font-semibold">
            {quote.ticker.slice(0, 1)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <InstrumentIdentity
            density="row"
            name={quote.display_name}
            ticker={
              quote.display_ticker ?? formatDisplayTicker(quote.ticker)
            }
            nameClassName="font-semibold"
          />
          <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span
              className={cn(
                'mr-1.5 inline-block size-1.5 align-middle',
                freshness === 'stale'
                  ? 'bg-primary'
                  : isDown
                    ? 'bg-market-down'
                    : 'bg-market-up',
              )}
            />
            {freshness === 'stale'
              ? delayLabel
                ? t('snapshot.staleWithAge', { age: delayLabel })
                : t('snapshot.stale')
              : t('snapshot.asOf')}
            {quote.source ? ` · ${quote.source}` : ''}
            {quote.as_of ? ` · ${formatLocaleDateTimeValue(quote.as_of)}` : ''}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'flex items-baseline gap-2.5 font-mono tabular-nums',
          isPanel
            ? 'w-full justify-between border-t border-border/60 pt-3'
            : 'ml-auto',
        )}
      >
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-semibold tracking-tight',
              isPanel ? 'text-3xl' : 'text-2xl',
              isUp && 'text-market-up',
              isDown && 'text-market-down',
            )}
          >
            {quote.last_price !== undefined
              ? formatLocaleNumber(quote.last_price)
              : '—'}
          </span>
          {quote.currency ? (
            <span className="text-[11px] text-muted-foreground">
              {quote.currency}
            </span>
          ) : null}
        </div>
        <Badge
          variant={marketMoveVariant(changePercent)}
          className="h-6 gap-0.5 px-1.5 font-mono text-xs font-semibold"
        >
          {isUp ? <ArrowUpRight className="size-3.5" /> : null}
          {isDown ? <ArrowDownRight className="size-3.5" /> : null}
          {moveLabel}
        </Badge>
      </div>

      {detailHref ? (
        <Button
          asChild
          variant="outline"
          size="sm"
          className={cn('shrink-0', isPanel ? 'w-full' : 'h-8 px-2.5 text-xs')}
        >
          <Link to={detailHref}>{t('snapshot.openDetail')}</Link>
        </Button>
      ) : null}
    </div>
  );
}
