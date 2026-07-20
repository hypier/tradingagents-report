import { useQuery } from '@tanstack/react-query';
import { Database, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/frontend/components/app-shell';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Skeleton } from '@/frontend/components/ui/skeleton';
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

  if (session.isLoading || (isAdmin && (models.isLoading || datasources.isLoading))) {
    return (
      <AppShell title={t('models.title')}>
        <div className="px-4 py-6 lg:px-6">
          <Skeleton className="h-72 w-full" />
        </div>
      </AppShell>
    );
  }

  if (session.isError || !isAdmin) {
    return (
      <AppShell title={t('models.title')}>
        <div className="px-4 py-6 lg:px-6">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>{t('models.accessRequired.title')}</AlertTitle>
            <AlertDescription>
              {t('models.accessRequired.body')}
            </AlertDescription>
          </Alert>
        </div>
      </AppShell>
    );
  }

  const prices = models.data?.data.prices ?? [];
  const sources = models.data?.data.sources ?? [];
  const health = datasources.data?.data;

  return (
    <AppShell title={t('models.title')}>
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('models.heading')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('models.subtitle')}
          </p>
        </header>

        {models.isError || datasources.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('models.loadError.title')}</AlertTitle>
            <AlertDescription>{t('models.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('models.pricesTitle')}</CardTitle>
                <CardDescription>{t('models.pricesDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
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
                        <TableRow key={`${row.provider}-${row.model}-${row.billingMode}`}>
                          <TableCell>{row.provider}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.model}
                          </TableCell>
                          <TableCell>
                            {String(row.inputPrice)} {row.currency}
                          </TableCell>
                          <TableCell>
                            {String(row.outputPrice)} {row.currency}
                          </TableCell>
                          <TableCell>
                            {formatLocaleDateTimeValue(row.updatedAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('models.sourcesTitle')}</CardTitle>
                <CardDescription>
                  {t('models.sourcesDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                        <TableRow key={row.sourceUrl}>
                          <TableCell className="max-w-xs truncate font-mono text-xs">
                            {row.sourceUrl}
                          </TableCell>
                          <TableCell>{row.modelCount}</TableCell>
                          <TableCell>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="size-4" />
                  {t('models.healthTitle')}
                </CardTitle>
                <CardDescription>
                  {t('models.healthDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
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
                      <TableRow key={vendor.id}>
                        <TableCell>{vendor.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{vendor.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
