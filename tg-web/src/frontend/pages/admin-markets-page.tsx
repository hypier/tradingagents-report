import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save } from 'lucide-react';
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
  listAdminMarkets,
  upsertAdminMarket,
  type AdminMarket,
} from '@/frontend/lib/admin-ops';

type MarketForm = {
  code: string;
  enabled: boolean;
  displayName: string;
  timezone: string;
};

const emptyForm = (): MarketForm => ({
  code: '',
  enabled: true,
  displayName: '',
  timezone: 'UTC',
});

function toForm(market: AdminMarket): MarketForm {
  return {
    code: market.code,
    enabled: Boolean(market.enabled),
    displayName: market.displayName,
    timezone: market.timezone,
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<MarketForm>(emptyForm);

  const items = markets.data?.data ?? [];
  const canSave = Boolean(form.code.trim() && form.displayName.trim());

  const openCreate = () => {
    setEditing(false);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (market: AdminMarket) => {
    setEditing(true);
    setForm(toForm(market));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(false);
    setForm(emptyForm());
  };

  const save = useMutation({
    mutationFn: () =>
      upsertAdminMarket(form.code.trim().toUpperCase(), {
        enabled: form.enabled,
        displayName: form.displayName.trim(),
        timezone: form.timezone.trim(),
      }),
    onSuccess: async () => {
      toast.success(t('markets.toast.saved'));
      closeDialog();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-markets'] }),
        queryClient.invalidateQueries({ queryKey: ['public-config'] }),
      ]);
    },
    onError: () => toast.error(t('markets.toast.saveError')),
  });

  return (
    <AdminGate
      accessTitle={t('markets.accessRequired.title')}
      accessBody={t('markets.accessRequired.body')}
      loading={markets.isLoading}
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
        {markets.isError ? (
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
                    {t('markets.columns.market')}
                  </TableHead>
                  <TableHead>{t('markets.columns.timezone')}</TableHead>
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
                  items.map((market) => (
                    <TableRow key={market.code}>
                      <TableCell className="pl-5 lg:pl-6">
                        <div className="min-w-0">
                          <div className="font-medium">{market.displayName}</div>
                          <div className="font-mono text-xs tracking-wide text-muted-foreground">
                            {market.code}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {market.timezone}
                      </TableCell>
                      <TableCell>
                        <Badge variant={market.enabled ? 'up' : 'outline'}>
                          {market.enabled
                            ? t('markets.enabled')
                            : t('markets.disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5 text-right lg:pr-6">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              aria-label={t('markets.actions.edit')}
                              onClick={() => openEdit(market)}
                            >
                              <Pencil />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" sideOffset={6}>
                            {t('markets.actions.edit')}
                          </TooltipContent>
                        </Tooltip>
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
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t('markets.fields.code')}</FieldLabel>
                <Input
                  value={form.code}
                  disabled={editing}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase(),
                    }))
                  }
                  className="font-mono"
                  required
                />
              </Field>
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
              <Field className="sm:col-span-2">
                <FieldLabel>{t('markets.fields.timezone')}</FieldLabel>
                <Input
                  value={form.timezone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      timezone: event.target.value,
                    }))
                  }
                  className="font-mono"
                  required
                />
              </Field>
              <Field
                orientation="horizontal"
                className="items-center gap-3 border border-border bg-muted/20 px-3 py-2.5 sm:col-span-2"
              >
                <Checkbox
                  checked={form.enabled}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      enabled: checked === true,
                    }))
                  }
                  id="market-enabled"
                  className="size-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <FieldLabel
                    htmlFor="market-enabled"
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
      </PageFrame>
    </AdminGate>
  );
}
