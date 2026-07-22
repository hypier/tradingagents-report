import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

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
import { listAdminLlmModels } from '@/frontend/lib/admin-llm';
import {
  createCreditRule,
  deleteCreditRule,
  getAdminSettings,
  listCreditRules,
  updateAdminSettings,
  type CreditRuleInput,
} from '@/frontend/lib/admin-ops';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

type SettingsForm = {
  maintenanceEnabled: boolean;
  maintenanceEn: string;
  maintenanceZh: string;
  watchlist: boolean;
  shareLinks: boolean;
  disclaimerVersion: string;
  disclaimerEn: string;
  disclaimerZh: string;
  webhookUrl: string;
  defaultQuickModelId: string;
  defaultDeepModelId: string;
};

const emptyRule: CreditRuleInput = {
  label: '',
  market: null,
  minAnalysts: 1,
  maxAnalysts: 4,
  units: 1,
  enabled: true,
  priority: 100,
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
  const modelsQuery = useQuery({
    queryKey: ['admin-llm-models'],
    queryFn: () => listAdminLlmModels(),
    enabled: isAdmin,
  });
  const rules = useQuery({
    queryKey: ['admin-credit-rules'],
    queryFn: () => listCreditRules(),
    enabled: isAdmin,
  });
  const [form, setForm] = useState<SettingsForm>({
    maintenanceEnabled: false,
    maintenanceEn: '',
    maintenanceZh: '',
    watchlist: true,
    shareLinks: true,
    disclaimerVersion: '',
    disclaimerEn: '',
    disclaimerZh: '',
    webhookUrl: '',
    defaultQuickModelId: '',
    defaultDeepModelId: '',
  });
  const [ruleForm, setRuleForm] = useState<CreditRuleInput>(emptyRule);
  const enabledModels = (modelsQuery.data?.data.models ?? []).filter(
    (model) => model.enabled,
  );

  useEffect(() => {
    const data = settings.data?.data;
    if (!data) return;
    const maintenance = asRecord(data.maintenance);
    const message = asRecord(maintenance.message);
    const features = asRecord(data.features);
    const disclaimer = asRecord(data.disclaimer);
    const markdown = asRecord(disclaimer.markdown);
    const alerts = asRecord(data.alerts);
    const llm = asRecord(data.llm);
    setForm({
      maintenanceEnabled: Boolean(maintenance.enabled),
      maintenanceEn: typeof message.en === 'string' ? message.en : '',
      maintenanceZh: typeof message.zh === 'string' ? message.zh : '',
      watchlist: features.watchlist !== false,
      shareLinks: features.shareLinks !== false,
      disclaimerVersion:
        typeof disclaimer.version === 'string' ? disclaimer.version : '',
      disclaimerEn: typeof markdown.en === 'string' ? markdown.en : '',
      disclaimerZh: typeof markdown.zh === 'string' ? markdown.zh : '',
      webhookUrl: typeof alerts.webhookUrl === 'string' ? alerts.webhookUrl : '',
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

  const saveSettings = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {
        maintenance: {
          enabled: form.maintenanceEnabled,
          message: { en: form.maintenanceEn, zh: form.maintenanceZh },
        },
        features: {
          watchlist: form.watchlist,
          shareLinks: form.shareLinks,
        },
        disclaimer: {
          version: form.disclaimerVersion.trim() || null,
          markdown: {
            en: form.disclaimerEn.trim() || null,
            zh: form.disclaimerZh.trim() || null,
          },
        },
        alerts: { webhookUrl: form.webhookUrl.trim() },
      };
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

  const createRule = useMutation({
    mutationFn: () =>
      createCreditRule({
        ...ruleForm,
        market: ruleForm.market?.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-credit-rules'] });
      setRuleForm(emptyRule);
      toast.success(t('settings.ruleCreated'));
    },
    onError: () => toast.error(t('settings.ruleCreateError')),
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => deleteCreditRule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-credit-rules'] });
      toast.success(t('settings.ruleDeleted'));
    },
    onError: () => toast.error(t('settings.ruleDeleteError')),
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

  function onCreateRule(event: FormEvent) {
    event.preventDefault();
    createRule.mutate();
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
          <form onSubmit={onSave} className="flex flex-col gap-5">
            <SectionPanel
              title={t('settings.maintenanceTitle')}
              description={t('settings.maintenanceDescription')}
            >
              <FieldGroup>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.maintenanceEnabled}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        maintenanceEnabled: checked === true,
                      }))
                    }
                  />
                  {t('settings.maintenanceEnabled')}
                </label>
                <Field>
                  <FieldLabel>{t('settings.messageEn')}</FieldLabel>
                  <Input
                    value={form.maintenanceEn}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maintenanceEn: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('settings.messageZh')}</FieldLabel>
                  <Input
                    value={form.maintenanceZh}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maintenanceZh: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FieldGroup>
            </SectionPanel>

            <SectionPanel title={t('settings.featuresTitle')}>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watchlist}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        watchlist: checked === true,
                      }))
                    }
                  />
                  {t('settings.featureWatchlist')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.shareLinks}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        shareLinks: checked === true,
                      }))
                    }
                  />
                  {t('settings.featureShareLinks')}
                </label>
              </div>
            </SectionPanel>

            <SectionPanel title={t('settings.disclaimerTitle')}>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t('settings.disclaimerVersion')}</FieldLabel>
                  <Input
                    value={form.disclaimerVersion}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        disclaimerVersion: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('settings.disclaimerEn')}</FieldLabel>
                  <textarea
                    className="min-h-28 w-full rounded-none border border-input bg-transparent px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    value={form.disclaimerEn}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        disclaimerEn: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('settings.disclaimerZh')}</FieldLabel>
                  <textarea
                    className="min-h-28 w-full rounded-none border border-input bg-transparent px-3.5 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    value={form.disclaimerZh}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        disclaimerZh: event.target.value,
                      }))
                    }
                  />
                </Field>
              </FieldGroup>
            </SectionPanel>

            <SectionPanel title={t('settings.alertsTitle')}>
              <Field>
                <FieldLabel>{t('settings.webhookUrl')}</FieldLabel>
                <Input
                  value={form.webhookUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      webhookUrl: event.target.value,
                    }))
                  }
                  placeholder="https://"
                />
              </Field>
            </SectionPanel>

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
        )}

        <SectionPanel
          title={t('settings.creditRulesTitle')}
          description={t('settings.creditRulesDescription')}
        >
          <div className="flex flex-col gap-4">
            <form
              onSubmit={onCreateRule}
              className="grid gap-3 md:grid-cols-3 lg:grid-cols-6"
            >
              <Input
                placeholder={t('settings.ruleLabel')}
                value={ruleForm.label}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                required
              />
              <Input
                placeholder={t('settings.ruleMarket')}
                value={ruleForm.market ?? ''}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    market: event.target.value || null,
                  }))
                }
              />
              <Input
                type="number"
                min={1}
                max={20}
                placeholder={t('settings.ruleMin')}
                value={ruleForm.minAnalysts}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    minAnalysts: Number(event.target.value) || 1,
                  }))
                }
              />
              <Input
                type="number"
                min={1}
                max={20}
                placeholder={t('settings.ruleMax')}
                value={ruleForm.maxAnalysts}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    maxAnalysts: Number(event.target.value) || 1,
                  }))
                }
              />
              <Input
                type="number"
                min={0}
                max={100}
                placeholder={t('settings.ruleUnits')}
                value={ruleForm.units}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    units: Number(event.target.value) || 0,
                  }))
                }
              />
              <Button type="submit" disabled={createRule.isPending}>
                {createRule.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                {t('settings.addRule')}
              </Button>
            </form>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.columns.label')}</TableHead>
                  <TableHead>{t('settings.columns.market')}</TableHead>
                  <TableHead>{t('settings.columns.analysts')}</TableHead>
                  <TableHead>{t('settings.columns.units')}</TableHead>
                  <TableHead>{t('settings.columns.enabled')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rules.data?.data ?? []).map((rule) => (
                  <TableRow key={rule.id} className="h-11">
                    <TableCell>{rule.label}</TableCell>
                    <TableCell>{rule.market ?? '—'}</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {rule.minAnalysts}–{rule.maxAnalysts}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {rule.units}
                    </TableCell>
                    <TableCell>
                      {rule.enabled ? t('settings.yes') : t('settings.no')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={removeRule.isPending}
                        onClick={() => removeRule.mutate(rule.id)}
                        aria-label={t('settings.deleteRule')}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionPanel>
      </PageFrame>
    </AdminGate>
  );
}
