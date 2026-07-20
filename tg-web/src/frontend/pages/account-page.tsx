import { useEffect, useState, type FormEvent } from 'react';
import { UserProfile } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import type {
  LegalDocumentType,
  AccountPreferences,
} from '@/backend/account/contract';
import { AppShell } from '@/frontend/components/app-shell';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldTitle,
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
  acceptLegalDocuments,
  getAccountProfile,
  updateAccountPreferences,
} from '@/frontend/lib/account';
import { interfaceLanguageToUiLocale } from '@/frontend/i18n/locales';

const legalDocuments: Array<[LegalDocumentType, string]> = [
  ['risk_disclaimer', 'risk-disclaimer'],
  ['terms', 'terms'],
  ['privacy', 'privacy'],
];

export function AccountPage() {
  const { t, i18n } = useTranslation('account');
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['account-profile'],
    queryFn: getAccountProfile,
  });
  const [preferences, setPreferences] = useState<AccountPreferences | null>(
    null,
  );
  const [accepted, setAccepted] = useState<LegalDocumentType[]>([]);
  useEffect(() => {
    const current = profile.data?.data.profile;
    if (current) {
      setPreferences({
        interfaceLanguage: current.interfaceLanguage,
        reportLanguage: current.reportLanguage,
        timezone: current.timezone,
        defaultMarket: current.defaultMarket,
      });
      setAccepted(
        current.consents
          .filter(
            (consent) =>
              profile.data?.data.legalVersions[consent.documentType] ===
              consent.documentVersion,
          )
          .map((consent) => consent.documentType),
      );
    }
  }, [profile.data]);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['account-profile'] });
  const save = useMutation({
    mutationFn: updateAccountPreferences,
    onSuccess: (_data, variables) => {
      void refresh();
      void i18n.changeLanguage(
        interfaceLanguageToUiLocale(variables.interfaceLanguage),
      );
      toast.success(t('preferences.saved'));
    },
    onError: () => toast.error(t('preferences.saveError')),
  });
  const consent = useMutation({
    mutationFn: acceptLegalDocuments,
    onSuccess: () => {
      void refresh();
      toast.success(t('legal.recorded'));
    },
    onError: () => toast.error(t('legal.recordError')),
  });

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
                        setPreferences({
                          ...preferences,
                          interfaceLanguage:
                            interfaceLanguage as AccountPreferences['interfaceLanguage'],
                        })
                      }
                    />
                    <Field>
                      <FieldLabel htmlFor="report-language">
                        {t('preferences.reportLanguage')}
                      </FieldLabel>
                      <Input
                        id="report-language"
                        value={preferences.reportLanguage}
                        maxLength={64}
                        onChange={(event) =>
                          setPreferences({
                            ...preferences,
                            reportLanguage: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="timezone">
                        {t('preferences.timezone')}
                      </FieldLabel>
                      <Input
                        id="timezone"
                        value={preferences.timezone}
                        placeholder="Asia/Shanghai"
                        onChange={(event) =>
                          setPreferences({
                            ...preferences,
                            timezone: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <PreferenceSelect
                      label={t('preferences.defaultMarket')}
                      value={preferences.defaultMarket}
                      values={[
                        ['US', t('preferences.markets.US')],
                        ['HK', t('preferences.markets.HK')],
                        ['CN', t('preferences.markets.CN')],
                        ['CRYPTO', t('preferences.markets.CRYPTO')],
                      ]}
                      onChange={(defaultMarket) =>
                        setPreferences({
                          ...preferences,
                          defaultMarket:
                            defaultMarket as AccountPreferences['defaultMarket'],
                        })
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
            <SectionPanel
              title={t('legal.title')}
              description={t('legal.description')}
            >
                <FieldGroup>
                  {legalDocuments.map(([type, path]) => (
                    <Field key={type} orientation="horizontal">
                      <Checkbox
                        id={`consent-${type}`}
                        checked={accepted.includes(type)}
                        onCheckedChange={(checked) =>
                          setAccepted((current) =>
                            checked
                              ? [...new Set([...current, type])]
                              : current.filter((item) => item !== type),
                          )
                        }
                      />
                      <div className="flex flex-col gap-1">
                        <FieldTitle>
                          <label htmlFor={`consent-${type}`}>
                            {t('legal.acceptPrefix')}{' '}
                            <Link
                              className="underline underline-offset-4"
                              to={`/legal/${path}`}
                            >
                              {t(`legal.documents.${type}`)}
                            </Link>
                          </label>
                        </FieldTitle>
                        <p className="text-xs text-muted-foreground">
                          {t('legal.version', {
                            version: profile.data!.data.legalVersions[type],
                          })}
                        </p>
                      </div>
                    </Field>
                  ))}
                  <Field className="items-end">
                    <Button
                      disabled={
                        accepted.length !== 3 ||
                        consent.isPending ||
                        profile.data?.data.profile.hasCurrentConsents
                      }
                      onClick={() => consent.mutate(accepted)}
                    >
                      {consent.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <ShieldCheck data-icon="inline-start" />
                      )}
                      {profile.data?.data.profile.hasCurrentConsents
                        ? t('legal.current')
                        : t('legal.record')}
                    </Button>
                  </Field>
                </FieldGroup>
            </SectionPanel>
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
      <Select value={value} onValueChange={onChange}>
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
