import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/frontend/components/app-shell';
import { PageFrame, StatTile } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
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
  localizeLedgerPool,
} from '@/frontend/lib/billing-ui';
import {
  formatLocaleDate,
  formatLocaleDateTimeValue,
} from '@/frontend/lib/format-locale';

/** 计费用量：余额与额度流水。 */
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
                    hint={
                      usage.periodEnd
                        ? `${t('usage.cycleEnds')} ${formatLocaleDate(usage.periodEnd, t('notAvailable'))}`
                        : undefined
                    }
                  />
                  <StatTile
                    label={t('usage.period')}
                    value={usage.periodCredits}
                  />
                  <StatTile
                    label={t('usage.bonus')}
                    value={usage.bonusCredits}
                  />
                  <StatTile
                    label={t('usage.consumed')}
                    value={usage.spentCredits}
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
                <h3 className="text-base font-semibold">{t('ledger.title')}</h3>
                {usage.ledger.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('ledger.date')}</TableHead>
                        <TableHead>{t('ledger.activity')}</TableHead>
                        <TableHead>{t('ledger.pool')}</TableHead>
                        <TableHead className="text-right">
                          {t('ledger.available')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('ledger.spent')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.ledger.map((entry) => {
                        const pool = localizeLedgerPool(entry, t);
                        return (
                          <TableRow key={entry.id} className="h-11">
                            <TableCell className="font-mono text-xs tabular-nums">
                              {formatLocaleDateTimeValue(entry.createdAt)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span>{localizeLedgerActivity(entry, t)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {localizeEntryType(entry.entryType, t)}
                                </span>
                              </div>
                              {entry.metadata?.actualCostUsd !== undefined && (
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span className="inline-flex gap-1">
                                    <span>{t('ledger.actualCost')}:</span>
                                    <span>
                                      ${String(entry.metadata.actualCostUsd)}
                                    </span>
                                  </span>
                                  {entry.metadata.finalPoints !== undefined && (
                                    <span>
                                      {t('ledger.finalPoints', {
                                        count: Number(
                                          entry.metadata.finalPoints,
                                        ),
                                      })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {pool ?? '-'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCreditDelta(entry.availableDelta)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCreditDelta(entry.spentDelta)}
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
