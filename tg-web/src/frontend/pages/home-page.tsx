import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  LineChart,
  Play,
  Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { RecentReports } from '../components/dashboard/recent-reports';
import {
  getAnalystIcon,
  Languages,
  Workflow,
} from '../components/icons/research-icons';
import { TickerSearch } from '../components/ticker-search';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
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
import { Skeleton } from '../components/ui/skeleton';
import { Spinner } from '../components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import {
  formatLocaleDateTimeValue,
  formatLocaleNumber,
} from '../lib/format-locale';
import { cn } from '../lib/utils';
import { formatDisplayTicker } from '@/shared/listing';
import {
  createResearch,
  getMarketIdentities,
  getMarketSnapshot,
  getResearchEvents,
  listResearch,
  type SelectedInstrument,
} from '../lib/research';

const analystOptions = ['market', 'fundamentals', 'news', 'social'];
const outputLanguageOptions = [
  ['English', 'English (default)'],
  ['Chinese', 'Chinese (中文)'],
  ['Japanese', 'Japanese (日本語)'],
  ['Korean', 'Korean (한국어)'],
  ['Hindi', 'Hindi (हिन्दी)'],
  ['Spanish', 'Spanish (Español)'],
  ['Portuguese', 'Portuguese (Português)'],
  ['French', 'French (Français)'],
  ['German', 'German (Deutsch)'],
  ['Arabic', 'Arabic (العربية)'],
  ['Russian', 'Russian (Русский)'],
] as const;

function marketMoveVariant(changePercent?: number) {
  if (changePercent === undefined || changePercent === 0) return 'outline';
  return changePercent > 0 ? 'up' : 'down';
}

