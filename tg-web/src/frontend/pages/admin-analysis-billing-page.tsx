import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DEFAULT_BILLING_SETTINGS } from '@/shared/product-credits';
import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import { Button } from '@/frontend/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { Spinner } from '@/frontend/components/ui/spinner';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import {
  getAnalysisBillingSettings,
  updateAnalysisBillingSettings,
} from '@/frontend/lib/billing';

type AnalysisSettingsForm = {
  analysisBalanceThreshold: string;
  pointsPerUsd: string;
  markupPercent: string;
  sampleCostUsd: string;
};

export function AdminAnalysisBillingPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const isAdmin = session.data?.data.user.role === 'admin';
  const [form, setForm] = useState<AnalysisSettingsForm>({
    analysisBalanceThreshold: String(
      DEFAULT_BILLING_SETTINGS.analysisBalanceThreshold,
    ),
    pointsPerUsd: DEFAULT_BILLING_SETTINGS.pointsPerUsd,
    markupPercent: String(DEFAULT_BILLING_SETTINGS.markupBasisPoints / 100),
    sampleCostUsd: '1',
  });
  const analysisSettings = useQuery({
    queryKey: ['admin-analysis-billing-settings'],
    queryFn: () => getAnalysisBillingSettings(),
    enabled: isAdmin,
  });

  useEffect(() => {
    const value = analysisSettings.data?.data;
    if (!value) return;
    setForm((current) => ({
      ...current,
      analysisBalanceThreshold: String(value.analysisBalanceThreshold),
      pointsPerUsd: value.pointsPerUsd,
      markupPercent: String(value.markupBasisPoints / 100),
    }));
  }, [analysisSettings.data]);

  const save = useMutation({
    mutationFn: () =>
      updateAnalysisBillingSettings({
        analysisBalanceThreshold: Math.max(
          0,
          Math.floor(Number(form.analysisBalanceThreshold) || 0),
        ),
        pointsPerUsd: form.pointsPerUsd,
        markupBasisPoints: Math.round(Number(form.markupPercent) * 100),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin-analysis-billing-settings'],
      });
      toast.success(t('billing.credits.saved'));
    },
    onError: () => toast.error(t('billing.credits.saveError')),
  });

  const cost = Number(form.sampleCostUsd);
  const pointsPerUsd = Number(form.pointsPerUsd);
  const markupPercent = Number(form.markupPercent);
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
    ? t('billing.credits.formula', {
        cost: form.sampleCostUsd,
        pointsPerUsd: form.pointsPerUsd,
        markup: form.markupPercent,
        count: preview,
      })
    : t('billing.credits.formulaInvalid');

  return (
    <AdminGate
      accessTitle={t('billing.accessRequired.title')}
      accessBody={t('billing.accessRequired.body')}
    >
      <PageFrame
        title={t('billing.credits.heading')}
        description={t('billing.credits.subtitle')}
      >
        {analysisSettings.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <SectionPanel
            title={t('billing.credits.title')}
            description={t('billing.credits.description')}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="analysis-balance-threshold">
                    {t('billing.credits.balanceThreshold')}
                  </FieldLabel>
                  <Input
                    id="analysis-balance-threshold"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.analysisBalanceThreshold}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        analysisBalanceThreshold: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('billing.credits.balanceThresholdHint')}
                  </p>
                </Field>
                <Field>
                  <FieldLabel htmlFor="points-per-usd">
                    {t('billing.credits.pointsPerUsd')}
                  </FieldLabel>
                  <Input
                    id="points-per-usd"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    required
                    value={form.pointsPerUsd}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pointsPerUsd: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="markup-percent">
                    {t('billing.credits.markup')}
                  </FieldLabel>
                  <Input
                    id="markup-percent"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.01"
                    required
                    value={form.markupPercent}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        markupPercent: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-cost-usd">
                    {t('billing.credits.sampleCost')}
                  </FieldLabel>
                  <Input
                    id="sample-cost-usd"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sampleCostUsd}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sampleCostUsd: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('billing.credits.sampleCostHint')}
                  </p>
                </Field>
                <Field className="md:col-span-2">
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
                    {formula}
                  </p>
                </Field>
                <Field className="justify-end md:col-span-2 md:items-end">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Save data-icon="inline-start" />
                    )}
                    {t('billing.credits.save')}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </SectionPanel>
        )}
      </PageFrame>
    </AdminGate>
  );
}
