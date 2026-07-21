import { useQuery } from '@tanstack/react-query';
import { Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import {
  getAdminDatasources,
  getAdminModels,
} from '@/frontend/lib/admin-ops';

export function AdminModelsPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const models = useQuery({
    queryKey: ['admin-models'],
    queryFn: () => getAdminModels(),
    enabled: isAdmin,
  });
  const datasources = useQuery({
    queryKey: ['admin-datasources'],
    queryFn: () => getAdminDatasources(),
    enabled: isAdmin,
  });

  const prices = models.data?.data.prices ?? [];
  const sources = models.data?.data.sources ?? [];
  const health = datasources.data?.data;

  return (
    <AdminGate
      accessTitle={t('models.accessRequired.title')}
      accessBody={t('models.accessRequired.body')}
      loading={models.isLoading || datasources.isLoading}
    >
      <PageFrame
        title={t('models.heading')}
        description={t('models.subtitle')}
      >
        {models.isError || datasources.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('models.loadError.title')}</AlertTitle>
            <AlertDescription>{t('models.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <>
            <SectionPanel
              title={t('models.pricesTitle')}
              description={t('models.pricesDescription')}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('models.columns.provider')}</TableHead>
                    <TableHead>{t('models.columns.model')}</TableHead>
                    <TableHead>{t('models.columns.input')}</TableHead>
                    <TableHead>{t('models.columns.output')}</TableHead>
                    <TableHead>{t('models.columns.updated')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        {t('models.emptyPrices')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    prices.map((row) => (
                      <TableRow
                        key={`${row.provider}-${row.model}-${row.billingMode}`}
                        className="h-11"
                      >
                        <TableCell>{row.provider}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.model}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {String(row.inputPrice)} {row.currency}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {String(row.outputPrice)} {row.currency}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {formatLocaleDateTimeValue(row.updatedAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </SectionPanel>

            <SectionPanel
              title={t('models.sourcesTitle')}
              description={t('models.sourcesDescription')}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('models.columns.source')}</TableHead>
                    <TableHead>{t('models.columns.models')}</TableHead>
                    <TableHead>{t('models.columns.lastSuccess')}</TableHead>
                    <TableHead>{t('models.columns.error')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t('models.emptySources')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sources.map((row) => (
                      <TableRow key={row.sourceUrl} className="h-11">
                        <TableCell className="max-w-xs truncate font-mono text-xs">
                          {row.sourceUrl}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {row.modelCount}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {row.lastSuccessAt
                            ? formatLocaleDateTimeValue(row.lastSuccessAt)
                            : '—'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-destructive">
                          {row.lastError ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </SectionPanel>

            <SectionPanel
              title={
                <span className="inline-flex items-center gap-2">
                  <Database className="size-4" aria-hidden />
                  {t('models.healthTitle')}
                </span>
              }
              description={t('models.healthDescription')}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {(health?.dependencies ?? []).map((item) => (
                    <Badge
                      key={item.id}
                      variant={item.ok ? 'secondary' : 'destructive'}
                    >
                      {item.id}: {item.ok ? t('models.ok') : t('models.fail')}
                    </Badge>
                  ))}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('models.columns.vendor')}</TableHead>
                      <TableHead>{t('models.columns.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(health?.vendors ?? []).map((vendor) => (
                      <TableRow key={vendor.id} className="h-11">
                        <TableCell>{vendor.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{vendor.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionPanel>
          </>
        )}
      </PageFrame>
    </AdminGate>
  );
}
