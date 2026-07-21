import { useTranslation } from 'react-i18next';

import { formatLocaleNumber } from '@/frontend/lib/format-locale';
import type { SessionQuoteStats } from '@/frontend/hooks/use-live-quote';
import { cn } from '@/frontend/lib/utils';

const STAT_KEYS = ['open', 'high', 'low', 'volume'] as const;

/** Ruled OHLC ledger flush under the stock title row. */
export function SessionStatsRow({
  stats,
  className,
}: {
  stats: SessionQuoteStats | null;
  className?: string;
}) {
  const { t } = useTranslation('stock');
  if (
    !stats ||
    (stats.open === undefined &&
      stats.high === undefined &&
      stats.low === undefined &&
      stats.volume === undefined)
  ) {
    return null;
  }

  const values: Record<(typeof STAT_KEYS)[number], number | undefined> = {
    open: stats.open,
    high: stats.high,
    low: stats.low,
    volume: stats.volume,
  };

  return (
    <div
      className={cn(
        'grid grid-cols-2 border-t border-border sm:grid-cols-4',
        className,
      )}
    >
      {STAT_KEYS.map((key, index) => (
        <div
          key={key}
          className={cn(
            'flex items-baseline gap-2 px-5 py-2 lg:px-6',
            index % 2 === 1 && 'max-sm:border-l max-sm:border-border',
            index >= 2 && 'max-sm:border-t max-sm:border-border',
            index < STAT_KEYS.length - 1 &&
              'sm:border-r sm:border-border',
          )}
        >
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t(`stats.${key}`)}
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {values[key] !== undefined ? formatLocaleNumber(values[key]) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
