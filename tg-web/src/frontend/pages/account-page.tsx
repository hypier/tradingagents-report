import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { UserProfile } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type {
  AccountPreferences,
  ReferralSummary,
} from '@/backend/account/contract';
import { AppShell } from '@/frontend/components/app-shell';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { Spinner } from '@/frontend/components/ui/spinner';
import {
  getAccountProfile,
  getReferralSummary,
  updateAccountPreferences,
} from '@/frontend/lib/account';
import { setDisplayTimezone } from '@/frontend/lib/display-timezone';
import {
  OUTPUT_LANGUAGE_IDS,
  formatOutputLanguage,
  normalizeOutputLanguageId,
} from '@/frontend/lib/format-output-language';
import { fetchPublicConfig } from '@/frontend/lib/public-config';
import { cn } from '@/frontend/lib/utils';
import { interfaceLanguageToUiLocale } from '@/frontend/i18n/locales';
import { PRODUCT_MARKET_CATALOG } from '@/shared/product-markets';
import { marketsFromEnabledExchanges } from '@/frontend/lib/public-config';
import { listTimezoneSelectOptions } from '@/shared/timezone';

export function AccountPage() {
  const { t, i18n } = useTranslation('account');
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['account-profile'],
    queryFn: getAccountProfile,
  });
  const referral = useQuery({
    queryKey: ['account-referral'],
    queryFn: getReferralSummary,
  });
  const publicConfig = useQuery({
    queryKey: ['public-config'],
    queryFn: () => fetchPublicConfig(),
  });
  const [preferences, setPreferences] = useState<AccountPreferences | null>(
    null,
  );
  useEffect(() => {
    const current = profile.data?.data.profile;
    if (current) {
      setPreferences({
        interfaceLanguage: current.interfaceLanguage,
        reportLanguage:
          normalizeOutputLanguageId(current.reportLanguage) ?? 'English',
        timezone: current.timezone,
        defaultMarket: current.defaultMarket,
      });
    }
  }, [profile.data]);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['account-profile'] });
  const save = useMutation({
    mutationFn: updateAccountPreferences,
    onSuccess: (_data, variables) => {
      void refresh();
      setDisplayTimezone(variables.timezone);
      void i18n.changeLanguage(
        interfaceLanguageToUiLocale(variables.interfaceLanguage),
      );
      toast.success(t('preferences.saved'));
    },
    onError: () => toast.error(t('preferences.saveError')),
  });
  const timezoneOptions = useMemo(
    () => listTimezoneSelectOptions(preferences?.timezone),
    [preferences?.timezone],
  );
  const marketOptions = useMemo(() => {
    const fromExchanges = marketsFromEnabledExchanges(
      publicConfig.data?.exchanges,
    );
    const rows =
      fromExchanges.length > 0
        ? fromExchanges
        : PRODUCT_MARKET_CATALOG.filter((row) => row.enabled).map((row) => ({
            code: row.code,
            displayName: row.displayName,
          }));
    return rows.map((row) => {
      const code = row.code;
      const localizedKey = `preferences.markets.${code}` as const;
      const localized = t(localizedKey, { defaultValue: '' });
      return [
        code,
        localized || row.displayName || code,
      ] as [string, string];
    });
  }, [publicConfig.data?.exchanges, t]);

  return (
    <AppShell>
      <PageFrame title={t('heading')} description={t('subtitle')}>
        {profile.isLoading || !preferences ? (
          <Skeleton className="h-80 w-full" />
        ) : profile.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('loadError.title')}</AlertTitle>
            <AlertDescription>{t('loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <>
            <SectionPanel
              title={t('preferences.title')}
              description={t('preferences.description')}
            >
                <form
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    save.mutate(preferences);
                  }}
                >
                  <FieldGroup className="grid gap-4 md:grid-cols-2">
                    <PreferenceSelect
                      label={t('preferences.interfaceLanguage')}
                      value={preferences.interfaceLanguage}
                      values={[
                        ['en', t('preferences.languages.en')],
                        ['zh-CN', t('preferences.languages.zhCN')],
                      ]}
                      onChange={(interfaceLanguage) =>
                        setPreferences((current) =>
                          current
                            ? {
                                ...current,
                                interfaceLanguage:
                                  interfaceLanguage as AccountPreferences['interfaceLanguage'],
                              }
                            : current,
                        )
                      }
                    />
                    <PreferenceSelect
                      label={t('preferences.reportLanguage')}
                      value={
                        (OUTPUT_LANGUAGE_IDS as readonly string[]).includes(
                          preferences.reportLanguage,
                        )
                          ? preferences.reportLanguage
                          : 'English'
                      }
                      values={OUTPUT_LANGUAGE_IDS.map((value) => [
                        value,
                        formatOutputLanguage(value, (key, options) =>
                          t(`common:${key}`, options),
                        ),
                      ])}
                      onChange={(reportLanguage) =>
                        setPreferences((current) =>
                          current
                            ? { ...current, reportLanguage }
                            : current,
                        )
                      }
                    />
                    <Field>
                      <FieldLabel htmlFor="timezone">
                        {t('preferences.timezone')}
                      </FieldLabel>
                      <select
                        id="timezone"
                        value={preferences.timezone}
                        onChange={(event) =>
                          setPreferences((current) =>
                            current
                              ? { ...current, timezone: event.target.value }
                              : current,
                          )
                        }
                        className={cn(
                          'flex h-11 w-full min-w-0 appearance-none items-center rounded-none border border-input bg-transparent px-3.5 py-2.5 text-base transition-colors outline-none',
                          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
                          'dark:bg-card',
                        )}
                      >
                        {timezoneOptions.map(([option, text]) => (
                          <option key={option} value={option}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <PreferenceSelect
                      label={t('preferences.defaultMarket')}
                      value={preferences.defaultMarket}
                      values={marketOptions}
                      onChange={(defaultMarket) =>
                        setPreferences((current) =>
                          current
                            ? {
                                ...current,
                                defaultMarket:
                                  defaultMarket as AccountPreferences['defaultMarket'],
                              }
                            : current,
                        )
                      }
                    />
                    <Field className="md:col-span-2 md:items-end">
                      <Button disabled={save.isPending} type="submit">
                        {save.isPending ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <Save data-icon="inline-start" />
                        )}
                        {t('preferences.save')}
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
            </SectionPanel>
            <ReferralCard
              isError={referral.isError}
              isLoading={referral.isLoading}
              summary={referral.data?.data}
            />
            <SectionPanel
              title={t('clerk.title')}
              description={t('clerk.description')}
            >
              <UserProfile routing="hash" />
            </SectionPanel>
          </>
        )}
      </PageFrame>
    </AppShell>
  );
}

