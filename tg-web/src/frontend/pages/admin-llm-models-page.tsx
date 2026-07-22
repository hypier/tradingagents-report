import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
  createAdminLlmModel,
  deleteAdminLlmModel,
  listAdminLlmModels,
  listAdminLlmProviders,
  listAdminUpstreamModels,
  syncAdminLlmModel,
  syncPreviewAdminLlmModel,
  updateAdminLlmModel,
  type AdminLlmModel,
} from '@/frontend/lib/admin-llm';
import {
  formatLocaleDateTimeValue,
  formatTrimmedDecimal,
  formatUsdPrice,
} from '@/frontend/lib/format-locale';

type ModelForm = {
  providerId: string;
  model: string;
  displayName: string;
  role: string;
  enabled: boolean;
  currency: string;
  unitTokens: string;
  inputPrice: string;
  outputPrice: string;
  cachedInputPrice: string;
  cacheWritePrice: string;
  contextWindow: string;
  maxOutputTokens: string;
  paramsJson: string;
  capabilitiesJson: string;
};

const emptyModelForm = (): ModelForm => ({
  providerId: '',
  model: '',
  displayName: '',
  role: 'both',
  enabled: false,
  currency: 'USD',
  unitTokens: '1000000',
  inputPrice: '',
  outputPrice: '',
  cachedInputPrice: '',
  cacheWritePrice: '',
  contextWindow: '',
  maxOutputTokens: '',
  paramsJson: '{}',
  capabilitiesJson: '{}',
});

function stringifyJson(value: Record<string, unknown> | null | undefined) {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {}, null, 2);
  } catch {
    return '{}';
  }
}

function parseOptionalInt(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return num;
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const trimmed = raw.trim() || '{}';
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be')) {
      throw error;
    }
    throw new Error(`Invalid ${label} JSON`);
  }
}

function toForm(model: AdminLlmModel): ModelForm {
  return {
    providerId: model.providerId,
    model: model.model,
    displayName: model.displayName,
    role: model.role,
    enabled: model.enabled,
    currency: model.currency || 'USD',
    unitTokens: String(model.unitTokens ?? 1_000_000),
    inputPrice: formatTrimmedDecimal(model.inputPrice, ''),
    outputPrice: formatTrimmedDecimal(model.outputPrice, ''),
    cachedInputPrice: formatTrimmedDecimal(model.cachedInputPrice, ''),
    cacheWritePrice: formatTrimmedDecimal(model.cacheWritePrice, ''),
    contextWindow:
      model.contextWindow != null ? String(model.contextWindow) : '',
    maxOutputTokens:
      model.maxOutputTokens != null ? String(model.maxOutputTokens) : '',
    paramsJson: stringifyJson(model.params),
    capabilitiesJson: stringifyJson(model.capabilities),
  };
}

