import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import { Spinner } from '@/frontend/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import {
  listAdminMarkets,
  upsertAdminMarket,
  type AdminMarket,
} from '@/frontend/lib/admin-ops';

type MarketForm = {
  code: string;
  enabled: boolean;
  displayName: string;
  timezone: string;
  currency: string;
  sessionNotes: string;
  disclaimer: string;
  sortOrder: number;
};

const emptyForm: MarketForm = {
  code: '',
  enabled: true,
  displayName: '',
  timezone: 'UTC',
  currency: 'USD',
  sessionNotes: '',
  disclaimer: '',
  sortOrder: 0,
};

function toForm(market: AdminMarket): MarketForm {
  return {
    code: market.code,
    enabled: Boolean(market.enabled),
    displayName: market.displayName,
    timezone: market.timezone,
    currency: market.currency,
    sessionNotes: market.sessionNotes ?? '',
    disclaimer: market.disclaimer ?? '',
    sortOrder: market.sortOrder,
  };
}

export function AdminMarketsPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const isAdmin = session.data?.data.user.role === 'admin';
  const markets = useQuery({
    queryKey: ['admin-markets'],
    queryFn: () => listAdminMarkets(),
    enabled: isAdmin,
  });
  const [form, setForm] = useState<MarketForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      upsertAdminMarket(form.code.trim().toUpperCase(), {
        enabled: form.enabled,
        displayName: form.displayName.trim(),
        timezone: form.timezone.trim(),
        currency: form.currency.trim(),
        sessionNotes: form.sessionNotes.trim() || null,
        disclaimer: form.disclaimer.trim() || null,
        sortOrder: form.sortOrder,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      void queryClient.invalidateQueries({ queryKey: ['public-config'] });
      toast.success(t('markets.saved'));
      setEditing(form.code.trim().toUpperCase());
    },
    onError: () => toast.error(t('markets.saveError')),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.code.trim() || !form.displayName.trim()) return;
    save.mutate();
  }

  return (
    <AdminGate
      accessTitle={t('markets.accessRequired.title')}
      accessBody={t('markets.accessRequired.body')}
      loading={markets.isLoading}
    >
      <PageFrame
        title={t('markets.heading')}
        description={t('markets.subtitle')}
      >
        {markets.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('markets.loadError.title')}</AlertTitle>
            <AlertDescription>{t('markets.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('markets.listTitle')}</CardTitle>
                <CardDescription>{t('markets.listDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('markets.columns.code')}</TableHead>
                      <TableHead>{t('markets.columns.name')}</TableHead>
                      <TableHead>{t('markets.columns.timezone')}</TableHead>
                      <TableHead>{t('markets.columns.currency')}</TableHead>
                      <TableHead>{t('markets.columns.enabled')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(markets.data?.data ?? []).map((market) => (
                      <TableRow key={market.code}>
                        <TableCell className="font-mono text-xs">
                          {market.code}
                        </TableCell>
                        <TableCell>{market.displayName}</TableCell>
                        <TableCell>{market.timezone}</TableCell>
                        <TableCell>{market.currency}</TableCell>
                        <TableCell>
                          <Badge
                            variant={market.enabled ? 'secondary' : 'outline'}
                          >
                            {market.enabled
                              ? t('markets.enabled')
                              : t('markets.disabled')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(market.code);
                              setForm(toForm(market));
                            }}
                          >
                            {t('markets.edit')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {editing
                    ? t('markets.editTitle', { code: editing })
                    : t('markets.createTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit}>
                  <FieldGroup>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field>
                        <FieldLabel>{t('markets.columns.code')}</FieldLabel>
                        <Input
                          value={form.code}
                          disabled={Boolean(editing)}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              code: event.target.value.toUpperCase(),
                            }))
                          }
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{t('markets.columns.name')}</FieldLabel>
                        <Input
                          value={form.displayName}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              displayName: event.target.value,
                            }))
                          }
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{t('markets.columns.timezone')}</FieldLabel>
                        <Input
                          value={form.timezone}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              timezone: event.target.value,
                            }))
                          }
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{t('markets.columns.currency')}</FieldLabel>
                        <Input
                          value={form.currency}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              currency: event.target.value.toUpperCase(),
                            }))
                          }
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{t('markets.sortOrder')}</FieldLabel>
                        <Input
                          type="number"
                          min={0}
                          value={form.sortOrder}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              sortOrder: Number(event.target.value) || 0,
                            }))
                          }
                        />
                      </Field>
                      <label className="flex items-end gap-2 pb-2 text-sm">
                        <Checkbox
                          checked={form.enabled}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              enabled: checked === true,
                            }))
                          }
                        />
                        {t('markets.enabled')}
                      </label>
                    </div>
                    <Field>
                      <FieldLabel>{t('markets.sessionNotes')}</FieldLabel>
                      <Input
                        value={form.sessionNotes}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            sessionNotes: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel>{t('markets.disclaimer')}</FieldLabel>
                      <textarea
                        className="min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={form.disclaimer}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            disclaimer: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={save.isPending}>
                        {save.isPending ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Save data-icon="inline-start" />
                        )}
                        {t('markets.save')}
                      </Button>
                      {editing ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditing(null);
                            setForm(emptyForm);
                          }}
                        >
                          {t('markets.new')}
                        </Button>
                      ) : null}
                    </div>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </PageFrame>
    </AdminGate>
  );
}