export function ReferralCard({
  isError,
  isLoading,
  summary,
}: {
  isError: boolean;
  isLoading: boolean;
  summary?: ReferralSummary;
}) {
  const { t } = useTranslation('account');
  const referralUrl = summary
    ? new URL(summary.referralPath, window.location.origin).toString()
    : '';
  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast.success(t('referral.copied'));
    } catch {
      toast.error(t('referral.copyError'));
    }
  };

  return (
    <SectionPanel
      title={t('referral.title')}
      description={t('referral.description')}
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError || !summary ? (
        <Alert variant="destructive">
          <AlertTitle>{t('referral.loadError')}</AlertTitle>
        </Alert>
      ) : (
        <div className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="referral-link">{t('referral.link')}</FieldLabel>
            <div className="flex min-w-0 gap-2">
              <Input
                className="min-w-0"
                id="referral-link"
                readOnly
                value={referralUrl}
              />
              <Button
                aria-label={t('referral.copy')}
                onClick={() => void copyReferral()}
                size="icon"
                type="button"
                variant="outline"
              >
                <Copy />
              </Button>
            </div>
          </Field>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">
                {t('referral.successful')}
              </dt>
              <dd className="text-2xl font-semibold">
                {summary.successfulReferrals}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">
                {t('referral.earned')}
              </dt>
              <dd className="text-2xl font-semibold">{summary.earnedCredits}</dd>
            </div>
          </dl>
        </div>
      )}
    </SectionPanel>
  );
}

function PreferenceSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: Array<[string, string]>;
  onChange(value: string): void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          // Radix form bubble select can briefly emit "" while options hydrate.
          if (!next) return;
          onChange(next);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {values.map(([option, text]) => (
              <SelectItem key={option} value={option}>
                {text}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
