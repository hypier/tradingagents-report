import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AdminGate } from '@/frontend/components/admin-gate';
import { LlmProviderMark } from '@/frontend/components/llm-provider-mark';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import {
  deleteAdminLlmProvider,
  listAdminLlmModels,
  listAdminLlmProviders,
  testAdminLlmProvider,
  upsertAdminLlmProvider,
  type AdminLlmProvider,
} from '@/frontend/lib/admin-llm';
import { providerRequiresBaseUrl } from '@/shared/llm-providers';

type ProviderDraft = {
  id: string;
  driver: string;
  displayName: string;
  backendUrl: string;
  apiKey: string;
  enabled: boolean;
};

const emptyDraft = (): ProviderDraft => ({
  id: '',
  driver: '',
  displayName: '',
  backendUrl: '',
  apiKey: '',
  enabled: true,
});

function toDraft(provider: AdminLlmProvider): ProviderDraft {
  return {
    id: provider.id,
    driver: provider.driver,
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
  const [deleteTarget, setDeleteTarget] = useState<AdminLlmProvider | null>(
    null,
  );
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['admin-llm-providers'],
    queryFn: () => listAdminLlmProviders(),
    enabled: isAdmin,
  });
  const modelsQuery = useQuery({
    queryKey: ['admin-llm-models'],
    queryFn: () => listAdminLlmModels(),
    enabled: isAdmin,
  });

  const providers = providersQuery.data?.data.providers ?? [];
  const models = modelsQuery.data?.data.models ?? [];
  const availableDrivers = providersQuery.data?.data.availableDrivers ?? [];
  const modelCountByProvider = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) {
      counts.set(model.providerId, (counts.get(model.providerId) ?? 0) + 1);
    }
    return counts;
  }, [models]);
  const deleteModelCount = deleteTarget
    ? (modelCountByProvider.get(deleteTarget.id) ?? 0)
    : 0;
  const baseUrlRequired = providerRequiresBaseUrl(draft.driver);
  const canSave =
    Boolean(draft.id.trim() && draft.driver) &&
    (!baseUrlRequired || Boolean(draft.backendUrl.trim()));
  const canTest =
    Boolean(draft.driver) &&
    (!baseUrlRequired || Boolean(draft.backendUrl.trim()));

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-llm-providers'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-llm-models'] }),
    ]);
  };

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setTestMessage(null);
    setDialogOpen(true);
  };

  const openEdit = (provider: AdminLlmProvider) => {
    setEditingId(provider.id);
    setDraft(toDraft(provider));
    setTestMessage(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setTestMessage(null);
  };

  const save = useMutation({
    mutationFn: () =>
      upsertAdminLlmProvider(draft.id.trim(), {
        driver: draft.driver,
        displayName: draft.displayName.trim() || draft.id.trim(),
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

  const testConnection = useMutation({
    mutationFn: () =>
      testAdminLlmProvider({
        driver: draft.driver,
        ...(editingId ? { providerId: editingId } : {}),
        backendUrl: draft.backendUrl.trim() || null,
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      }),
    onSuccess: (result) => {
      const count = result.data.modelCount;
      const detail =
        typeof count === 'number'
          ? t('llmProviders.toast.testOkWithCount', { count })
          : t('llmProviders.toast.testOk');
      setTestMessage(detail);
      toast.success(detail);
    },
    onError: (error: Error) => {
      setTestMessage(error.message);
      toast.error(error.message);
    },
  });

  const remove = useMutation({
    mutationFn: (input: { id: string; force: boolean }) =>
      deleteAdminLlmProvider(input.id, { force: input.force }),
    onSuccess: async () => {
      toast.success(t('llmProviders.toast.deleted'));
      setDeleteTarget(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminGate
      accessTitle={t('llmProviders.accessRequired.title')}
      accessBody={t('llmProviders.accessRequired.body')}
      loading={providersQuery.isLoading || modelsQuery.isLoading}
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
                  <TableHead>{t('llmProviders.columns.apiKey')}</TableHead>
                  <TableHead>{t('llmProviders.columns.backendUrl')}</TableHead>
                  <TableHead>{t('llmProviders.columns.status')}</TableHead>
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
                  providers.map((provider) => {
                    const modelCount =
                      modelCountByProvider.get(provider.id) ?? 0;
                    return (
                      <TableRow key={provider.id}>
                        <TableCell className="pl-5 lg:pl-6">
                          <div className="flex items-center gap-3">
                            <LlmProviderMark providerId={provider.driver} />
                            <div className="min-w-0">
                              <div className="font-medium">
                                {provider.displayName}
                              </div>
                              <div className="font-mono text-xs tracking-wide text-muted-foreground">
                                {provider.id}
                                {provider.driver !== provider.id
                                  ? ` · ${provider.driver}`
                                  : ''}
                                {modelCount > 0
                                  ? ` · ${t('llmProviders.modelCount', {
                                      count: modelCount,
                                    })}`
                                  : ''}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {provider.apiKeyHint ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate font-mono text-xs">
                          {provider.backendUrl ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={provider.enabled ? 'up' : 'outline'}
                          >
                            {provider.enabled
                              ? t('llmProviders.enabled')
                              : t('llmProviders.disabled')}
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
                                  aria-label={t('llmProviders.actions.edit')}
                                  onClick={() => openEdit(provider)}
                                >
                                  <Pencil />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={6}>
                                {t('llmProviders.actions.edit')}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="destructive"
                                  aria-label={t('llmProviders.actions.delete')}
                                  onClick={() => setDeleteTarget(provider)}
                                >
                                  <Trash2 />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={6}>
                                {t('llmProviders.actions.delete')}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
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
                <FieldLabel>{t('llmProviders.fields.driver')}</FieldLabel>
                <Select
                  value={draft.driver || undefined}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      driver: value,
                      id:
                        !editingId &&
                        (!current.id || current.id === current.driver)
                          ? value
                          : current.id,
                      displayName:
                        current.displayName ||
                        (!editingId &&
                        (!current.id || current.id === current.driver)
                          ? value
                          : current.displayName),
                    }))
                  }
                  disabled={Boolean(editingId)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('llmProviders.fields.driver')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDrivers.map((driver) => (
                      <SelectItem key={driver} value={driver}>
                        <span className="flex items-center gap-2">
                          <LlmProviderMark
                            providerId={driver}
                            className="size-5 border-0 bg-transparent"
                          />
                          {driver}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('llmProviders.fields.instanceId')}</FieldLabel>
                <Input
                  value={draft.id}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      id: event.target.value
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]/g, ''),
                    }))
                  }
                  disabled={Boolean(editingId)}
                  placeholder="nbapi"
                  className="font-mono"
                />
              </Field>
              <Field className="sm:col-span-2">
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
                <FieldLabel>
                  {t('llmProviders.fields.backendUrl')}
                  {baseUrlRequired ? ' *' : ''}
                </FieldLabel>
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
              {testMessage ? (
                <p className="sm:col-span-2 text-sm text-muted-foreground">
                  {testMessage}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={!canTest || testConnection.isPending}
                onClick={() => testConnection.mutate()}
              >
                {testConnection.isPending ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : null}
                {t('llmProviders.actions.test')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t('llmProviders.actions.cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={!canSave || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {t('llmProviders.actions.save')}
                </Button>
              </div>
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
              <DialogTitle>{t('llmProviders.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {deleteModelCount > 0
                  ? t('llmProviders.deleteBodyWithModels', {
                      name: deleteTarget?.displayName ?? '',
                      count: deleteModelCount,
                    })
                  : t('llmProviders.deleteBody', {
                      name: deleteTarget?.displayName ?? '',
                    })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
              >
                {t('llmProviders.actions.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!deleteTarget || remove.isPending}
                onClick={() => {
                  if (!deleteTarget) return;
                  remove.mutate({
                    id: deleteTarget.id,
                    force: deleteModelCount > 0,
                  });
                }}
              >
                {t('llmProviders.actions.confirmDelete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
    </AdminGate>
  );
}
