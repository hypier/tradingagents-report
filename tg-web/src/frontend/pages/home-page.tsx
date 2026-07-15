import { useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { toast } from 'sonner';

import { AppSidebar } from '../components/app-sidebar';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { RecentReports } from '../components/dashboard/recent-reports';
import { ReportDialog } from '../components/dashboard/report-dialog';
import { SiteHeader } from '../components/site-header';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Field, FieldGroup, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar';
import { Skeleton } from '../components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import {
  createResearch,
  getMarketSnapshot,
  getResearchEvents,
  listResearch,
} from '../lib/research';

const analystOptions = ['market', 'fundamentals', 'news', 'social'];

export function HomePage() {
  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState('US');
  const [depth, setDepth] = useState('standard');
  const [analysts, setAnalysts] = useState<string[]>(analystOptions);
  const [reportId, setReportId] = useState<string>();
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
  const quote = snapshot.data?.data;

  function submit() {
    if (ticker && analysts.length) {
      create.mutate({
        ticker,
        tradeDate: new Date().toISOString().slice(0, 10),
        analysts,
      });
    }
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 64)',
          '--header-height': 'calc(var(--spacing) * 14)',
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
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
                    <FieldGroup className="grid gap-4 @3xl/main:grid-cols-[minmax(180px,1.25fr)_minmax(150px,.75fr)_minmax(150px,.75fr)_auto]">
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
                        <FieldLabel>Market</FieldLabel>
                        <Select value={market} onValueChange={setMarket}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="US">United States</SelectItem>
                              <SelectItem value="HK">Hong Kong</SelectItem>
                              <SelectItem value="CN">China</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>Research depth</FieldLabel>
                        <Select value={depth} onValueChange={setDepth}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="focused">Focused</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="extended">Extended</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field className="justify-end">
                        <Button
                          disabled={
                            !ticker || !analysts.length || create.isPending
                          }
                          onClick={submit}
                        >
                          <Play data-icon="inline-start" />
                          {create.isPending ? 'Submitting...' : 'Run analysis'}
                        </Button>
                      </Field>
                    </FieldGroup>
                    <Field>
                      <FieldLabel>Analyst team</FieldLabel>
                      <ToggleGroup
                        type="multiple"
                        variant="outline"
                        size="sm"
                        className="flex-wrap justify-start"
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
                        <AlertTitle>Unable to submit this run</AlertTitle>
                        <AlertDescription>
                          Check the service connection and retry.
                        </AlertDescription>
                      </Alert>
                    )}
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
                  </CardHeader>
                  <CardContent>
                    {snapshot.isLoading ? (
                      <Skeleton className="h-24 w-full" />
                    ) : quote ? (
                      <div className="flex flex-col gap-3">
                        <p className="font-mono font-semibold">
                          {quote.ticker}
                        </p>
                        <p className="text-3xl font-semibold tabular-nums">
                          {quote.currency ?? ''}{' '}
                          {quote.last_price?.toLocaleString()}
                        </p>
                        <Badge variant="secondary">
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
                        Enter a ticker to retrieve the latest available
                        snapshot.
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
                  onOpenReport={setReportId}
                />
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
      <ReportDialog
        id={reportId}
        open={Boolean(reportId)}
        onOpenChange={(open) => !open && setReportId(undefined)}
      />
    </SidebarProvider>
  );
}
