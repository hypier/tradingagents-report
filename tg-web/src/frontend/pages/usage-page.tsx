import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
import { PageFrame, StatTile } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/frontend/components/ui/empty';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { getBillingOverview } from '@/frontend/lib/billing';
import {
  formatCreditDelta,
  localizeEntryType,
  localizeLedgerActivity,
  resolveLedgerPoolDeltas,
  type BillingLedgerEntry,
  type LedgerPoolDeltas,
} from '@/frontend/lib/billing-ui';
import {
  formatLocaleDate,
  formatLocaleDateTimeValue,
} from '@/frontend/lib/format-locale';
import { cn } from '@/frontend/lib/utils';
import { formatDisplayTicker } from '@/shared/listing';

function entryTypeBadgeVariant(
  entryType: string,
): 'info' | 'down' | 'running' | 'destructive' | 'outline' {
  switch (entryType) {
    case 'grant':
      return 'info';
    case 'consume':
      return 'down';
    case 'adjustment':
      return 'running';
    case 'expire':
    case 'clawback':
      return 'destructive';
    default:
      return 'outline';
  }
}

function LedgerChangeCell({
  pools,
  entry,
}: {
  pools: LedgerPoolDeltas;
  entry: BillingLedgerEntry;
}) {
  if (pools.period === null && pools.bonus === null) {
    return (
      <span className="font-medium tabular-nums">
        {formatCreditDelta(entry.availableDelta)}
      </span>
    );
  }

  const values: number[] = [];
  if (pools.period !== null && pools.period !== 0) values.push(pools.period);
  if (pools.bonus !== null && pools.bonus !== 0) values.push(pools.bonus);
  if (values.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      {values.map((value, index) => (
        <span key={`${index}-${value}`} className="font-medium tabular-nums">
          {formatCreditDelta(value)}
        </span>
      ))}
    </div>
  );
}

function LedgerAccountCell({ pools }: { pools: LedgerPoolDeltas }) {
  const { t } = useTranslation('billing');
  const rows: Array<{ label: string; tone: 'period' | 'bonus' }> = [];
  if (pools.period !== null && pools.period !== 0) {
    rows.push({ label: t('ledger.poolPeriod'), tone: 'period' });
  }
  if (pools.bonus !== null && pools.bonus !== 0) {
    rows.push({ label: t('ledger.poolBonus'), tone: 'bonus' });
  }
  if (rows.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <span
          key={row.tone}
          className={cn(
            'text-sm font-medium',
            row.tone === 'period'
              ? 'text-sky-600 dark:text-sky-400'
              : 'text-yellow-600 dark:text-yellow-400',
          )}
        >
          {row.label}
        </span>
      ))}
    </div>
  );
}

function LedgerReportCell({ entry }: { entry: BillingLedgerEntry }) {
  const report = entry.analysisReport;
  if (!report) {
    return <span className="text-muted-foreground">-</span>;
  }

  const ticker =
    report.displayTicker?.trim() ||
    formatDisplayTicker(report.ticker) ||
    report.ticker;
  const reportTitle = report.displayName?.trim()
    ? `${report.displayName.trim()} (${ticker})`
    : ticker;

  return (
    <Link
      to={`/reports/${report.id}`}
      className="text-sm underline-offset-2 hover:underline"
    >
      {reportTitle}
      {report.tradeDate ? ` · ${report.tradeDate}` : ''}
    </Link>
  );
}

/** 用量：余额与本周期额度流水。 */
export function UsagePage() {
  const { t } = useTranslation('billing');
  const overview = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
  });
  const data = overview.data?.data;
  const usage = data?.usage;

  return (
    <AppShell>
      <PageFrame
        title={t('pages.usage.heading')}
        description={t('pages.usage.subtitle')}
      >
        {overview.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t('loadError.title')}</AlertTitle>
            <AlertDescription>{t('loadError.body')}</AlertDescription>
          </Alert>
        )}

        {overview.isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : data && !data.configured ? (
          <Alert>
            <AlertTitle>{t('notConfigured.title')}</AlertTitle>
            <AlertDescription>{t('notConfigured.body')}</AlertDescription>
          </Alert>
        ) : data ? (
          <>
            {usage ? (
              <section className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatTile
                    label={t('usage.available')}
                    value={usage.availableCredits}
                    hint={t('usage.availableHelp')}
                    className="border-border/80 bg-muted/40"
                  />
                  <StatTile
                    label={t('usage.period')}
                    value={
                      <span className="text-sky-700 dark:text-sky-300">
                        {usage.periodCredits}
                      </span>
                    }
                    hint={
                      usage.periodEnd
                        ? t('usage.periodHelpDated', {
                            date: formatLocaleDate(
                              usage.periodEnd,
                              t('notAvailable'),
                            ),
                          })
                        : t('usage.periodHelp')
                    }
                    className="border-sky-500/25 bg-sky-500/8"
                  />
                  <StatTile
                    label={t('usage.bonus')}
                    value={
                      <span className="text-yellow-700 dark:text-yellow-300">
                        {usage.bonusCredits}
                      </span>
                    }
                    hint={t('usage.bonusHelp')}
                    className="border-yellow-500/30 bg-yellow-500/8"
                  />
                  <StatTile
                    label={t('usage.consumed')}
                    value={usage.spentCredits}
                    hint={t('usage.consumedHelp')}
                    className="border-rose-500/20 bg-rose-500/8"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('usage.splitBody')}
                </p>
              </section>
            ) : (
              <Alert>
                <AlertTitle>{t('usage.emptyTitle')}</AlertTitle>
                <AlertDescription>{t('usage.emptyBody')}</AlertDescription>
              </Alert>
            )}

            {usage ? (
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">
                    {usage.periodStart
                      ? t('ledger.cycleTitle')
                      : t('ledger.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {usage.periodStart
                      ? t('ledger.cycleDescription', {
                          start: formatLocaleDate(
                            usage.periodStart,
                            t('notAvailable'),
                          ),
                          end: formatLocaleDate(
                            usage.periodEnd,
                            t('notAvailable'),
                          ),
                        })
                      : t('ledger.description')}
                  </p>
                </div>
                {usage.ledger.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('ledger.date')}</TableHead>
                        <TableHead>{t('ledger.report')}</TableHead>
                        <TableHead>{t('ledger.type')}</TableHead>
                        <TableHead className="w-[7.5rem] text-right">
                          {t('ledger.change')}
                        </TableHead>
                        <TableHead>{t('ledger.account')}</TableHead>
                        <TableHead className="pl-6">
                          {t('ledger.activity')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.ledger.map((entry) => {
                        const pools = resolveLedgerPoolDeltas(entry);
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                              {formatLocaleDateTimeValue(entry.createdAt)}
                            </TableCell>
                            <TableCell>
                              <LedgerReportCell entry={entry} />
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={entryTypeBadgeVariant(entry.entryType)}
                              >
                                {localizeEntryType(entry.entryType, t)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <LedgerChangeCell pools={pools} entry={entry} />
                            </TableCell>
                            <TableCell>
                              <LedgerAccountCell pools={pools} />
                            </TableCell>
                            <TableCell className="pl-6">
                              {localizeLedgerActivity(entry, t)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Coins />
                      </EmptyMedia>
                      <EmptyTitle>{t('ledger.emptyTitle')}</EmptyTitle>
                      <EmptyDescription>
                        {t('ledger.emptyBody')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </PageFrame>
    </AppShell>
  );
}
