import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/empty';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { getResearch } from '../../lib/research';

function renderValue(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function ReportDialog({
  id,
  open,
  onOpenChange,
}: {
  id?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getResearch(id!),
    enabled: open && Boolean(id),
  });
  const entries = Object.entries(detail.data?.data.reports ?? {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-4xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <DialogTitle>
                Research report
                {detail.data?.data.ticker ? `: ${detail.data.data.ticker}` : ''}
              </DialogTitle>
              <DialogDescription>
                Report content returned by the Core analysis job.
              </DialogDescription>
            </div>
            {detail.data?.data.status && (
              <Badge variant="outline" className="capitalize">
                {detail.data.data.status}
              </Badge>
            )}
          </div>
        </DialogHeader>
        <div className="min-h-0 px-6 pb-6">
          {detail.isLoading ? (
            <div className="flex flex-col gap-4 pt-5">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : detail.isError ? (
            <Alert variant="destructive" className="mt-5">
              <AlertTitle>Unable to load report</AlertTitle>
              <AlertDescription>Please try again.</AlertDescription>
            </Alert>
          ) : entries.length ? (
            <Tabs defaultValue={entries[0][0]} className="pt-5">
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
                <TabsContent key={key} value={key} className="mt-4">
                  <ScrollArea className="h-[55dvh] rounded-lg border bg-muted/30">
                    <pre className="whitespace-pre-wrap break-words p-4 font-sans text-sm leading-6 text-foreground">
                      {renderValue(value)}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <Empty className="min-h-64">
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
      </DialogContent>
    </Dialog>
  );
}
