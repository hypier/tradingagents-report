import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Play, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { QuoteStrip } from '../components/dashboard/quote-strip';
import { RecentReports } from '../components/dashboard/recent-reports';
import {
  getAnalystIcon,
  Languages,
} from '../components/icons/research-icons';
import { TickerSearch } from '../components/ticker-search';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Spinner } from '../components/ui/spinner';
import { getAccountProfile } from '../lib/account';
import { getBillingOverview } from '../lib/billing';
import { OUTPUT_LANGUAGE_IDS, formatOutputLanguage } from '../lib/format-output-language';
import { fetchCreditEstimate } from '../lib/public-config';
import { todayInTimezone } from '../i18n/locales';
import { cn } from '../lib/utils';
import { listingFromProviderSymbol } from '@/shared/listing';
import { marketFromExchange } from '@/shared/market-codes';
import {
  createResearch,
  getMarketIdentities,
  getMarketSnapshot,
  getResearchEvents,
  listResearch,
  type SelectedInstrument,
} from '../lib/research';

const analystOptions = ['market', 'fundamentals', 'news', 'social'];

function instrumentFromProviderSymbol(
  providerSymbol: string,
): SelectedInstrument | null {
  try {
    const listing = listingFromProviderSymbol(providerSymbol);
    if (!listing.exchange || !listing.provider_symbol) return null;
    return {
      display_ticker: listing.display_ticker,
      provider_symbol: listing.provider_symbol,
      display_name: listing.display_ticker,
      exchange: listing.exchange,
      symbol: listing.symbol,
    };
  } catch {
    return null;
  }
}

