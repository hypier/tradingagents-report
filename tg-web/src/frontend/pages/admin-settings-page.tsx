import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  DEFAULT_BILLING_SETTINGS,
  DEFAULT_REWARDS_SETTINGS,
  type RewardsSettings,
} from '@/shared/product-credits';
import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { Spinner } from '@/frontend/components/ui/spinner';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { listAdminLlmModels } from '@/frontend/lib/admin-llm';
import {
  getAdminSettings,
  updateAdminSettings,
} from '@/frontend/lib/admin-ops';
import {
  getAnalysisBillingSettings,
  getRewardsSettings,
  updateAnalysisBillingSettings,
  updateRewardsSettings,
} from '@/frontend/lib/billing';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

type SettingsForm = {
  defaultQuickModelId: string;
  defaultDeepModelId: string;
};

type AnalysisSettingsForm = {
  analysisBalanceThreshold: string;
  pointsPerUsd: string;
  markupPercent: string;
  sampleCostUsd: string;
};

export function AdminSettingsPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const isAdmin = session.data?.data.user.role === 'admin';
  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => getAdminSettings(),
    enabled: isAdmin,
  });
  const analysisSettings = useQuery({
    queryKey: ['admin-analysis-billing-settings'],
    queryFn: () => getAnalysisBillingSettings(),
    enabled: isAdmin,
  });
  const rewardsSettings = useQuery({
    queryKey: ['admin-rewards-settings'],
    queryFn: () => getRewardsSettings(),
    enabled: isAdmin,
  });
  const modelsQuery = useQuery({
    queryKey: ['admin-llm-models'],
    queryFn: () => listAdminLlmModels(),
    enabled: isAdmin,
  });
  const [form, setForm] = useState<SettingsForm>({
    defaultQuickModelId: '',
    defaultDeepModelId: '',
  });
  const [analysisForm, setAnalysisForm] = useState<AnalysisSettingsForm>({
    analysisBalanceThreshold: String(
      DEFAULT_BILLING_SETTINGS.analysisBalanceThreshold,
    ),
    pointsPerUsd: DEFAULT_BILLING_SETTINGS.pointsPerUsd,
    markupPercent: String(DEFAULT_BILLING_SETTINGS.markupBasisPoints / 100),
    sampleCostUsd: '1',
  });
  const [rewardsForm, setRewardsForm] = useState<RewardsSettings>(
    DEFAULT_REWARDS_SETTINGS,
  );
  const enabledModels = (modelsQuery.data?.data.models ?? []).filter(
    (model) => model.enabled,
  );

  useEffect(() => {
    const data = settings.data?.data;
    if (!data) return;
    const llm = asRecord(data.llm);
    setForm({
      defaultQuickModelId:
        typeof llm.defaultQuickModelId === 'string'
          ? llm.defaultQuickModelId
          : '',
      defaultDeepModelId:
        typeof llm.defaultDeepModelId === 'string'
          ? llm.defaultDeepModelId
          : '',
    });
  }, [settings.data?.data]);

  useEffect(() => {
    const value = analysisSettings.data?.data;
    if (!value) return;
    setAnalysisForm((current) => ({
      ...current,
      analysisBalanceThreshold: String(value.analysisBalanceThreshold),
      pointsPerUsd: value.pointsPerUsd,
      markupPercent: String(value.markupBasisPoints / 100),
    }));
  }, [analysisSettings.data]);

  useEffect(() => {
    const value = rewardsSettings.data?.data;
    if (!value) return;
    setRewardsForm(value);
  }, [rewardsSettings.data]);

  const saveSettings = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {};
      if (form.defaultQuickModelId && form.defaultDeepModelId) {
        patch.llm = {
          defaultQuickModelId: form.defaultQuickModelId,
          defaultDeepModelId: form.defaultDeepModelId,
        };
      }
      return updateAdminSettings(patch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['public-config'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-llm-models'] });
      void queryClient.invalidateQueries({ queryKey: ['llm-catalog'] });
      toast.success(t('settings.saved'));
    },
    onError: (error: Error) =>
      toast.error(error.message || t('settings.saveError')),
  });

  const saveAnalysisBilling = useMutation({
    mutationFn: () =>
      updateAnalysisBillingSettings({
        analysisBalanceThreshold: Math.max(
          0,
          Math.floor(Number(analysisForm.analysisBalanceThreshold) || 0),
        ),
        pointsPerUsd: analysisForm.pointsPerUsd,
        markupBasisPoints: Math.round(Number(analysisForm.markupPercent) * 100),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin-analysis-billing-settings'],
      });
      toast.success(t('settings.billing.saved'));
    },
    onError: () => toast.error(t('settings.billing.saveError')),
  });

  const saveRewards = useMutation({
    mutationFn: () =>
      updateRewardsSettings({
        ...rewardsForm,
        // Campaign is not edited on this page; preserve stored value.
        campaign:
          rewardsSettings.data?.data.campaign ??
          DEFAULT_REWARDS_SETTINGS.campaign,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin-rewards-settings'],
      });
      toast.success(t('settings.rewards.saved'));
    },
    onError: () => toast.error(t('settings.rewards.saveError')),
  });

  function onSave(event: FormEvent) {
    event.preventDefault();
    if (
      (form.defaultQuickModelId && !form.defaultDeepModelId) ||
      (!form.defaultQuickModelId && form.defaultDeepModelId)
    ) {
      toast.error(t('settings.llmDefaultsPairRequired'));
      return;
    }
    saveSettings.mutate();
  }

  return (
    <AdminGate
      accessTitle={t('settings.accessRequired.title')}
      accessBody={t('settings.accessRequired.body')}
      loading={settings.isLoading}
    >
      <PageFrame
        title={t('settings.heading')}
        description={t('settings.subtitle')}
      >
        {settings.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('settings.loadError.title')}</AlertTitle>
            <AlertDescription>{t('settings.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-5">
            <form onSubmit={onSave} className="flex flex-col gap-5">
              <SectionPanel
                title={t('settings.llmDefaultsTitle')}
                description={t('settings.llmDefaultsDescription')}
              >
                {enabledModels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('settings.llmDefaultsEmpty')}{' '}
                    <Link
                      to="/admin/llm/models"
                      className="underline underline-offset-2"
                    >
                      {t('settings.llmDefaultsEmptyCta')}
                    </Link>
                  </p>
                ) : (
                  <FieldGroup className="sm:grid-cols-2">
                    <Field>
                      <FieldLabel>{t('settings.defaultQuickModel')}</FieldLabel>
                      <Select
                        value={form.defaultQuickModelId || undefined}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            defaultQuickModelId: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t('settings.defaultQuickModel')}
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
                      <FieldLabel>{t('settings.defaultDeepModel')}</FieldLabel>
                      <Select
                        value={form.defaultDeepModelId || undefined}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            defaultDeepModelId: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t('settings.defaultDeepModel')}
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
                  </FieldGroup>
                )}
              </SectionPanel>

              <div className="flex justify-end">
                <Button type="submit" disabled={saveSettings.isPending}>
                  {saveSettings.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" />
                  )}
                  {t('settings.save')}
                </Button>
              </div>
            </form>

            <AnalysisBillingSettingsEditor
              value={analysisForm}
              loading={analysisSettings.isLoading}
              pending={saveAnalysisBilling.isPending}
              onChange={(values) =>
                setAnalysisForm((current) => ({ ...current, ...values }))
              }
              onSubmit={() => saveAnalysisBilling.mutate()}
            />

            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-base font-medium tracking-tight">
                  {t('settings.rewards.title')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('settings.rewards.description')}
                </p>
              </div>
              <RewardsSettingsEditor
                value={rewardsForm}
                loading={rewardsSettings.isLoading}
                pending={saveRewards.isPending}
                onChange={setRewardsForm}
                onSubmit={() => saveRewards.mutate()}
              />
            </div>
          </div>
        )}
      </PageFrame>
    </AdminGate>
  );
}