function applySyncFields(
  current: ModelForm,
  data: Record<string, unknown>,
): ModelForm {
  return {
    ...current,
    displayName:
      current.displayName ||
      String(data.displayName ?? current.model),
    currency:
      typeof data.currency === 'string' && data.currency
        ? data.currency
        : current.currency,
    unitTokens:
      data.unitTokens != null
        ? String(data.unitTokens)
        : current.unitTokens,
    inputPrice:
      data.inputPrice != null
        ? formatTrimmedDecimal(data.inputPrice as string | number, '')
        : current.inputPrice,
    outputPrice:
      data.outputPrice != null
        ? formatTrimmedDecimal(data.outputPrice as string | number, '')
        : current.outputPrice,
    cachedInputPrice:
      data.cachedInputPrice != null
        ? formatTrimmedDecimal(data.cachedInputPrice as string | number, '')
        : current.cachedInputPrice,
    cacheWritePrice:
      data.cacheWritePrice != null
        ? formatTrimmedDecimal(data.cacheWritePrice as string | number, '')
        : current.cacheWritePrice,
    contextWindow:
      data.contextWindow != null
        ? String(data.contextWindow)
        : current.contextWindow,
    maxOutputTokens:
      data.maxOutputTokens != null
        ? String(data.maxOutputTokens)
        : current.maxOutputTokens,
    paramsJson:
      data.params && typeof data.params === 'object'
        ? stringifyJson(data.params as Record<string, unknown>)
        : current.paramsJson,
    capabilitiesJson:
      data.capabilities && typeof data.capabilities === 'object'
        ? stringifyJson(data.capabilities as Record<string, unknown>)
        : current.capabilitiesJson,
  };
}

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
  const providerById = useMemo(() => {
    const map = new Map(providers.map((provider) => [provider.id, provider]));
    return map;
  }, [providers]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminLlmModel | null>(null);
  const [modelForm, setModelForm] = useState<ModelForm>(emptyModelForm);
  const [syncBusy, setSyncBusy] = useState(false);
  const [customModelId, setCustomModelId] = useState(false);

  const editingModel = editingId
    ? (models.find((model) => model.id === editingId) ?? null)
    : null;

  const upstreamQuery = useQuery({
    queryKey: ['admin-llm-upstream-models', modelForm.providerId],
    queryFn: () => listAdminUpstreamModels(modelForm.providerId),
    enabled: isAdmin && dialogOpen && !editingId && Boolean(modelForm.providerId),
    staleTime: 60_000,
    retry: false,
  });
  const upstreamModels = upstreamQuery.data?.data.models ?? [];

  useEffect(() => {
    if (editingId || !modelForm.providerId) {
      setCustomModelId(false);
      return;
    }
    if (upstreamQuery.isError) {
      setCustomModelId(true);
      return;
    }
    if (!upstreamQuery.isSuccess) return;
    if (upstreamModels.length === 0) {
      setCustomModelId(true);
      return;
    }
    if (modelForm.model && !upstreamModels.includes(modelForm.model)) {
      setCustomModelId(true);
    } else {
      setCustomModelId(false);
    }
  }, [
    editingId,
    modelForm.providerId,
    modelForm.model,
    upstreamQuery.isError,
    upstreamQuery.isSuccess,
    upstreamModels,
  ]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-llm-models'] });

  const openCreate = () => {
    setEditingId(null);
    setModelForm(emptyModelForm());
    setCustomModelId(false);
    setDialogOpen(true);
  };

  const openEdit = (model: AdminLlmModel) => {
    setEditingId(model.id);
    setModelForm(toForm(model));
    setCustomModelId(false);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setModelForm(emptyModelForm());
    setSyncBusy(false);
    setCustomModelId(false);
  };

  const buildPayload = () => {
    const unitTokens = Number(modelForm.unitTokens.trim() || '1000000');
    if (!Number.isFinite(unitTokens) || !Number.isInteger(unitTokens) || unitTokens <= 0) {
      throw new Error(t('llmModels.errors.unitTokens'));
    }
    return {
      displayName: modelForm.displayName.trim() || modelForm.model.trim(),
      role: modelForm.role,
      enabled: modelForm.enabled,
      currency: modelForm.currency.trim() || 'USD',
      unitTokens,
      inputPrice: modelForm.inputPrice.trim() || null,
      outputPrice: modelForm.outputPrice.trim() || null,
      cachedInputPrice: modelForm.cachedInputPrice.trim() || null,
      cacheWritePrice: modelForm.cacheWritePrice.trim() || null,
      contextWindow: parseOptionalInt(
        modelForm.contextWindow,
        t('llmModels.fields.contextWindow'),
      ),
      maxOutputTokens: parseOptionalInt(
        modelForm.maxOutputTokens,
        t('llmModels.fields.maxOutputTokens'),
      ),
      params: parseJsonObject(modelForm.paramsJson, 'params'),
      capabilities: parseJsonObject(
        modelForm.capabilitiesJson,
        'capabilities',
      ),
    };
  };

  const saveModel = useMutation({
    mutationFn: () => {
      const body = buildPayload();
      if (editingId) {
        return updateAdminLlmModel(editingId, body);
      }
      return createAdminLlmModel({
        providerId: modelForm.providerId,
        model: modelForm.model.trim(),
        ...body,
      });
    },
    onSuccess: async () => {
      toast.success(
        editingId
          ? t('llmModels.toast.modelUpdated')
          : t('llmModels.toast.modelSaved'),
      );
      closeDialog();
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeModel = useMutation({
    mutationFn: (id: string) => deleteAdminLlmModel(id),
    onSuccess: async () => {
      toast.success(t('llmModels.toast.deleted'));
      setDeleteTarget(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runSync = async () => {
    setSyncBusy(true);
    try {
      if (editingId) {
        const result = await syncAdminLlmModel(editingId);
        setModelForm(toForm(result.data));
        toast.success(t('llmModels.toast.synced'));
        await invalidate();
      } else {
        const preview = await syncPreviewAdminLlmModel({
          providerId: modelForm.providerId,
          model: modelForm.model.trim(),
        });
        setModelForm((current) => applySyncFields(current, preview.data));
        toast.success(t('llmModels.toast.syncPreview'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncBusy(false);
    }
  };

  const loading = providersQuery.isLoading || modelsQuery.isLoading;
  const errored = providersQuery.isError || modelsQuery.isError;
  const canSubmit = editingId
    ? Boolean(modelForm.model.trim())
    : Boolean(modelForm.providerId && modelForm.model.trim());
  const canSync = editingId
    ? Boolean(editingId)
    : Boolean(modelForm.providerId && modelForm.model.trim());

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
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            disabled={providers.length === 0}
          >
            <Plus data-icon="inline-start" />
            {t('llmModels.actions.add')}
          </Button>
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
                    <TableHead className="w-[1%] whitespace-nowrap pr-5 lg:pr-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="pl-5 text-muted-foreground lg:pl-6"
                      >
                        {t('llmModels.empty')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    models.map((model) => (
                      <TableRow key={model.id}>
                        <TableCell className="pl-5 lg:pl-6">
                          <div className="flex items-center gap-3">
                            <LlmProviderMark
                              providerId={
                                providerById.get(model.providerId)?.driver ??
                                model.providerId
                              }
                            />
                            <div className="min-w-0">
                              <div className="font-normal">
                                {model.displayName}
                              </div>
                              <div className="font-mono text-xs tracking-wide text-muted-foreground">
                                {model.model}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {providerById.get(model.providerId)?.displayName ??
                            model.providerId}
                        </TableCell>
                        <TableCell>{model.role}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {formatUsdPrice(model.inputPrice)}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {formatUsdPrice(model.outputPrice)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={model.enabled ? 'up' : 'outline'}
                          >
                            {model.enabled
                              ? t('llmModels.open')
                              : t('llmModels.closed')}
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
                                  aria-label={t('llmModels.actions.edit')}
                                  onClick={() => openEdit(model)}
                                >
                                  <Pencil />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={6}>
                                {t('llmModels.actions.edit')}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="destructive"
                                  aria-label={t('llmModels.actions.delete')}
                                  onClick={() => setDeleteTarget(model)}
                                >
                                  <Trash2 />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={6}>
                                {t('llmModels.actions.delete')}
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
          </>
        )}

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) closeDialog();
            else setDialogOpen(true);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingId
                  ? t('llmModels.editTitle')
                  : t('llmModels.addTitle')}
              </DialogTitle>
              <DialogDescription>
                {editingId
                  ? t('llmModels.editDescription')
                  : t('llmModels.addDescription')}
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
                      model: '',
                      displayName: '',
                    }))
                  }
                  disabled={Boolean(editingId)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('llmModels.fields.providerId')}
                    >
                      {modelForm.providerId ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <LlmProviderMark
                            providerId={
                              providerById.get(modelForm.providerId)?.driver ??
                              modelForm.providerId
                            }
                            className="size-5 border-0 bg-transparent"
                          />
                          <span className="truncate">
                            {providerById.get(modelForm.providerId)
                              ?.displayName ?? modelForm.providerId}
                          </span>
                        </span>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        <span className="flex items-center gap-2">
                          <LlmProviderMark
                            providerId={provider.driver}
                            className="size-5 border-0 bg-transparent"
                          />
                          {provider.displayName}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.modelId')}</FieldLabel>
                {editingId ? (
                  <Input
                    value={modelForm.model}
                    disabled
                    className="font-mono"
                  />
                ) : customModelId ||
                  (!upstreamQuery.isFetching &&
                    upstreamModels.length === 0 &&
                    Boolean(modelForm.providerId)) ? (
                  <div className="space-y-2">
                    <Input
                      value={modelForm.model}
                      onChange={(event) =>
                        setModelForm((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                      placeholder="gpt-5.5"
                      className="font-mono"
                      disabled={!modelForm.providerId}
                    />
                    {upstreamModels.length > 0 ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0"
                        onClick={() => {
                          setCustomModelId(false);
                          setModelForm((current) => ({
                            ...current,
                            model: upstreamModels.includes(current.model)
                              ? current.model
                              : '',
                          }));
                        }}
                      >
                        {t('llmModels.actions.pickFromList')}
                      </Button>
                    ) : null}
                    {upstreamQuery.isError ? (
                      <p className="text-xs text-muted-foreground">
                        {t('llmModels.upstreamLoadError')}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Select
                      value={modelForm.model || undefined}
                      onValueChange={(value) => {
                        if (value === '__custom__') {
                          setCustomModelId(true);
                          setModelForm((current) => ({
                            ...current,
                            model: '',
                          }));
                          return;
                        }
                        setModelForm((current) => ({
                          ...current,
                          model: value,
                          displayName: current.displayName || value,
                        }));
                      }}
                      disabled={
                        !modelForm.providerId || upstreamQuery.isFetching
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            upstreamQuery.isFetching
                              ? t('llmModels.upstreamLoading')
                              : t('llmModels.fields.modelId')
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {upstreamModels.map((modelId) => (
                          <SelectItem key={modelId} value={modelId}>
                            <span className="font-mono text-xs">{modelId}</span>
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">
                          {t('llmModels.actions.customModelId')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {upstreamQuery.isFetching ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <LoaderCircle className="size-3 animate-spin" />
                        {t('llmModels.upstreamLoading')}
                      </p>
                    ) : null}
                  </div>
                )}
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
                <FieldLabel>{t('llmModels.fields.currency')}</FieldLabel>
                <Input
                  value={modelForm.currency}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                  placeholder="USD"
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.unitTokens')}</FieldLabel>
                <Input
                  value={modelForm.unitTokens}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      unitTokens: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                />
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
                  placeholder="$ / unit"
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
                  placeholder="$ / unit"
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.cachedInputPrice')}</FieldLabel>
                <Input
                  value={modelForm.cachedInputPrice}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      cachedInputPrice: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.cacheWritePrice')}</FieldLabel>
                <Input
                  value={modelForm.cacheWritePrice}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      cacheWritePrice: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.contextWindow')}</FieldLabel>
                <Input
                  value={modelForm.contextWindow}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      contextWindow: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field>
                <FieldLabel>{t('llmModels.fields.maxOutputTokens')}</FieldLabel>
                <Input
                  value={modelForm.maxOutputTokens}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      maxOutputTokens: event.target.value,
                    }))
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>{t('llmModels.fields.params')}</FieldLabel>
                <textarea
                  className="min-h-24 w-full rounded-none border border-input bg-transparent px-3.5 py-2.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  value={modelForm.paramsJson}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      paramsJson: event.target.value,
                    }))
                  }
                  spellCheck={false}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>{t('llmModels.fields.capabilities')}</FieldLabel>
                <textarea
                  className="min-h-24 w-full rounded-none border border-input bg-transparent px-3.5 py-2.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  value={modelForm.capabilitiesJson}
                  onChange={(event) =>
                    setModelForm((current) => ({
                      ...current,
                      capabilitiesJson: event.target.value,
                    }))
                  }
                  spellCheck={false}
                />
              </Field>
              {editingId ? (
                <div className="sm:col-span-2 space-y-1 border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                  <div>
                    {t('llmModels.fields.syncedAt')}:{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {editingModel?.syncedAt
                        ? formatLocaleDateTimeValue(editingModel.syncedAt)
                        : '—'}
                    </span>
                  </div>
                  {editingModel?.syncError ? (
                    <div className="text-destructive">
                      {t('llmModels.fields.syncError')}: {editingModel.syncError}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                    {t('llmModels.fields.enabled')}
                  </FieldLabel>
                  <p className="text-xs text-muted-foreground">
                    {t('llmModels.fields.enabledHint')}
                  </p>
                </div>
              </Field>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={!canSync || syncBusy}
                onClick={() => void runSync()}
              >
                {syncBusy ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}
                {editingId
                  ? t('llmModels.actions.sync')
                  : t('llmModels.actions.syncPreview')}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t('llmModels.actions.cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={!canSubmit || saveModel.isPending}
                  onClick={() => saveModel.mutate()}
                >
                  {editingId
                    ? t('llmModels.actions.save')
                    : t('llmModels.actions.createModel')}
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
              <DialogTitle>{t('llmModels.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t('llmModels.deleteBody', {
                  name: deleteTarget?.displayName ?? deleteTarget?.model ?? '',
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
              >
                {t('llmModels.actions.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!deleteTarget || removeModel.isPending}
                onClick={() => {
                  if (!deleteTarget) return;
                  removeModel.mutate(deleteTarget.id);
                }}
              >
                {t('llmModels.actions.confirmDelete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageFrame>
    </AdminGate>
  );
}