export function HomePage() {
  const { t } = useTranslation(['home', 'common']);
  const [searchParams] = useSearchParams();
  const [instrument, setInstrument] = useState<SelectedInstrument | null>(() => {
    const symbol = searchParams.get('symbol');
    return symbol ? instrumentFromProviderSymbol(symbol) : null;
  });
  const [analysts, setAnalysts] = useState<string[]>(analystOptions);
  const [outputLanguage, setOutputLanguage] = useState('English');
  const [customLanguage, setCustomLanguage] = useState('');
  const [tradeDate, setTradeDate] = useState(() => todayInTimezone('UTC'));
  const [prefsReady, setPrefsReady] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['account-profile'],
    queryFn: getAccountProfile,
  });
  const billing = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
  });

  useEffect(() => {
    const current = profile.data?.data.profile;
    if (!current || prefsReady) return;
    setOutputLanguage(current.reportLanguage || 'English');
    setTradeDate(todayInTimezone(current.timezone));
    setPrefsReady(true);
  }, [prefsReady, profile.data?.data.profile]);

  const jobs = useQuery({
    queryKey: ['analyses'],
    queryFn: () => listResearch(),
    refetchInterval: (query) =>
      query.state.data?.data.some(
        (job) => job.status === 'queued' || job.status === 'running',
      )
        ? 5_000
        : false,
  });
  const active = jobs.data?.data.find(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const events = useQuery({
    queryKey: ['analysis-events', active?.id],
    queryFn: () => getResearchEvents(active!.id),
    enabled: Boolean(active),
    refetchInterval: active ? 5_000 : false,
  });
  const assetTickers = [
    ...new Set([
      ...(jobs.data?.data ?? []).map((job) => job.ticker),
      ...(instrument ? [instrument.display_ticker] : []),
    ]),
  ];
  const identities = useQuery({
    queryKey: ['market-identities', assetTickers],
    queryFn: () => getMarketIdentities(assetTickers),
    enabled: assetTickers.length > 0,
  });
  const snapshot = useQuery({
    queryKey: ['snapshot', instrument?.provider_symbol],
    queryFn: () => getMarketSnapshot(instrument!.provider_symbol),
    enabled: Boolean(instrument?.provider_symbol),
  });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createResearch>[0]) =>
      createResearch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      toast.success(t('submit.toastSuccess'));
    },
  });
  const createErrorCode =
    create.error &&
    typeof create.error === 'object' &&
    'code' in create.error &&
    typeof create.error.code === 'string'
      ? create.error.code
      : null;
  const quote = snapshot.data?.data;
  const identitiesByTicker = Object.fromEntries(
    (identities.data?.data ?? []).map((identity) => [
      identity.ticker,
      identity,
    ]),
  );
  const selectedOutputLanguage =
    outputLanguage === 'custom' ? customLanguage.trim() : outputLanguage;
  const availableCredits = billing.data?.data.usage?.availableCredits ?? 0;
  const subscriptionStatus = billing.data?.data.subscription?.status;
  const hasActiveSubscription =
    subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const selectedMarket = marketFromExchange(instrument?.exchange);
  const creditEstimate = useQuery({
    queryKey: ['credit-estimate', selectedMarket, analysts.length],
    queryFn: () => fetchCreditEstimate(selectedMarket, analysts.length),
    enabled: analysts.length > 0,
    staleTime: 30_000,
  });
  const creditUnits = creditEstimate.data ?? 1;
  const insufficientCredits =
    billing.isSuccess &&
    (!hasActiveSubscription || availableCredits < creditUnits);
  const maxTradeDate = todayInTimezone(
    profile.data?.data.profile.timezone ?? 'UTC',
  );
  const defaultMarket = profile.data?.data.profile.defaultMarket;

  function submit() {
    if (
      instrument &&
      analysts.length &&
      selectedOutputLanguage &&
      tradeDate &&
      !insufficientCredits
    ) {
      create.mutate({
        ticker: instrument.display_ticker,
        tradeDate,
        analysts,
        outputLanguage: selectedOutputLanguage,
        instrument: {
          exchange: instrument.exchange,
          symbol: instrument.symbol,
          display_ticker: instrument.display_ticker,
        },
        display: {
          display_name: instrument.display_name,
          ...(instrument.logo_url ? { logo_url: instrument.logo_url } : {}),
        },
      });
    }
  }

  const quoteForStrip = quote
    ? {
        ...quote,
        logo_url:
          quote.logo_url ??
          identitiesByTicker[quote.ticker]?.logo_url ??
          instrument?.logo_url,
        display_name:
          quote.display_name ??
          identitiesByTicker[quote.ticker]?.display_name ??
          instrument?.display_name,
        display_ticker:
          quote.display_ticker ??
          identitiesByTicker[quote.ticker]?.display_ticker ??
          instrument?.display_ticker,
      }
    : null;

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Composer + pipeline */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:border-r">
          <div className="border-b border-border px-6 py-5 lg:px-8">
            <p className="font-label-caps text-primary">{t('eyebrow')}</p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight md:text-2xl">
              {t('title')}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              {t('subtitle')}
            </p>
          </div>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6 lg:px-8">
              <Field>
                <FieldLabel
                  htmlFor="ticker"
                  className="inline-flex items-center gap-2 text-sm"
                >
                  <Search className="size-4 text-muted-foreground" />
                  {t('instrument.label')}
                </FieldLabel>
                <TickerSearch
                  id="ticker"
                  value={instrument}
                  onChange={setInstrument}
                  preferredMarket={defaultMarket}
                />
                {!instrument ? (
                  <FieldDescription>{t('instrument.hint')}</FieldDescription>
                ) : null}
              </Field>

              <Field>
                <FieldTitle
                  id="analyst-team-label"
                  className="inline-flex items-center gap-2 text-sm"
                >
                  {t('analystTeam')}
                </FieldTitle>
                <FieldDescription>{t('analystTeamHint')}</FieldDescription>
                <div
                  role="group"
                  aria-labelledby="analyst-team-label"
                  className="mt-1 grid gap-3 sm:grid-cols-2"
                >
                  {analystOptions.map((analyst) => {
                    const Icon = getAnalystIcon(analyst);
                    const selected = analysts.includes(analyst);
                    return (
                      <button
                        key={analyst}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setAnalysts((current) =>
                            selected
                              ? current.filter((value) => value !== analyst)
                              : [...current, analyst],
                          );
                        }}
                        className={cn(
                          'group/analyst relative flex min-h-[6.75rem] flex-col items-start gap-2.5 rounded-soft border bg-background px-4 py-3.5 text-left transition-colors',
                          'border-border hover:border-foreground/25 hover:bg-muted/30',
                          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
                          'active:translate-y-px',
                          selected &&
                            'border-primary bg-background shadow-[inset_3px_0_0_0_var(--primary)]',
                        )}
                      >
                        <div className="flex w-full items-start gap-3">
                          <span
                            className={cn(
                              'flex size-10 shrink-0 items-center justify-center rounded-soft border bg-muted/60 text-foreground/70',
                              'border-border',
                              selected &&
                                'border-primary/50 bg-primary text-primary-foreground',
                            )}
                          >
                            <Icon className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold tracking-tight text-foreground">
                                {t(`analysts.${analyst}.title`)}
                              </span>
                              <span
                                className={cn(
                                  'font-mono text-[10px] font-semibold tracking-[0.12em] uppercase',
                                  selected
                                    ? 'text-primary'
                                    : 'text-muted-foreground/50',
                                )}
                              >
                                {selected ? 'ON' : 'OFF'}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                              {t(`analysts.${analyst}.description`)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel
                    htmlFor="trade-date"
                    className="inline-flex items-center gap-2 text-sm"
                  >
                    <CalendarDays className="size-4 text-muted-foreground" />
                    {t('tradeDate.label')}
                  </FieldLabel>
                  <Input
                    id="trade-date"
                    type="date"
                    value={tradeDate}
                    max={maxTradeDate}
                    onChange={(event) => setTradeDate(event.target.value)}
                    required
                  />
                  <FieldDescription>{t('tradeDate.hint')}</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="output-language"
                    className="inline-flex items-center gap-2 text-sm"
                  >
                    <Languages className="size-4 text-muted-foreground" />
                    {t('reportLanguage.label')}
                  </FieldLabel>
                  <Select
                    value={outputLanguage}
                    onValueChange={setOutputLanguage}
                  >
                    <SelectTrigger
                      id="output-language"
                      aria-label={t('reportLanguage.label')}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTPUT_LANGUAGE_IDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {formatOutputLanguage(value, (key, options) =>
                            t(`common:${key}`, options),
                          )}
                          {value === 'English'
                            ? ` (${t('reportLanguage.defaultSuffix')})`
                            : ''}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">
                        {t('reportLanguage.custom')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>

              {outputLanguage === 'custom' && (
                <Field>
                  <FieldLabel htmlFor="custom-language">
                    {t('reportLanguage.custom')}
                  </FieldLabel>
                  <Input
                    id="custom-language"
                    value={customLanguage}
                    onChange={(event) => setCustomLanguage(event.target.value)}
                    placeholder={t('reportLanguage.customPlaceholder')}
                    required
                  />
                </Field>
              )}

              {insufficientCredits ? (
                <Alert>
                  <AlertTitle>{t('submit.creditsRequiredTitle')}</AlertTitle>
                  <AlertDescription>
                    <Link className="underline" to="/billing">
                      {t('submit.insufficientCredits')}
                    </Link>
                  </AlertDescription>
                </Alert>
              ) : null}

              {create.isError && (
                <Alert variant="destructive">
                  <AlertTitle>
                    {createErrorCode === 'CONSENT_REQUIRED'
                      ? t('submit.consentRequiredTitle')
                      : createErrorCode === 'INSUFFICIENT_CREDITS' ||
                          createErrorCode === 'SUBSCRIPTION_REQUIRED'
                        ? t('submit.creditsRequiredTitle')
                        : t('submit.errorTitle')}
                  </AlertTitle>
                  <AlertDescription>
                    {createErrorCode === 'CONSENT_REQUIRED' ? (
                      <Link className="underline" to="/account">
                        {t('submit.consentRequiredBody')}
                      </Link>
                    ) : createErrorCode === 'INSUFFICIENT_CREDITS' ||
                      createErrorCode === 'SUBSCRIPTION_REQUIRED' ? (
                      <Link className="underline" to="/billing">
                        {t('submit.creditsRequiredBody')}
                      </Link>
                    ) : (
                      t('submit.errorBody')
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                {billing.isSuccess && !insufficientCredits ? (
                  <p className="font-mono text-sm tabular-nums text-muted-foreground">
                    {t('submit.runEstimate', {
                      cost: creditUnits,
                      available: availableCredits,
                      defaultValue: `This run: ${creditUnits} · Available: ${availableCredits}`,
                    })}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  size="lg"
                  className="ml-auto min-w-[12rem] font-semibold tracking-wide uppercase"
                  disabled={
                    !instrument ||
                    !analysts.length ||
                    !selectedOutputLanguage ||
                    !tradeDate ||
                    insufficientCredits ||
                    create.isPending
                  }
                >
                  {create.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  {create.isPending
                    ? t('submit.submitting')
                    : t('submit.runWithCredit', {
                        count: creditUnits,
                      })}
                </Button>
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-muted/15">
              <PipelinePanel
                variant="rail"
                job={active}
                events={events.data?.data}
                loading={events.isLoading}
              />
            </div>
          </form>
        </section>

        {/* Quote + recent reports */}
        <aside className="flex w-full min-h-0 shrink-0 flex-col border-t border-border bg-muted/20 lg:w-[min(100%,24rem)] lg:border-t-0 xl:w-[26rem]">
          <div className="shrink-0 border-b border-border p-4">
            <p className="mb-3 font-label-caps text-muted-foreground">
              {t('snapshot.title')}
            </p>
            <QuoteStrip
              variant="panel"
              quote={quoteForStrip}
              loading={
                Boolean(instrument?.provider_symbol) && snapshot.isLoading
              }
              detailHref={
                instrument?.provider_symbol
                  ? `/stocks/${encodeURIComponent(instrument.provider_symbol)}`
                  : undefined
              }
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RecentReports
              density="rail"
              jobs={jobs.data?.data ?? []}
              loading={jobs.isLoading}
              error={jobs.isError}
              identities={identitiesByTicker}
              onOpenReport={(id) => navigate(`/reports/${id}`)}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