function AnalysisBillingSettingsEditor({
  value,
  loading,
  pending,
  onChange,
  onSubmit,
}: {
  value: AnalysisSettingsForm;
  loading: boolean;
  pending: boolean;
  onChange(values: Partial<AnalysisSettingsForm>): void;
  onSubmit(): void;
}) {
  const { t } = useTranslation('admin');
  const cost = Number(value.sampleCostUsd);
  const pointsPerUsd = Number(value.pointsPerUsd);
  const markupPercent = Number(value.markupPercent);
  const markupBasisPoints = Math.round(markupPercent * 100);
  const previewValid =
    [cost, pointsPerUsd, markupBasisPoints].every(Number.isFinite) &&
    cost >= 0 &&
    pointsPerUsd > 0 &&
    markupBasisPoints >= 0;
  const preview = previewValid
    ? Math.ceil((cost * pointsPerUsd * (10_000 + markupBasisPoints)) / 10_000)
    : null;
  const formula = previewValid
    ? t('settings.billing.formula', {
        cost: value.sampleCostUsd,
        pointsPerUsd: value.pointsPerUsd,
        markup: value.markupPercent,
        count: preview,
      })
    : t('settings.billing.formulaInvalid');

  if (loading) return <Skeleton className="h-72 w-full" />;

  return (
    <SectionPanel
      title={t('settings.billing.title')}
      description={t('settings.billing.description')}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="settings-analysis-balance-threshold">
              {t('settings.billing.balanceThreshold')}
            </FieldLabel>
            <Input
              id="settings-analysis-balance-threshold"
              type="number"
              min="0"
              step="1"
              required
              value={value.analysisBalanceThreshold}
              onChange={(event) =>
                onChange({ analysisBalanceThreshold: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.billing.balanceThresholdHint')}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-points-per-usd">
              {t('settings.billing.pointsPerUsd')}
            </FieldLabel>
            <Input
              id="settings-points-per-usd"
              type="number"
              min="0.000001"
              step="0.000001"
              required
              value={value.pointsPerUsd}
              onChange={(event) =>
                onChange({ pointsPerUsd: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.billing.pointsPerUsdHint')}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-markup-percent">
              {t('settings.billing.markup')}
            </FieldLabel>
            <Input
              id="settings-markup-percent"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              required
              value={value.markupPercent}
              onChange={(event) =>
                onChange({ markupPercent: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.billing.markupHint')}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-sample-cost-usd">
              {t('settings.billing.sampleCost')}
            </FieldLabel>
            <Input
              id="settings-sample-cost-usd"
              type="number"
              min="0"
              step="0.01"
              value={value.sampleCostUsd}
              onChange={(event) =>
                onChange({ sampleCostUsd: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.billing.sampleCostHint')}
            </p>
          </Field>
          <Field className="md:col-span-2">
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
              {formula}
            </p>
          </Field>
          <Field className="justify-end md:col-span-2 md:items-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {t('settings.billing.save')}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </SectionPanel>
  );
}

function RewardsSettingsEditor({
  value,
  loading,
  pending,
  onChange,
  onSubmit,
}: {
  value: RewardsSettings;
  loading: boolean;
  pending: boolean;
  onChange(next: RewardsSettings): void;
  onSubmit(): void;
}) {
  const { t } = useTranslation('admin');

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <RewardChannelCard
          title={t('settings.rewards.signup.title')}
          description={t('settings.rewards.signup.description')}
          enabled={value.signup.enabled}
          points={value.signup.points}
          onEnabledChange={(enabled) =>
            onChange({
              ...value,
              signup: { ...value.signup, enabled },
            })
          }
          onPointsChange={(points) =>
            onChange({
              ...value,
              signup: { ...value.signup, points },
            })
          }
        />
        <RewardChannelCard
          title={t('settings.rewards.referral.title')}
          description={t('settings.rewards.referral.description')}
          enabled={value.referral.enabled}
          points={value.referral.points}
          onEnabledChange={(enabled) =>
            onChange({
              ...value,
              referral: { ...value.referral, enabled },
            })
          }
          onPointsChange={(points) =>
            onChange({
              ...value,
              referral: { ...value.referral, points },
            })
          }
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          {t('settings.rewards.save')}
        </Button>
      </div>
    </form>
  );
}

function RewardChannelCard({
  title,
  description,
  enabled,
  points,
  onEnabledChange,
  onPointsChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  points: number;
  onEnabledChange(enabled: boolean): void;
  onPointsChange(points: number): void;
}) {
  const { t } = useTranslation('admin');
  return (
    <SectionPanel title={title} description={description}>
      <FieldGroup className="gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => onEnabledChange(checked === true)}
          />
          {t('settings.rewards.enabled')}
        </label>
        <Field>
          <FieldLabel>{t('settings.rewards.points')}</FieldLabel>
          <Input
            type="number"
            min="0"
            step="1"
            value={points}
            onChange={(event) =>
              onPointsChange(
                Math.max(0, Math.floor(Number(event.target.value) || 0)),
              )
            }
          />
        </Field>
      </FieldGroup>
    </SectionPanel>
  );
}
