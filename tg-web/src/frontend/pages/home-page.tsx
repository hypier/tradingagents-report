import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { RecentReports } from '../components/dashboard/recent-reports';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  Field,
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
  createResearch,
  getMarketIdentities,
  getMarketSnapshot,
  getResearchEvents,
  listResearch,
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
  return changePercent > 0 ? 'default' : 'destructive';
}

export function HomePage() {
  const [ticker, setTicker] = useState('');
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
      ...(ticker.trim() ? [ticker.trim()] : []),
    ]),
  ];
  const identities = useQuery({
    queryKey: ['market-identities', assetTickers],
    queryFn: () => getMarketIdentities(assetTickers),
    enabled: assetTickers.length > 0,
  });
  const snapshot = useQuery({
    queryKey: ['snapshot', ticker],
    queryFn: () => getMarketSnapshot(ticker),
    enabled: Boolean(ticker),
  });
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createResearch>[0]) =>
      createResearch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      toast.success('Research run submitted.');
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

  function submit() {
    if (ticker && analysts.length && selectedOutputLanguage) {
      create.mutate({
        ticker,
        tradeDate: new Date().toISOString().slice(0, 10),
        analysts,
        outputLanguage: selectedOutputLanguage,
      });
    }
  }

  return (
    <AppShell>
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6">
              <Card>
                <CardHeader>
                  <CardTitle>Launch research</CardTitle>
                  <CardDescription>
                    Configure a sequential multi-agent research run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <form
                    className="flex flex-col gap-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit();
                    }}
                  >
                    <FieldGroup className="grid gap-4 @3xl/main:grid-cols-[minmax(180px,1fr)_minmax(180px,0.6fr)_auto]">
                      <Field>
                        <FieldLabel htmlFor="ticker">Ticker</FieldLabel>
                        <Input
                          id="ticker"
                          value={ticker}
                          onChange={(event) =>
                            setTicker(event.target.value.toUpperCase())
                          }
                          placeholder="AAPL"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="output-language">
                          Report language
                        </FieldLabel>
                        <Select
                          value={outputLanguage}
                          onValueChange={setOutputLanguage}
                        >
                          <SelectTrigger
                            id="output-language"
                            aria-label="Report language"
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
                              Custom language
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className="justify-end">
                        <Button
                          type="submit"
                          aria-label="Run analysis"
                          disabled={
                            !ticker ||
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
                            ? 'Submitting...'
                            : 'Run analysis (1 credit)'}
                        </Button>
                      </Field>
                    </FieldGroup>
                    {outputLanguage === 'custom' && (
                      <Field>
                        <FieldLabel htmlFor="custom-language">
                          Custom language
                        </FieldLabel>
                        <Input
                          id="custom-language"
                          value={customLanguage}
                          onChange={(event) =>
                            setCustomLanguage(event.target.value)
                          }
                          placeholder="Turkish"
                          required
                        />
                      </Field>
                    )}
                    <Field>
                      <FieldTitle id="analyst-team-label">
                        Analyst team
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
                        {analystOptions.map((analyst) => (
                          <ToggleGroupItem key={analyst} value={analyst}>
                            {analyst === 'social' ? 'Sentiment' : analyst}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </Field>
                    {create.isError && (
                      <Alert variant="destructive">
                        <AlertTitle>
                          {createErrorCode === 'CONSENT_REQUIRED'
                            ? 'Legal consent required'
                            : createErrorCode === 'INSUFFICIENT_CREDITS' ||
                                createErrorCode === 'SUBSCRIPTION_REQUIRED'
                              ? 'Subscription or credits required'
                              : 'Unable to submit this run'}
                        </AlertTitle>
                        <AlertDescription>
                          {createErrorCode === 'CONSENT_REQUIRED' ? (
                            <Link className="underline" to="/account">
                              Review account consent
                            </Link>
                          ) : createErrorCode === 'INSUFFICIENT_CREDITS' ||
                            createErrorCode === 'SUBSCRIPTION_REQUIRED' ? (
                            <Link className="underline" to="/billing">
                              Review subscription and usage
                            </Link>
                          ) : (
                            'Check the service connection and retry.'
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 px-4 @5xl/main:grid-cols-[minmax(0,1fr)_320px] lg:px-6">
              <PipelinePanel
                job={active}
                events={events.data?.data}
                loading={events.isLoading}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Market snapshot</CardTitle>
                  <CardDescription>Read-only quote</CardDescription>
                  <CardAction>
                    <Badge>Latest quote</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {snapshot.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : quote ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          data-logo-url={
                            quote.logo_url ??
                            identitiesByTicker[quote.ticker]?.logo_url
                          }
                        >
                          <AvatarImage
                            src={
                              quote.logo_url ??
                              identitiesByTicker[quote.ticker]?.logo_url
                            }
                            alt={`${quote.display_name ?? quote.ticker} logo`}
                          />
                          <AvatarFallback>
                            {quote.ticker.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">
                            {quote.display_name ?? quote.ticker}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {quote.ticker}
                          </p>
                        </div>
                      </div>
                      <p className="text-3xl font-semibold tabular-nums">
                        {quote.currency ?? ''}{' '}
                        {quote.last_price?.toLocaleString()}
                      </p>
                      <Badge variant={marketMoveVariant(quote.change_percent)}>
                        {quote.change_percent === undefined
                          ? 'Change unavailable'
                          : `${quote.change_percent >= 0 ? '+' : ''}${quote.change_percent.toFixed(2)}%`}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {quote.source ?? 'TradingView'}{' '}
                        {quote.as_of
                          ? `as of ${new Date(quote.as_of).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Enter a ticker to retrieve the latest available snapshot.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="px-4 lg:px-6">
              <RecentReports
                jobs={jobs.data?.data ?? []}
                loading={jobs.isLoading}
                error={jobs.isError}
                identities={identitiesByTicker}
                onOpenReport={(id) => navigate(`/reports/${id}`)}
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
