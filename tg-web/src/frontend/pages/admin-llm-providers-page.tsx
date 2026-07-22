import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  clearAdminLlmProviderApiKey,
  deleteAdminLlmProvider,
  listAdminLlmProviders,
  upsertAdminLlmProvider,
  type AdminLlmProvider,
} from '@/frontend/lib/admin-llm';

type ProviderDraft = {
  id: string;
  displayName: string;
  backendUrl: string;
  apiKey: string;
  enabled: boolean;
};

const emptyDraft = (): ProviderDraft => ({
  id: '',
  displayName: '',
  backendUrl: '',
  apiKey: '',
  enabled: true,
});

function toDraft(provider: AdminLlmProvider): ProviderDraft {
  return {
    id: provider.id,
    displayName: provider.displayName,
    backendUrl: provider.backendUrl ?? '',
    apiKey: '',
    enabled: provider.enabled,
  };
}

export function AdminLlmProvidersPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);

  const providersQuery = useQuery({
    queryKey: ['admin-llm-providers'],
    queryFn: () => listAdminLlmProviders(),
    enabled: isAdmin,
  });

  const providers = providersQuery.data?.data.providers ?? [];
  const availableIds = providersQuery.data?.data.availableIds ?? [];
  const unusedIds = useMemo(
    () =>
      availableIds.filter(
        (id) => !providers.some((provider) => provider.id === id),
      ),
    [availableIds, providers],
  );
  const selectableIds = editingId
    ? [editingId]
    : unusedIds.length
      ? unusedIds
      : availableIds;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] });

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (provider: AdminLlmProvider) => {
    setEditingId(provider.id);
    setDraft(toDraft(provider));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const save = useMutation({
    mutationFn: () =>
      upsertAdminLlmProvider(draft.id, {
        displayName: draft.displayName.trim() || draft.id,
        enabled: draft.enabled,
        backendUrl: draft.backendUrl.trim() || null,
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      }),
    onSuccess: async () => {
      toast.success(t('llmProviders.toast.saved'));
      closeDialog();
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminGate
      accessTitle={t('llmProviders.accessRequired.title')}
      accessBody={t('llmProviders.accessRequired.body')}
      loading={providersQuery.isLoading}
    >
      <PageFrame
        title={t('llmProviders.heading')}
        description={t('llmProviders.subtitle')}
        bodyClassName="gap-0 p-0"
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t('llmProviders.actions.add')}
          </Button>
        }
      >
        {providersQuery.isError ? (
          <div className="px-5 py-4 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>{t('llmProviders.loadError.title')}</AlertTitle>
              <AlertDescription>
                {t('llmProviders.loadError.body')}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 lg:pl-6">
                    {t('llmProviders.columns.provider')}
                  </TableHead>
                  <TableHead>{t('llmProviders.columns.status')}</TableHead>
                  <TableHead>{t('llmProviders.columns.apiKey')}</TableHead>
                  <TableHead>{t('llmProviders.columns.backendUrl')}</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap pr-5 lg:pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="pl-5 text-muted-foreground lg:pl-6"
                    >
                      {t('llmProviders.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  providers.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell className="pl-5 lg:pl-6">
                        <div className="font-medium">{provider.displayName}</div>
                        <div className="font-mono text-xs tracking-wide text-muted-foreground">
                          {provider.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={provider.enabled ? 'secondary' : 'outline'}
                        >
                          {provider.enabled
                            ? t('llmProviders.enabled')
                            : t('llmProviders.disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {provider.apiKeyHint ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate font-mono text-xs">
                        {provider.backendUrl ?? '—'}
                      </TableCell>
                      <TableCell className="space-x-2 pr-5 text-right lg:pr-6">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(provider)}
                        >
                          {t('llmProviders.actions.edit')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await clearAdminLlmProviderApiKey(provider.id);
                              toast.success(t('llmProviders.toast.keyCleared'));
                              await invalidate();
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : String(error),
                              );
                            }
                          }}
                        >
                          {t('llmProviders.actions.clearKey')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            try {
                              await deleteAdminLlmProvider(provider.id);
                              toast.success(t('llmProviders.toast.deleted'));
                              await invalidate();
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : String(error),
                              );
                            }
                          }}
                        >
                          {t('llmProviders.actions.delete')}
                        </Button>
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
                {editingId
                  ? t('llmProviders.editTitle')
                  : t('llmProviders.addTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('llmProviders.formDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t('llmProviders.fields.providerId')}</FieldLabel>
                <Select
                  value={draft.id || undefined}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      id: value,
                      displayName: current.displayName || value,
                    }))
                  }
                  disabled={Boolean(editingId)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('llmProviders.fields.providerId')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('llmProviders.fields.displayName')}</FieldLabel>
                <Input
                  value={draft.displayName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>{t('llmProviders.fields.backendUrl')}</FieldLabel>
                <Input
                  value={draft.backendUrl}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      backendUrl: event.target.value,
                    }))
                  }
                  placeholder="https://api.example.com/v1"
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>{t('llmProviders.fields.apiKey')}</FieldLabel>
                <Input
                  type="password"
                  autoComplete="off"
                  value={draft.apiKey}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      apiKey: event.target.value,
                    }))
                  }
                  placeholder={
                    editingId
                      ? t('llmProviders.fields.apiKeyPlaceholder')
                      : undefined
                  }
                />
              </Field>
              <Field
                orientation="horizontal"
                className="sm:col-span-2 items-center gap-3 border border-border bg-muted/20 px-3 py-2.5"
              >
                <Checkbox
                  checked={draft.enabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      enabled: checked === true,
                    }))
                  }
                  id="provider-enabled"
                  className="size-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <FieldLabel
                    htmlFor="provider-enabled"
                    className="cursor-pointer font-medium"
                  >
                    {t('llmProviders.fields.enabled')}
                  </FieldLabel>
                  <p className="text-xs text-muted-foreground">
                    {t('llmProviders.fields.enabledHint')}
                  </p>
                </div>
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                {t('llmProviders.actions.cancel')}
              </Button>
              <Button
                type="button"
                disabled={!draft.id || save.isPending}
                onClick={() => save.mutate()}
              >
                {t('llmProviders.actions.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
    </AdminGate>
  );
}
