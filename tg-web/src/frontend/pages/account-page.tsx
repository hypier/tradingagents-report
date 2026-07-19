import { useEffect, useState, type FormEvent } from 'react';
import { UserProfile } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import type {
  LegalDocumentType,
  ProductPreferences,
} from '@/backend/account/contract';
import { AppShell } from '@/frontend/components/app-shell';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
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

const legalDocuments: Array<[LegalDocumentType, string, string]> = [
  ['risk_disclaimer', 'Risk disclaimer', 'risk-disclaimer'],
  ['terms', 'Terms of service', 'terms'],
  ['privacy', 'Privacy policy', 'privacy'],
];

export function AccountPage() {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['account-profile'],
    queryFn: getAccountProfile,
  });
  const [preferences, setPreferences] = useState<ProductPreferences | null>(
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
    onSuccess: () => {
      void refresh();
      toast.success('Preferences saved.');
    },
    onError: () => toast.error('Unable to save preferences.'),
  });
  const consent = useMutation({
    mutationFn: acceptLegalDocuments,
    onSuccess: () => {
      void refresh();
      toast.success('Consent recorded.');
    },
    onError: () => toast.error('Unable to record consent.'),
  });

  return (
    <AppShell title="Account">
      <main className="flex flex-1 flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        <header className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Profile and preferences</h2>
          <p className="text-sm text-muted-foreground">
            Identity, research defaults, and legal consent
          </p>
        </header>
        {profile.isLoading || !preferences ? (
          <Skeleton className="h-80 w-full" />
        ) : profile.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load account</AlertTitle>
            <AlertDescription>
              Retry after checking the service connection.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Research preferences</CardTitle>
                <CardDescription>
                  Defaults applied across the product
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    save.mutate(preferences);
                  }}
                >
                  <FieldGroup className="grid gap-4 md:grid-cols-2">
                    <PreferenceSelect
                      label="Interface language"
                      value={preferences.interfaceLanguage}
                      values={[
                        ['en', 'English'],
                        ['zh-CN', '简体中文'],
                      ]}
                      onChange={(interfaceLanguage) =>
                        setPreferences({
                          ...preferences,
                          interfaceLanguage:
                            interfaceLanguage as ProductPreferences['interfaceLanguage'],
                        })
                      }
                    />
                    <Field>
                      <FieldLabel htmlFor="report-language">
                        Report language
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
                      <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
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
                      label="Default market"
                      value={preferences.defaultMarket}
                      values={[
                        ['US', 'United States'],
                        ['HK', 'Hong Kong'],
                        ['CN', 'Mainland China'],
                        ['CRYPTO', 'Crypto'],
                      ]}
                      onChange={(defaultMarket) =>
                        setPreferences({
                          ...preferences,
                          defaultMarket:
                            defaultMarket as ProductPreferences['defaultMarket'],
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
                        Save preferences
                      </Button>
                    </Field>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Legal consent</CardTitle>
                <CardDescription>
                  Current documents must be accepted before submitting analysis
                  jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  {legalDocuments.map(([type, label, path]) => (
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
                            I accept the{' '}
                            <Link
                              className="underline underline-offset-4"
                              to={`/legal/${path}`}
                            >
                              {label}
                            </Link>
                          </label>
                        </FieldTitle>
                        <p className="text-xs text-muted-foreground">
                          Version {profile.data!.data.legalVersions[type]}
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
                        ? 'Consent current'
                        : 'Record consent'}
                    </Button>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-base font-semibold">Clerk identity</h3>
                <p className="text-sm text-muted-foreground">
                  Name, avatar, password, social accounts, and active sessions
                </p>
              </div>
              <UserProfile routing="hash" />
            </section>
          </>
        )}
      </main>
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
