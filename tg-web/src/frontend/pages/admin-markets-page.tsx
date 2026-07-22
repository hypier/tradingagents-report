import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
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
import { Checkbox } from '@/frontend/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Field, FieldLabel } from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Spinner } from '@/frontend/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import {
  deleteAdminMarket,
  listAdminMarkets,
  upsertAdminMarket,
  type AdminAnalysisExchange,
} from '@/frontend/lib/admin-ops';
import {
  defaultDisplayNameForExchange,
  getExchangeCatalogEntry,
  listCatalogMarketCodes,
  listExchangeCatalog,
  suggestMarket,
} from '@/shared/exchange-catalog';

type ExchangeForm = {
  exchange: string;
  enabled: boolean;
  displayName: string;
  market: string;
};

const emptyForm = (): ExchangeForm => ({
  exchange: '',
  enabled: true,
  displayName: '',
  market: '',
});

function toForm(row: AdminAnalysisExchange): ExchangeForm {
  return {
    exchange: row.exchange,
    enabled: Boolean(row.enabled),
    displayName: row.displayName,
    market: row.market ?? '',
  };
}

export function AdminMarketsPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const isAdmin = session.data?.data.user.role === 'admin';
  const exchanges = useQuery({
    queryKey: ['admin-analysis-exchanges'],
    queryFn: () => listAdminMarkets(),
    enabled: isAdmin,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<AdminAnalysisExchange | null>(null);
  const [form, setForm] = useState<ExchangeForm>(emptyForm);
  const [catalogQuery, setCatalogQuery] = useState('');

  const items = exchanges.data?.data ?? [];
  const configured = useMemo(
    () => new Set(items.map((row) => row.exchange.toUpperCase())),
    [items],
  );
  const catalogOptions = useMemo(() => {
    const needle = catalogQuery.trim().toLowerCase();
    return listExchangeCatalog().filter((entry) => {
      if (configured.has(entry.value.toUpperCase()) && !editing) return false;
      if (!needle) return true;
      return (
        entry.value.toLowerCase().includes(needle) ||
        entry.name.toLowerCase().includes(needle) ||
        entry.desc.toLowerCase().includes(needle) ||
        entry.group.toLowerCase().includes(needle) ||
        entry.country.toLowerCase().includes(needle)
      );
    });
  }, [catalogQuery, configured, editing]);
  const catalogMarketCodes = useMemo(() => listCatalogMarketCodes(), []);

  const canSave = Boolean(form.exchange.trim() && form.displayName.trim());

  const openCreate = () => {
    setEditing(false);
    setForm(emptyForm());
    setCatalogQuery('');
    setDialogOpen(true);
  };

  const openEdit = (row: AdminAnalysisExchange) => {
    setEditing(true);
    setForm(toForm(row));
    setCatalogQuery('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(false);
    setForm(emptyForm());
    setCatalogQuery('');
  };

  const save = useMutation({
    mutationFn: () =>
      upsertAdminMarket(form.exchange.trim().toUpperCase(), {
        enabled: form.enabled,
        displayName: form.displayName.trim(),
        market: form.market.trim() || null,
      }),
    onSuccess: async () => {
      toast.success(t('markets.toast.saved'));
      closeDialog();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['admin-analysis-exchanges'],
        }),
        queryClient.invalidateQueries({ queryKey: ['public-config'] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(error.message || t('markets.toast.saveError')),
  });

  const remove = useMutation({
    mutationFn: (exchange: string) => deleteAdminMarket(exchange),
    onSuccess: async () => {
      toast.success(t('markets.toast.deleted'));
      setDeleteTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['admin-analysis-exchanges'],
        }),
        queryClient.invalidateQueries({ queryKey: ['public-config'] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(error.message || t('markets.toast.deleteError')),
  });

  return (
    <AdminGate
      accessTitle={t('markets.accessRequired.title')}
      accessBody={t('markets.accessRequired.body')}
      loading={exchanges.isLoading}
    >
      <PageFrame
        title={t('markets.heading')}
        description={t('markets.subtitle')}
        bodyClassName="gap-0 p-0"
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t('markets.actions.add')}
          </Button>
        }
      >
        {exchanges.isError ? (
          <div className="px-5 py-4 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>{t('markets.loadError.title')}</AlertTitle>
              <AlertDescription>{t('markets.loadError.body')}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 lg:pl-6">
                    {t('markets.columns.exchange')}
                  </TableHead>
                  <TableHead>{t('markets.columns.market')}</TableHead>
                  <TableHead>{t('markets.columns.status')}</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap pr-5 lg:pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="pl-5 text-muted-foreground lg:pl-6"
                    >
                      {t('markets.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.exchange}>
                      <TableCell className="pl-5 lg:pl-6">
                        <div className="min-w-0">
                          <div className="font-medium">{row.displayName}</div>
                          <div className="font-mono text-xs tracking-wide text-muted-foreground">
                            {row.exchange}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.market || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.enabled ? 'up' : 'outline'}>
                          {row.enabled
                            ? t('markets.enabled')
                            : t('markets.disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-right lg:pr-6">
                        <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="outline"
                                aria-label={t('markets.actions.edit')}
                                onClick={() => openEdit(row)}
                              >
                                <Pencil />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={6}>
                              {t('markets.actions.edit')}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="destructive"
                                aria-label={t('markets.actions.delete')}
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={6}>
                              {t('markets.actions.delete')}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) closeDialog();
            else setDialogOpen(true);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editing ? t('markets.editTitle') : t('markets.addTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('markets.formDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {!editing ? (
                <>
                  <Field>
                    <FieldLabel>{t('markets.fields.catalogSearch')}</FieldLabel>
                    <Input
                      value={catalogQuery}
                      onChange={(event) => setCatalogQuery(event.target.value)}
                      placeholder={t('markets.fields.catalogSearchPlaceholder')}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{t('markets.fields.exchange')}</FieldLabel>
                    <Select
                      value={form.exchange || undefined}
                      onValueChange={(value) => {
                        const catalog = getExchangeCatalogEntry(value);
                        setForm({
                          exchange: value,
                          enabled: true,
                          displayName: defaultDisplayNameForExchange(value),
                          market:
                            suggestMarket(catalog?.country, {
                              group: catalog?.group,
                            }) ?? '',
                        });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={t('markets.fields.exchangePlaceholder')}
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {catalogOptions.slice(0, 80).map((entry) => (
                          <SelectItem key={entry.value} value={entry.value}>
                            <span className="flex min-w-0 flex-col items-start">
                              <span className="font-medium">{entry.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {entry.value}
                                {entry.group ? ` · ${entry.group}` : ''}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel>{t('markets.fields.exchange')}</FieldLabel>
                  <Input value={form.exchange} disabled className="font-mono" />
                </Field>
              )}
              <Field>
                <FieldLabel>{t('markets.fields.displayName')}</FieldLabel>
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
                <FieldLabel>{t('markets.fields.market')}</FieldLabel>
                <Select
                  value={form.market || '__none__'}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      market: value === '__none__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">
                      {t('markets.fields.marketNone')}
                    </SelectItem>
                    {catalogMarketCodes.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                orientation="horizontal"
                className="items-center gap-3 border border-border bg-muted/20 px-3 py-2.5"
              >
                <Checkbox
                  checked={form.enabled}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      enabled: checked === true,
                    }))
                  }
                  id="exchange-enabled"
                  className="size-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <FieldLabel
                    htmlFor="exchange-enabled"
                    className="cursor-pointer font-medium"
                  >
                    {t('markets.fields.enabled')}
                  </FieldLabel>
                  <p className="text-xs text-muted-foreground">
                    {t('markets.fields.enabledHint')}
                  </p>
                </div>
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                {t('markets.actions.cancel')}
              </Button>
              <Button
                type="button"
                disabled={!canSave || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                {t('markets.actions.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('markets.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t('markets.deleteBody', {
                  name: deleteTarget?.displayName ?? deleteTarget?.exchange ?? '',
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
              >
                {t('markets.actions.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!deleteTarget || remove.isPending}
                onClick={() => {
                  if (!deleteTarget) return;
                  remove.mutate(deleteTarget.exchange);
                }}
              >
                {t('markets.actions.confirmDelete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
    </AdminGate>
  );
}
