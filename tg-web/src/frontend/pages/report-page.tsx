import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { MarkdownReport } from '../components/report/markdown-report';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty';
import { Skeleton } from '../components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { getAnalystIcon, getStageIcon } from '../components/icons/research-icons';
import { getResearch } from '../lib/research';

function reportTabIcon(key: string) {
  if (key in { market: 1, fundamentals: 1, news: 1, social: 1 }) {
    return getAnalystIcon(key);
  }
  return getStageIcon(key);
}

export function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getResearch(id!),
    enabled: Boolean(id),
  });
  const job = detail.data?.data;
  const entries = Object.entries(job?.reports ?? {});

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col px-4 py-6 lg:px-6">
        <div className="flex w-full flex-1 flex-col">
          <div className="rounded-xl border bg-card/90 p-5 shadow-sm ring-1 ring-foreground/5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Back to research dashboard"
                    onClick={() => navigate('/')}
                  >
                    <ArrowLeft />
                  </Button>
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </span>
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                      Research report
                    </h1>
                    <p className="mt-1 font-mono text-sm font-medium tracking-wide text-foreground/90">
                      {job?.ticker
                        ? job.decision
                          ? `${job.ticker} · ${job.decision}`
                          : `Analysis for ${job.ticker}`
                        : 'Report content returned by the Core analysis job.'}
                    </p>
                  </div>
                </div>
              <div className="flex flex-wrap items-center gap-2">
                {job?.status ? (
                  <Badge variant="outline" className="capitalize">
                    {job.status}
                  </Badge>
                ) : null}
                {job?.cost_usd != null ? (
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    ${job.cost_usd.toFixed(4)}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          {!id ? (
            <Alert variant="destructive" className="mt-6">
              <AlertTitle>Unable to load report</AlertTitle>
              <AlertDescription>Report identifier is missing.</AlertDescription>
            </Alert>
          ) : detail.isLoading ? (
            <div className="flex flex-col gap-4 pt-6">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : detail.isError ? (
            <Alert variant="destructive" className="mt-6">
              <AlertTitle>Unable to load report</AlertTitle>
              <AlertDescription>Please try again.</AlertDescription>
            </Alert>
          ) : entries.length ? (
            <Tabs defaultValue={entries[0][0]} className="min-h-0 flex-1 pt-6">
              <TabsList
                variant="line"
                className="h-auto w-full flex-wrap justify-start"
              >
                {entries.map(([key]) => {
                  const Icon = reportTabIcon(key);
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="gap-1.5 capitalize"
                    >
                      <Icon className="size-3.5" />
                      {key.replaceAll('_', ' ')}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {entries.map(([key, value]) => (
                <TabsContent key={key} value={key} className="mt-6">
                  <article className="min-h-[60dvh] min-w-0 overflow-hidden rounded-xl border bg-card/80 px-5 py-6 md:px-8 md:py-8">
                    <div className="mx-auto max-w-3xl text-[15px]">
                      <MarkdownReport value={value} />
                    </div>
                  </article>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <Empty className="min-h-64 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No completed report</EmptyTitle>
                <EmptyDescription>
                  This job does not have report content yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}
