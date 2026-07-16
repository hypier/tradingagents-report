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
import { ScrollArea, ScrollBar } from '../components/ui/scroll-area';
import { Skeleton } from '../components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { getResearch } from '../lib/research';

export function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getResearch(id!),
    enabled: Boolean(id),
  });
  const entries = Object.entries(detail.data?.data.reports ?? {});

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col px-4 py-6 lg:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
            <div className="flex items-start gap-3">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back to research dashboard"
                onClick={() => navigate('/')}
              >
                <ArrowLeft />
              </Button>
              <div>
                <h1 className="text-xl font-semibold">Research report</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {detail.data?.data.ticker
                    ? `Analysis for ${detail.data.data.ticker}`
                    : 'Report content returned by the Core analysis job.'}
                </p>
              </div>
            </div>
            {detail.data?.data.status && (
              <Badge variant="outline" className="capitalize">
                {detail.data.data.status}
              </Badge>
            )}
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
              <ScrollArea className="w-full">
                <TabsList variant="line">
                  {entries.map(([key]) => (
                    <TabsTrigger key={key} value={key} className="capitalize">
                      {key.replaceAll('_', ' ')}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
              {entries.map(([key, value]) => (
                <TabsContent key={key} value={key} className="mt-6">
                  <article className="min-h-[60dvh] overflow-x-auto pb-12 text-sm">
                    <MarkdownReport value={value} />
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
