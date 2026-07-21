import { useTranslation } from 'react-i18next';

import { formatLocaleNumber } from '@/frontend/lib/format-locale';
import type { SessionQuoteStats } from '@/frontend/hooks/use-live-quote';
import { cn } from '@/frontend/lib/utils';

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">
        {value !== undefined ? formatLocaleNumber(value) : '—'}
      </p>
    </div>
  );
}

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

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 border border-border bg-card px-3.5 py-3 sm:grid-cols-4',
        className,
      )}
    >
      <Stat label={t('stats.open')} value={stats.open} />
      <Stat label={t('stats.high')} value={stats.high} />
      <Stat label={t('stats.low')} value={stats.low} />
      <Stat label={t('stats.volume')} value={stats.volume} />
    </div>
  );
}
