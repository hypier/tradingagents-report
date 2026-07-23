import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ReceiptText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/frontend/components/app-shell';
import { PageFrame } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
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
  invoiceStatusBadgeVariant,
  localizeInvoiceStatus,
} from '@/frontend/lib/billing-ui';
import {
  formatLocaleCurrency,
  formatLocaleDate,
} from '@/frontend/lib/format-locale';

/** 账单：Stripe 发票列表。 */
export function InvoicesPage() {
  const { t } = useTranslation('billing');
  const overview = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
  });
  const data = overview.data?.data;

  return (
    <AppShell>
      <PageFrame
        title={t('pages.invoices.heading')}
        description={t('pages.invoices.subtitle')}
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
          <section className="flex flex-col gap-3">
            {data.invoices.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('invoices.invoice')}</TableHead>
                    <TableHead>{t('invoices.date')}</TableHead>
                    <TableHead className="text-right">
                      {t('invoices.paid')}
                    </TableHead>
                    <TableHead>{t('invoices.status')}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.map((invoice) => (
                    <TableRow key={invoice.id} className="h-11">
                      <TableCell className="font-mono text-xs">
                        {invoice.number ?? invoice.id}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatLocaleDate(
                          invoice.createdAt,
                          t('notAvailable'),
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatLocaleCurrency(
                          invoice.amountPaid,
                          invoice.currency,
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={invoiceStatusBadgeVariant(invoice.status)}
                        >
                          {localizeInvoiceStatus(invoice.status, t)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {invoice.hostedInvoiceUrl && (
                          <Button asChild size="sm" variant="ghost">
                            <a
                              href={invoice.hostedInvoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink data-icon="inline-start" />
                              {t('invoices.open')}
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ReceiptText />
                  </EmptyMedia>
                  <EmptyTitle>{t('invoices.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>
                    {t('invoices.emptyBody')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>
        ) : null}
      </PageFrame>
    </AppShell>
  );
}
