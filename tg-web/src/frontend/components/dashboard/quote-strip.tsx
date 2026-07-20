import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/frontend/components/ui/avatar';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import {
  formatLocaleDateTimeValue,
  formatLocaleNumber,
} from '@/frontend/lib/format-locale';
import { snapshotFreshness } from '@/frontend/lib/snapshot-freshness';
import { cn } from '@/frontend/lib/utils';
import { formatDisplayTicker } from '@/shared/listing';

export type QuoteStripData = {
  ticker: string;
  display_ticker?: string;
  display_name?: string;
  last_price?: number;
  change_percent?: number;
  currency?: string;
  source?: string;
  as_of?: string;
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
  /** strip = inline row; panel = stacked card for rail */
  variant?: 'strip' | 'panel';
}) {
  const { t } = useTranslation('home');
  const freshness = snapshotFreshness(quote?.as_of);
  const changePercent = quote?.change_percent;
  const isUp = changePercent !== undefined && changePercent > 0;
  const isDown = changePercent !== undefined && changePercent < 0;
  const isPanel = variant === 'panel';

  if (loading) {
    return (
      <Skeleton
        className={cn(isPanel ? 'h-36 w-full' : 'h-[5.5rem] w-full', className)}
      />
    );
  }

  if (!quote) {
    return (
      <div
        className={cn(
          'flex gap-3 border border-dashed border-border/80 bg-muted/20',
          isPanel
            ? 'flex-col items-center px-4 py-6 text-center'
            : 'items-center px-4 py-4',
          className,
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
          <Search className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('snapshot.emptyTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('snapshot.emptyBody')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border border-border bg-card ring-1 ring-border/80',
        isPanel ? 'flex flex-col gap-3 px-4 py-4' : 'flex flex-wrap items-center gap-4 px-4 py-3.5',
        isUp && 'border-market-up/30 bg-market-up-bg/30 ring-market-up/10',
        isDown && 'border-market-down/30 bg-market-down-bg/30 ring-market-down/10',
        className,
      )}
    >
      <div className={cn('flex items-start gap-3.5', isPanel && 'w-full')}>
        <Avatar
          className={cn(
            'shrink-0',
            isPanel ? 'size-16!' : 'size-12!',
          )}
          data-logo-url={quote.logo_url}
        >
          <AvatarImage
            src={quote.logo_url}
            alt={t('snapshot.logoAlt', {
              name: quote.display_name ?? quote.ticker,
            })}
          />
          <AvatarFallback className="text-lg font-semibold">
            {quote.ticker.slice(0, 1)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold tracking-tight">
              {quote.display_name ?? quote.ticker}
            </p>
            <Badge
              variant="secondary"
              className="font-mono text-xs tracking-wider"
            >
              {quote.display_ticker ?? formatDisplayTicker(quote.ticker)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 font-mono text-xs tabular-nums"
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  freshness === 'stale'
                    ? 'bg-primary'
                    : isDown
                      ? 'bg-market-down'
                      : 'bg-market-up',
                )}
              />
              {freshness === 'stale' ? t('snapshot.stale') : t('snapshot.asOf')}
            </Badge>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {quote.source ?? 'TradingView'}
              {quote.as_of ? ` · ${formatLocaleDateTimeValue(quote.as_of)}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'flex items-baseline gap-2.5 font-mono tabular-nums',
          isPanel && 'w-full justify-between border-t border-border/60 pt-3',
        )}
      >
        <div className="flex items-baseline gap-2">
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
            <span className="text-xs text-muted-foreground">{quote.currency}</span>
          ) : null}
        </div>
        <Badge
          variant={marketMoveVariant(changePercent)}
          className="h-6 gap-0.5 px-1.5 font-mono text-xs font-semibold"
        >
          {isUp ? <ArrowUpRight className="size-4" /> : null}
          {isDown ? <ArrowDownRight className="size-4" /> : null}
          {changePercent === undefined
            ? t('snapshot.changeUnavailable')
            : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
        </Badge>
      </div>

      {detailHref ? (
        <Button
          asChild
          variant="outline"
          size="sm"
          className={cn('shrink-0', isPanel && 'w-full')}
        >
          <Link to={detailHref}>{t('snapshot.openDetail')}</Link>
        </Button>
      ) : null}
    </div>
  );
}
