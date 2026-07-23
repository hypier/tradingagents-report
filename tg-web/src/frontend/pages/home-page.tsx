import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, PanelRightOpen, Play, Search } from 'lucide-react';
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
import { LlmProviderMark } from '../components/llm-provider-mark';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { getAccountProfile } from '../lib/account';
import { getBillingOverview } from '../lib/billing';
import { OUTPUT_LANGUAGE_IDS, formatOutputLanguage } from '../lib/format-output-language';
import {
  getLlmCatalog,
  type LlmCatalog,
  type LlmCatalogModel,
} from '../lib/llm-catalog';
import { todayInTimezone } from '../i18n/locales';
import { cn } from '../lib/utils';
import { listingFromProviderSymbol } from '@/shared/listing';
import {
  guessBrowserTimezone,
  resolveTimezoneForExchange,
} from '@/shared/timezone';
import {
  createResearch,
  cancelResearch,
  estimateResearch,
  getMarketSnapshot,
  getResearchEvents,
  listResearch,
  type AnalysisJob,
  type SelectedInstrument,
} from '../lib/research';
import { useJobMarketIdentities } from '../hooks/use-market-identities';

const analystOptions = ['market', 'fundamentals', 'news', 'social'];
const REPORTS_RAIL_OPEN_KEY = 'tg-web.home-reports-rail-open';

