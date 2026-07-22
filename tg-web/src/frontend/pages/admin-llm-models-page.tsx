import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
  createAdminLlmModel,
  deleteAdminLlmModel,
  listAdminLlmModels,
  listAdminLlmProviders,
  setAdminLlmDefaults,
  syncAdminLlmModel,
  syncPreviewAdminLlmModel,
  updateAdminLlmModel,
} from '@/frontend/lib/admin-llm';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';

const emptyModelForm = () => ({
  providerId: '',
  model: '',
  displayName: '',
  role: 'both',
  enabled: false,
  inputPrice: '',
  outputPrice: '',
});

export function AdminLlmModelsPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const queryClient = useQueryClient();

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
  const defaults = modelsQuery.data?.data.defaults;
  const enabledModels = models.filter((model) => model.enabled);

  const [addOpen, setAddOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [modelForm, setModelForm] = useState(emptyModelForm);
  const [defaultQuick, setDefaultQuick] = useState('');
  const [defaultDeep, setDefaultDeep] = useState('');

  useEffect(() => {
    if (!defaults) return;
    setDefaultQuick(defaults.defaultQuickModelId ?? '');
    setDefaultDeep(defaults.defaultDeepModelId ?? '');
  }, [defaults?.defaultQuickModelId, defaults?.defaultDeepModelId]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-llm-models'] });

  const closeAdd = () => {
    setAddOpen(false);
    setModelForm(emptyModelForm());
  };

  const saveModel = useMutation({
    mutationFn: () =>
      createAdminLlmModel({
        providerId: modelForm.providerId,
        model: modelForm.model.trim(),
        displayName: modelForm.displayName.trim() || modelForm.model.trim(),
        role: modelForm.role,
        enabled: modelForm.enabled,
        inputPrice: modelForm.inputPrice || null,
        outputPrice: modelForm.outputPrice || null,
      }),
    onSuccess: async () => {
      toast.success(t('llmModels.toast.modelSaved'));
      closeAdd();
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveDefaults = useMutation({
    mutationFn: () =>
      setAdminLlmDefaults({
        defaultQuickModelId: defaultQuick,
        defaultDeepModelId: defaultDeep,
      }),
    onSuccess: async () => {
      toast.success(t('llmModels.toast.defaultsSaved'));
      setDefaultsOpen(false);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const loading = providersQuery.isLoading || modelsQuery.isLoading;
  const errored = providersQuery.isError || modelsQuery.isError;

  return (
    <AdminGate
      accessTitle={t('llmModels.accessRequired.title')}
      accessBody={t('llmModels.accessRequired.body')}
      loading={loading}
    >
      <PageFrame
        title={t('llmModels.heading')}
        description={t('llmModels.subtitle')}
        bodyClassName="gap-0 p-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDefaultsOpen(true)}
            >
              <SlidersHorizontal data-icon="inline-start" />
              {t('llmModels.actions.setDefaults')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setAddOpen(true)}
              disabled={providers.length === 0}
            >
              <Plus data-icon="inline-start" />
              {t('llmModels.actions.add')}
            </Button>
          </div>
        }
      >
        {errored ? (
          <div className="px-5 py-4 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>{t('llmModels.loadError.title')}</AlertTitle>
              <AlertDescription>
                {t('llmModels.loadError.body')}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <>
            {providers.length === 0 ? (
              <div className="px-5 py-4 lg:px-6">
                <Alert>
                  <AlertTitle>{t('llmModels.noProviders.title')}</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center gap-2">
                    <span>{t('llmModels.noProviders.body')}</span>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/llm/providers">
                        {t('llmModels.noProviders.cta')}
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5 lg:pl-6">
                      {t('llmModels.columns.model')}
                    </TableHead>
                    <TableHead>{t('llmModels.columns.provider')}</TableHead>
                    <TableHead>{t('llmModels.columns.role')}</TableHead>
                    <TableHead>{t('llmModels.columns.input')}</TableHead>
                    <TableHead>{t('llmModels.columns.output')}</TableHead>
                    <TableHead>{t('llmModels.columns.status')}</TableHead>
                    <TableHead>{t('llmModels.columns.synced')}</TableHead>
                    <TableHead className="w-[1%] whitespace-nowrap pr-5 lg:pr-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="pl-5 text-muted-foreground lg:pl-6"
                      >
                        {t('llmModels.empty')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    models.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell className="pl-5 lg:pl-6">
                          <div className="font-medium">{model.displayName}</div>
                          <div className="font-mono text-xs tracking-wide text-muted-foreground">
                            {model.model}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs tracking-wide">
                          {model.providerId}
                        </TableCell>
                        <TableCell>{model.role}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {model.inputPrice ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {model.outputPrice ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={model.enabled ? 'secondary' : 'outline'}
                          >
                            {model.enabled
                              ? t('llmModels.open')
                              : t('llmModels.closed')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {model.syncedAt
                            ? formatLocaleDateTimeValue(model.syncedAt)
                            : '—'}
                          {model.syncError ? (
                            <div className="text-destructive">
                              {model.syncError}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="space-x-2 pr-5 text-right lg:pr-6">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await syncAdminLlmModel(model.id);
                                toast.success(t('llmModels.toast.synced'));
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
                            {t('llmModels.actions.sync')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                await updateAdminLlmModel(model.id, {
                                  enabled: !model.enabled,
                                });
                                toast.success(
                                  model.enabled
                                    ? t('llmModels.toast.closed')
                                    : t('llmModels.toast.opened'),
                                );
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
                            {model.enabled
                              ? t('llmModels.actions.close')
                              : t('llmModels.actions.open')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              try {
                                await deleteAdminLlmModel(model.id);
                                toast.success(t('llmModels.toast.deleted'));
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
                            {t('llmModels.actions.delete')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            if (!open) closeAdd();
            else setAddOpen(true);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('llmModels.addTitle')}</DialogTitle>
              <DialogDescription>
                {t('llmModels.addDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t('llmModels.fields.providerId')}</FieldLabel>
                <Select
                  value={modelForm.providerId || undefined}
                  onValueChange={(value) =>
                    setModelForm((current) => ({
                      ...current,
                      providerId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('llmModels.fields.providerId')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.modelId')}</FieldLabel>
                <Input
                  value={modelForm.model}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      model: event.target.value,
                    }))
                  }
                  placeholder="gpt-5.5"
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.displayName')}</FieldLabel>
                <Input
                  value={modelForm.displayName}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.role')}</FieldLabel>
                <Select
                  value={modelForm.role}
                  onValueChange={(value) =>
                    setModelForm((current) => ({
                      ...current,
                      role: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quick">quick</SelectItem>
                    <SelectItem value="deep">deep</SelectItem>
                    <SelectItem value="both">both</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.inputPrice')}</FieldLabel>
                <Input
                  value={modelForm.inputPrice}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      inputPrice: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.outputPrice')}</FieldLabel>
                <Input
                  value={modelForm.outputPrice}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      outputPrice: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field
                orientation="horizontal"
                className="sm:col-span-2 items-center gap-3 border border-border bg-muted/20 px-3 py-2.5"
              >
                <Checkbox
                  checked={modelForm.enabled}
                  onCheckedChange={(checked) =>
                    setModelForm((current) => ({
                      ...current,
                      enabled: checked === true,
                    }))
                  }
                  id="model-enabled"
                  className="size-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <FieldLabel
                    htmlFor="model-enabled"
                    className="cursor-pointer font-medium"
                  >
                    {t('llmModels.fields.openOnCreate')}
                  </FieldLabel>
                  <p className="text-xs text-muted-foreground">
                    {t('llmModels.fields.openOnCreateHint')}
                  </p>
                </div>
              </Field>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={!modelForm.providerId || !modelForm.model.trim()}
                onClick={async () => {
                  try {
                    const preview = await syncPreviewAdminLlmModel({
                      providerId: modelForm.providerId,
                      model: modelForm.model.trim(),
                    });
                    const data = preview.data;
                    setModelForm((current) => ({
                      ...current,
                      displayName:
                        current.displayName ||
                        String(data.displayName ?? current.model),
                      inputPrice:
                        data.inputPrice != null
                          ? String(data.inputPrice)
                          : current.inputPrice,
                      outputPrice:
                        data.outputPrice != null
                          ? String(data.outputPrice)
                          : current.outputPrice,
                    }));
                    toast.success(t('llmModels.toast.syncPreview'));
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : String(error),
                    );
                  }
                }}
              >
                {t('llmModels.actions.syncPreview')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeAdd}>
                  {t('llmModels.actions.cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={
                    !modelForm.providerId ||
                    !modelForm.model.trim() ||
                    saveModel.isPending
                  }
                  onClick={() => saveModel.mutate()}
                >
                  {t('llmModels.actions.createModel')}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={defaultsOpen} onOpenChange={setDefaultsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('llmModels.defaultsTitle')}</DialogTitle>
              <DialogDescription>
                {t('llmModels.defaultsDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field>
                <FieldLabel>{t('llmModels.fields.defaultQuick')}</FieldLabel>
                <Select
                  value={defaultQuick || undefined}
                  onValueChange={setDefaultQuick}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('llmModels.fields.defaultQuick')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.displayName} ({model.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.defaultDeep')}</FieldLabel>
                <Select
                  value={defaultDeep || undefined}
                  onValueChange={setDefaultDeep}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('llmModels.fields.defaultDeep')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.displayName} ({model.model})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDefaultsOpen(false)}
              >
                {t('llmModels.actions.cancel')}
              </Button>
              <Button
                type="button"
                disabled={
                  !defaultQuick || !defaultDeep || saveDefaults.isPending
                }
                onClick={() => saveDefaults.mutate()}
              >
                {t('llmModels.actions.saveDefaults')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
    </AdminGate>
  );
}
