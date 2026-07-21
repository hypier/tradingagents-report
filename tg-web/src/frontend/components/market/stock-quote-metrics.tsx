import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/frontend/components/ui/badge';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { formatLocaleNumber } from '@/frontend/lib/format-locale';
import { cn } from '@/frontend/lib/utils';

export type StockQuoteMetricsData = {
  last_price?: number;
  change?: number;
  change_percent?: number;
  currency?: string;
};

function marketMoveVariant(changePercent?: number) {
  if (changePercent === undefined || changePercent === 0) return 'outline';
  return changePercent > 0 ? 'up' : 'down';
}

/** Price + change beside identity — actions stay in the right rail. */
export function StockQuoteMetrics({
  quote,
  loading,
  className,
}: {
  quote?: StockQuoteMetricsData | null;
  loading?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('home');
  const changePercent = quote?.change_percent;
  const change = quote?.change;
  const isUp = changePercent !== undefined && changePercent > 0;
  const isDown = changePercent !== undefined && changePercent < 0;

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
    return <Skeleton className={cn('h-8 w-36', className)} />;
  }

  if (!quote || quote.last_price === undefined) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-2 font-mono tabular-nums',
        className,
      )}
    >
      <span
        className={cn(
          'text-2xl font-semibold tracking-tight',
          isUp && 'text-market-up',
          isDown && 'text-market-down',
        )}
      >
        {formatLocaleNumber(quote.last_price)}
      </span>
      {quote.currency ? (
        <span className="text-[11px] text-muted-foreground">
          {quote.currency}
        </span>
      ) : null}
      <Badge
        variant={marketMoveVariant(changePercent)}
        className="h-6 gap-0.5 px-1.5 font-mono text-xs font-semibold"
      >
        {isUp ? <ArrowUpRight className="size-3.5" /> : null}
        {isDown ? <ArrowDownRight className="size-3.5" /> : null}
        {moveLabel}
      </Badge>
    </div>
  );
}