function loadReportsRailOpen(defaultOpen = true): boolean {
  if (typeof window === 'undefined') return defaultOpen;
  try {
    const raw = window.localStorage.getItem(REPORTS_RAIL_OPEN_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    // Ignore quota / privacy mode failures.
  }
  return defaultOpen;
}

function saveReportsRailOpen(open: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REPORTS_RAIL_OPEN_KEY, open ? '1' : '0');
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

function pickDefaultModelId(
  catalog: LlmCatalog | undefined,
  role: 'quick' | 'deep',
  preferredId: string | null | undefined,
  providerId?: string,
) {
  if (!catalog) return undefined;
  const matches = (model: LlmCatalogModel) => {
    if (role === 'quick' ? !model.canQuick : !model.canDeep) return false;
    if (providerId && model.providerId !== providerId) return false;
    return true;
  };
  if (preferredId) {
    const preferred = catalog.models.find(
      (model) => model.id === preferredId && matches(model),
    );
    if (preferred) return preferred.id;
  }
  return catalog.models.find(matches)?.id;
}

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
  const [quickModelId, setQuickModelId] = useState('');
  const [deepModelId, setDeepModelId] = useState('');
  const [tradeDate, setTradeDate] = useState(() =>
    todayInTimezone(guessBrowserTimezone()),
  );
  const [prefsReady, setPrefsReady] = useState(false);
  const [reportsRailOpen, setReportsRailOpen] = useState(loadReportsRailOpen);
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
  const llmCatalog = useQuery({
    queryKey: ['llm-catalog'],
    queryFn: () => getLlmCatalog(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const catalog = llmCatalog.data?.data;
    if (!catalog) return;

    const nextQuickId =
      quickModelId ||
      pickDefaultModelId(catalog, 'quick', catalog.defaults.defaultQuickModelId);
    if (!quickModelId && nextQuickId) {
      setQuickModelId(nextQuickId);
    }

    const quickProviderId = catalog.models.find(
      (model) => model.id === nextQuickId,
    )?.providerId;
    const nextDeepId =
      deepModelId ||
      pickDefaultModelId(
        catalog,
        'deep',
        catalog.defaults.defaultDeepModelId,
        quickProviderId,
      );
    if (!deepModelId && nextDeepId) {
      setDeepModelId(nextDeepId);
    }
  }, [deepModelId, llmCatalog.data?.data, quickModelId]);

  useEffect(() => {
    const current = profile.data?.data.profile;
    if (!current || prefsReady) return;
    const preferred = current.reportLanguage || 'English';
    setOutputLanguage(
      (OUTPUT_LANGUAGE_IDS as readonly string[]).includes(preferred)
        ? preferred
        : 'English',
    );
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
  const { identities } = useJobMarketIdentities(jobs.data?.data ?? []);
  const [watchedJobId, setWatchedJobId] = useState<string | null>(null);
  const [stoppingJobId, setStoppingJobId] = useState<string | null>(null);
  const watchedJob = watchedJobId
    ? jobs.data?.data.find((job) => job.id === watchedJobId)
    : undefined;
  const liveWatched =
    watchedJob &&
    (watchedJob.status === 'queued' || watchedJob.status === 'running')
      ? watchedJob
      : undefined;
  const finishedWatched =
    watchedJob &&
    (watchedJob.status === 'succeeded' || watchedJob.status === 'failed')
      ? watchedJob
      : undefined;
  const activeFromList = jobs.data?.data.find(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const active = liveWatched ?? activeFromList;
  const eventsJobId = active?.id ?? finishedWatched?.id;
  const events = useQuery({
    queryKey: ['analysis-events', eventsJobId],
    queryFn: () => getResearchEvents(eventsJobId!),
    enabled: Boolean(eventsJobId),
    refetchInterval: active ? 5_000 : false,
  });
  // Prefer job.display written at submit; legacy rows should be backfilled in DB.
  const snapshot = useQuery({
    queryKey: ['snapshot', instrument?.provider_symbol],
    queryFn: () => getMarketSnapshot(instrument!.provider_symbol),
    enabled: Boolean(instrument?.provider_symbol),
  });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createResearch>[0]) =>
      createResearch(input),
    onSuccess: (result) => {
      setWatchedJobId(result.data.id);
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      toast.success(t('submit.toastSuccess'));
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelResearch(id),
    onSuccess: (result, id) => {
      setStoppingJobId(id);
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-events', id] });
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      toast.success(
        result.data.status === 'cancel_requested'
          ? t('pipeline.toastStopping')
          : t('pipeline.toastStopped'),
      );
      if (result.data.status !== 'cancel_requested') {
        setStoppingJobId(null);
      }
    },
    onError: () => {
      toast.error(t('pipeline.toastStopFailed'));
    },
  });
  const stopping =
    cancel.isPending ||
    (stoppingJobId != null &&
      (active?.id === stoppingJobId || watchedJobId === stoppingJobId));

  useEffect(() => {
    if (!watchedJobId && activeFromList?.id) {
      setWatchedJobId(activeFromList.id);
    }
  }, [activeFromList?.id, watchedJobId]);

  useEffect(() => {
    if (!stoppingJobId) return;
    const job = jobs.data?.data.find((item) => item.id === stoppingJobId);
    if (!job || job.status === 'succeeded' || job.status === 'failed') {
      setStoppingJobId(null);
    }
  }, [jobs.data?.data, stoppingJobId]);

  const createErrorCode =
    create.error &&
    typeof create.error === 'object' &&
    'code' in create.error &&
    typeof create.error.code === 'string'
      ? create.error.code
      : null;
  const quote = snapshot.data?.data;
  const watchedListed = Boolean(watchedJob);
  const optimisticJob =
    instrument &&
    (create.isPending || (Boolean(watchedJobId) && !watchedListed))
      ? ({
          id: watchedJobId ?? 'pending-submit',
          ticker: instrument.display_ticker,
          status: 'queued' as const,
          analysts,
          progress_percent: 0,
          current_step: null,
          display: {
            display_name:
              quote?.display_name?.trim() || instrument.display_name,
            ...(quote?.english_name?.trim() ||
            instrument.english_name?.trim()
              ? {
                  english_name:
                    quote?.english_name?.trim() ||
                    instrument.english_name?.trim(),
                }
              : {}),
            ...(quote?.logo_url?.trim() || instrument.logo_url?.trim()
              ? {
                  logo_url:
                    quote?.logo_url?.trim() || instrument.logo_url?.trim(),
                }
              : {}),
          },
        } satisfies AnalysisJob)
      : undefined;
  const pipelineJob = active ?? optimisticJob ?? finishedWatched;
  const showPipeline = Boolean(pipelineJob);
  const availableCredits = billing.data?.data.usage?.availableCredits ?? 0;
  const accountTimezone =
    profile.data?.data.profile.timezone ?? guessBrowserTimezone();
  const tradeDateTimezone = resolveTimezoneForExchange(
    instrument?.exchange,
    accountTimezone,
  );
  const maxTradeDate = todayInTimezone(tradeDateTimezone);

  useEffect(() => {
    if (!prefsReady) return;
    setTradeDate((current) => (current > maxTradeDate ? maxTradeDate : current));
  }, [maxTradeDate, prefsReady]);

  const catalog = llmCatalog.data?.data;
  const catalogModels = catalog?.models ?? [];
  const catalogProviders = catalog?.providers ?? [];
  const providerDriverById = new Map(
    catalogProviders.map((provider) => [provider.id, provider.driver]),
  );
  const modelOption = (model: LlmCatalogModel) => {
    const driver = providerDriverById.get(model.providerId) ?? model.providerId;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <LlmProviderMark
          providerId={driver}
          className="size-5 border-0 bg-transparent"
        />
        <span className="truncate font-mono text-sm">{model.model}</span>
      </span>
    );
  };
  const quickModels = catalogModels.filter((model) => model.canQuick);
  const deepModels = catalogModels.filter(
    (model) =>
      model.canDeep &&
      (!quickModelId ||
        model.providerId ===
          catalogModels.find((item) => item.id === quickModelId)?.providerId),
  );
  const modelsReady = Boolean(
    quickModelId &&
      deepModelId &&
      quickModels.some((model) => model.id === quickModelId) &&
      deepModels.some((model) => model.id === deepModelId),
  );

  const pendingResearchInput =
    instrument && analysts.length && outputLanguage && tradeDate && modelsReady
      ? {
          ticker: instrument.display_ticker,
          tradeDate,
          analysts,
          outputLanguage,
          quickModelId,
          deepModelId,
          instrument: {
            exchange: instrument.exchange,
            symbol: instrument.symbol,
            display_ticker: instrument.display_ticker,
          },
          display: {
            display_name:
              quote?.display_name?.trim() || instrument.display_name,
            ...(quote?.english_name?.trim() ||
            instrument.english_name?.trim()
              ? {
                  english_name:
                    quote?.english_name?.trim() ||
                    instrument.english_name?.trim(),
                }
              : {}),
            ...(quote?.logo_url?.trim() || instrument.logo_url?.trim()
              ? {
                  logo_url:
                    quote?.logo_url?.trim() || instrument.logo_url?.trim(),
                }
              : {}),
          },
        }
      : null;
  const estimate = useQuery({
    queryKey: [
      'analysis-credit-estimate',
      pendingResearchInput?.ticker,
      pendingResearchInput?.tradeDate,
      analysts,
      outputLanguage,
      quickModelId,
      deepModelId,
    ],
    queryFn: () => estimateResearch(pendingResearchInput!),
    enabled: pendingResearchInput !== null,
    staleTime: 30_000,
  });
  const estimateData = estimate.data?.data;
  const reservedPoints = estimateData?.reservedPoints;
  const insufficientCredits =
    billing.isSuccess &&
    estimate.isSuccess &&
    (estimateData?.canStart === false ||
      (estimateData?.canStart === undefined &&
        reservedPoints !== undefined &&
        availableCredits < reservedPoints));
  const defaultMarket = profile.data?.data.profile.defaultMarket;

  function submit() {
    if (
      instrument &&
      analysts.length &&
      outputLanguage &&
      tradeDate &&
      modelsReady &&
      !insufficientCredits
    ) {
      const displayName =
        quote?.display_name?.trim() || instrument.display_name;
      const englishName =
        quote?.english_name?.trim() ||
        instrument.english_name?.trim() ||
        undefined;
      const logoUrl =
        quote?.logo_url?.trim() ||
        instrument.logo_url?.trim() ||
        undefined;
      create.mutate({
        ticker: instrument.display_ticker,
        tradeDate,
        analysts,
        outputLanguage,
        quickModelId,
        deepModelId,
        instrument: {
          exchange: instrument.exchange,
          symbol: instrument.symbol,
          display_ticker: instrument.display_ticker,
        },
        display: {
          display_name: displayName,
          ...(englishName ? { english_name: englishName } : {}),
          ...(logoUrl ? { logo_url: logoUrl } : {}),
        },
      });
    }
  }

  const quoteForStrip = quote
    ? {
        ...quote,
        logo_url: quote.logo_url ?? instrument?.logo_url,
        display_name: quote.display_name ?? instrument?.display_name,
        english_name: quote.english_name ?? instrument?.english_name,
        display_ticker: quote.display_ticker ?? instrument?.display_ticker,
      }
    : null;

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:border-r">
          {showPipeline ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:p-6">
              <PipelinePanel
                variant="full"
                className="min-h-[28rem]"
                job={pipelineJob}
                events={events.data?.data}
                loading={Boolean(eventsJobId) && events.isLoading}
                stopping={stopping}
                onStop={
                  active
                    ? () => {
                        cancel.mutate(active.id);
                      }
                    : undefined
                }
                onViewReport={
                  finishedWatched?.status === 'succeeded'
                    ? () => navigate(`/reports/${finishedWatched.id}`)
                    : undefined
                }
                onAnalyzeAgain={() => {
                  setWatchedJobId(null);
                }}
              />
            </div>
          ) : (
            <>
              <div className="border-b border-border px-5 py-3.5 lg:px-6">
                <h1 className="text-xl font-semibold tracking-tight">
                  {t('title')}
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
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
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 lg:px-6">
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

                  <QuoteStrip
                    variant="strip"
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

                  <Field>
                    <FieldTitle id="analyst-team-label" className="text-sm">
                      {t('analystTeam')}
                    </FieldTitle>
                    <FieldDescription>{t('analystTeamHint')}</FieldDescription>
                    <div
                      role="group"
                      aria-labelledby="analyst-team-label"
                      className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4"
                    >
                      {analystOptions.map((analyst) => {
                        const Icon = getAnalystIcon(analyst);
                        const selected = analysts.includes(analyst);
                        return (
                          <button
                            key={analyst}
                            type="button"
                            aria-pressed={selected}
                            title={t(`analysts.${analyst}.description`)}
                            onClick={() => {
                              setAnalysts((current) =>
                                selected
                                  ? current.filter((value) => value !== analyst)
                                  : [...current, analyst],
                              );
                            }}
                            className={cn(
                              'flex min-h-[4.25rem] flex-col items-start justify-center gap-1.5 border px-3.5 py-3 text-left transition-colors',
                              'border-border bg-background hover:border-foreground/20 hover:bg-muted/40',
                              'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
                              'active:translate-y-px',
                              selected &&
                                'border-primary/50 bg-primary/10 text-foreground shadow-[inset_2px_0_0_0_var(--primary)]',
                            )}
                          >
                            <span className="flex w-full items-center gap-2.5">
                              <Icon
                                className={cn(
                                  'size-5 shrink-0',
                                  selected
                                    ? 'text-primary'
                                    : 'text-muted-foreground',
                                )}
                              />
                              <span
                                className={cn(
                                  'min-w-0 truncate text-sm font-normal tracking-tight',
                                  selected && 'text-primary',
                                )}
                              >
                                {t(`analysts.${analyst}.title`)}
                              </span>
                            </span>
                            <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                              {t(`analysts.${analyst}.description`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <Field>
                    <FieldTitle className="text-sm">{t('models.label')}</FieldTitle>
                    <FieldDescription>{t('models.hint')}</FieldDescription>
                    {catalogModels.length === 0 ? (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {t('models.unavailable')}
                      </p>
                    ) : (
                      <FieldGroup className="mt-1.5 grid gap-4 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="quick-model">
                            {t('models.quick')}
                          </FieldLabel>
                          <Select
                            value={
                              quickModels.some(
                                (model) => model.id === quickModelId,
                              )
                                ? quickModelId
                                : undefined
                            }
                            onValueChange={(value) => {
                              setQuickModelId(value);
                              const providerId = catalogModels.find(
                                (model) => model.id === value,
                              )?.providerId;
                              const deep = catalogModels.find(
                                (model) => model.id === deepModelId,
                              );
                              if (
                                deep &&
                                providerId &&
                                deep.providerId !== providerId
                              ) {
                                const fallbackDeep = pickDefaultModelId(
                                  catalog,
                                  'deep',
                                  catalog?.defaults.defaultDeepModelId,
                                  providerId,
                                );
                                setDeepModelId(fallbackDeep ?? '');
                              }
                            }}
                          >
                            <SelectTrigger id="quick-model" className="w-full">
                              <SelectValue
                                placeholder={t('models.selectQuick')}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {quickModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {modelOption(model)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="deep-model">
                            {t('models.deep')}
                          </FieldLabel>
                          <Select
                            value={
                              deepModels.some(
                                (model) => model.id === deepModelId,
                              )
                                ? deepModelId
                                : undefined
                            }
                            onValueChange={setDeepModelId}
                          >
                            <SelectTrigger id="deep-model" className="w-full">
                              <SelectValue
                                placeholder={t('models.selectDeep')}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {deepModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {modelOption(model)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </FieldGroup>
                    )}
                  </Field>

                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
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
                        </SelectContent>
                      </Select>
                    </Field>
                  </FieldGroup>

                  {insufficientCredits ? (
                    <Alert>
                      <AlertTitle>{t('submit.creditsRequiredTitle')}</AlertTitle>
                      <AlertDescription>
                        <Link className="underline" to="/billing/usage">
                          {t('submit.insufficientCredits')}
                        </Link>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {create.isError && (
                    <Alert variant="destructive">
                      <AlertTitle>
                        {createErrorCode === 'INSUFFICIENT_CREDITS' ||
                        createErrorCode === 'SUBSCRIPTION_REQUIRED'
                          ? t('submit.creditsRequiredTitle')
                          : t('submit.errorTitle')}
                      </AlertTitle>
                      <AlertDescription>
                        {createErrorCode === 'INSUFFICIENT_CREDITS' ||
                        createErrorCode === 'SUBSCRIPTION_REQUIRED' ? (
                          <Link className="underline" to="/billing/subscription">
                            {t('submit.creditsRequiredBody')}
                          </Link>
                        ) : (
                          t('submit.errorBody')
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/20 px-5 py-3.5 lg:px-6">
                  <Button
                    type="submit"
                    size="lg"
                    className="min-w-[11rem]"
                    disabled={
                      !instrument ||
                      !analysts.length ||
                      !outputLanguage ||
                      !tradeDate ||
                      !modelsReady ||
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
                      : estimate.isLoading
                        ? t('submit.estimating')
                        : estimateData
                          ? t('submit.runWithEstimate', {
                              threshold:
                                estimateData.analysisBalanceThreshold,
                            })
                          : t('submit.run')}
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>

        <aside
          className={cn(
            'flex min-h-0 shrink-0 flex-col border-border bg-muted/15 transition-[width] duration-200',
            reportsRailOpen
              ? 'w-full border-t lg:w-[min(100%,22rem)] lg:border-t-0 xl:w-[24rem]'
              : 'w-full border-t lg:w-12 lg:border-t-0 lg:border-l',
          )}
        >
          {reportsRailOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RecentReports
                density="rail"
                jobs={jobs.data?.data ?? []}
                loading={jobs.isLoading}
                error={jobs.isError}
                identities={identities}
                onOpenReport={(id) => navigate(`/reports/${id}`)}
                onCollapseRail={() => {
                  setReportsRailOpen(false);
                  saveReportsRailOpen(false);
                }}
              />
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t('recent.expand')}
                  className="h-11 w-full justify-start gap-2 rounded-none px-4 text-muted-foreground hover:text-foreground lg:h-auto lg:flex-1 lg:flex-col lg:justify-start lg:gap-3 lg:px-0 lg:py-3"
                  onClick={() => {
                    setReportsRailOpen(true);
                    saveReportsRailOpen(true);
                  }}
                >
                  <PanelRightOpen className="size-4 shrink-0" />
                  <span className="text-sm font-medium lg:hidden">
                    {t('recent.title')}
                  </span>
                  <span
                    className="hidden font-label-caps tracking-wide lg:inline"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    {t('recent.title')}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{t('recent.expand')}</TooltipContent>
            </Tooltip>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