export function HomePage() {
  const { t } = useTranslation(['home', 'common']);
  const [instrument, setInstrument] = useState<SelectedInstrument | null>(null);
  const [analysts, setAnalysts] = useState<string[]>(analystOptions);
  const [outputLanguage, setOutputLanguage] = useState('English');
  const [customLanguage, setCustomLanguage] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      toast.success(t('submit.toastSuccess'));
    },
  });
  const quote = snapshot.data?.data;
  const identitiesByTicker = Object.fromEntries(
    (identities.data?.data ?? []).map((identity) => [
      identity.ticker,
      identity,
    ]),
  );
  const selectedOutputLanguage =
    outputLanguage === 'custom' ? customLanguage.trim() : outputLanguage;
  const changePercent = quote?.change_percent;
  const isUp = changePercent !== undefined && changePercent > 0;
  const isDown = changePercent !== undefined && changePercent < 0;

  function submit() {
    if (instrument && analysts.length && selectedOutputLanguage) {
      create.mutate({
        ticker: instrument.display_ticker,
        tradeDate: new Date().toISOString().slice(0, 10),
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

  return (
    <AppShell>
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-5 py-4 md:gap-6 md:py-6">
            <section className="px-4 lg:px-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Workflow className="size-5" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                    {t('eyebrow')}
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                    {t('title')}
                  </h2>
                  <p className="max-w-xl text-sm text-muted-foreground">
                    {t('subtitle')}
                  </p>
                </div>
              </div>

              <Card className="overflow-hidden border-primary/10 bg-card/90 shadow-sm ring-1 ring-primary/10">
                <CardContent className="grid gap-0 p-0 @3xl/main:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
                  <form
                    className="flex flex-col gap-6 p-5 md:p-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit();
                    }}
                  >
                    <Field>
                      <FieldLabel
                        htmlFor="ticker"
                        className="inline-flex items-center gap-1.5"
                      >
                        <Search className="size-3.5 text-muted-foreground" />
                        {t('instrument.label')}
                      </FieldLabel>
                      <TickerSearch
                        id="ticker"
                        value={instrument}
                        onChange={setInstrument}
                      />
                      {!instrument ? (
                        <FieldDescription>
                          {t('instrument.hint')}
                        </FieldDescription>
                      ) : null}
                    </Field>

                    <FieldGroup className="grid gap-5 sm:grid-cols-[minmax(180px,0.9fr)_minmax(0,1.4fr)]">
                      <Field>
                        <FieldLabel
                          htmlFor="output-language"
                          className="inline-flex items-center gap-1.5"
                        >
                          <Languages className="size-3.5 text-muted-foreground" />
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
                            {outputLanguageOptions.map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">
                              {t('reportLanguage.custom')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field>
                        <FieldTitle
                          id="analyst-team-label"
                          className="inline-flex items-center gap-1.5"
                        >
                          {t('analystTeam')}
                        </FieldTitle>
                        <ToggleGroup
                          type="multiple"
                          variant="outline"
                          size="sm"
                          className="flex-wrap justify-start"
                          aria-labelledby="analyst-team-label"
                          value={analysts}
                          onValueChange={setAnalysts}
                        >
                          {analystOptions.map((analyst) => {
                            const Icon = getAnalystIcon(analyst);
                            return (
                              <ToggleGroupItem
                                key={analyst}
                                value={analyst}
                                className="gap-1.5"
                              >
                                <Icon className="size-3.5" />
                                {t(`common:analysts.${analyst}`, {
                                  defaultValue: analyst,
                                })}
                              </ToggleGroupItem>
                            );
                          })}
                        </ToggleGroup>
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
                          onChange={(event) =>
                            setCustomLanguage(event.target.value)
                          }
                          placeholder={t('reportLanguage.customPlaceholder')}
                          required
                        />
                      </Field>
                    )}

                    {create.isError && (
                      <Alert variant="destructive">
                        <AlertTitle>{t('submit.errorTitle')}</AlertTitle>
                        <AlertDescription>
                          {t('submit.errorBody')}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex justify-end border-t border-border/60 pt-4">
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={
                          !instrument ||
                          !analysts.length ||
                          !selectedOutputLanguage ||
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
                          : t('submit.run')}
                      </Button>
                    </div>
                  </form>

                  <aside className="flex flex-col border-t bg-muted/20 p-4 md:p-5 @3xl/main:border-t-0 @3xl/main:border-l">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                        <LineChart className="size-3.5 text-primary" />
                        {t('snapshot.title')}
                      </p>
                      <Badge variant="outline" className="gap-1.5 text-[10px]">
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            quote
                              ? isDown
                                ? 'bg-market-down'
                                : 'bg-market-up'
                              : 'bg-muted-foreground/50',
                          )}
                        />
                        {t('snapshot.live')}
                      </Badge>
                    </div>

                    {snapshot.isLoading ? (
                      <Skeleton className="min-h-44 w-full flex-1 rounded-xl" />
                    ) : quote ? (
                      <div
                        className={cn(
                          'flex flex-1 flex-col justify-between gap-5 rounded-xl border bg-card p-4 shadow-sm ring-1',
                          isUp &&
                            'border-market-up/25 ring-market-up/10 bg-linear-to-b from-market-up-bg/80 to-card',
                          isDown &&
                            'border-market-down/25 ring-market-down/10 bg-linear-to-b from-market-down-bg/80 to-card',
                          !isUp &&
                            !isDown &&
                            'border-border/80 ring-foreground/5',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar
                            size="lg"
                            className="size-12 rounded-xl after:rounded-xl"
                            data-logo-url={
                              quote.logo_url ??
                              identitiesByTicker[quote.ticker]?.logo_url
                            }
                          >
                            <AvatarImage
                              className="rounded-xl"
                              src={
                                quote.logo_url ??
                                identitiesByTicker[quote.ticker]?.logo_url
                              }
                              alt={t('snapshot.logoAlt', {
                                name: quote.display_name ?? quote.ticker,
                              })}
                            />
                            <AvatarFallback className="rounded-xl text-base font-semibold">
                              {quote.ticker.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <p className="truncate text-base font-semibold tracking-tight">
                              {quote.display_name ?? quote.ticker}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="secondary"
                                className="rounded-md px-1.5 font-mono text-[11px] tracking-wider"
                              >
                                {quote.display_ticker ??
                                  identitiesByTicker[quote.ticker]
                                    ?.display_ticker ??
                                  formatDisplayTicker(quote.ticker)}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                              {t('snapshot.lastPrice')}
                            </p>
                            <p
                              className={cn(
                                'mt-1 flex items-baseline gap-1.5 font-mono leading-none font-semibold tracking-tight tabular-nums',
                                isUp && 'text-market-up',
                                isDown && 'text-market-down',
                              )}
                            >
                              <span className="text-4xl">
                                {quote.last_price !== undefined
                                  ? formatLocaleNumber(quote.last_price)
                                  : null}
                              </span>
                              {quote.currency ? (
                                <span className="text-sm font-medium text-muted-foreground">
                                  {quote.currency}
                                </span>
                              ) : null}
                            </p>
                          </div>

                          <Badge
                            variant={marketMoveVariant(changePercent)}
                            className="h-8 gap-1 rounded-lg px-2.5 text-sm font-semibold tabular-nums"
                          >
                            {isUp ? (
                              <ArrowUpRight className="size-4" />
                            ) : null}
                            {isDown ? (
                              <ArrowDownRight className="size-4" />
                            ) : null}
                            {changePercent === undefined
                              ? t('snapshot.changeUnavailable')
                              : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
                          </Badge>
                        </div>

                        <p className="border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                          {quote.source ?? 'TradingView'}
                          {quote.as_of
                            ? ` · ${formatLocaleDateTimeValue(quote.as_of)}`
                            : ''}
                        </p>
                      </div>
                    ) : (
                      <div className="flex min-h-44 flex-1 flex-col items-start justify-center gap-2 rounded-xl border border-dashed bg-card/60 px-4 py-6">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Search className="size-4" />
                        </span>
                        <p className="text-sm font-medium">
                          {t('snapshot.emptyTitle')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('snapshot.emptyBody')}
                        </p>
                      </div>
                    )}
                  </aside>
                </CardContent>
              </Card>
            </section>

            <section className="px-4 lg:px-6">
              <PipelinePanel
                job={active}
                events={events.data?.data}
                loading={events.isLoading}
              />
            </section>

            <section id="reports" className="scroll-mt-6 px-4 lg:px-6">
              <RecentReports
                jobs={jobs.data?.data ?? []}
                loading={jobs.isLoading}
                error={jobs.isError}
                identities={identitiesByTicker}
                onOpenReport={(id) => navigate(`/reports/${id}`)}
              />
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
