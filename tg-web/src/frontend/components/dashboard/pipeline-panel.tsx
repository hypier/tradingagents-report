import { Clock3 } from 'lucide-react';

import { Badge } from '../ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/empty';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';
import type { AnalysisEvent, AnalysisJob } from '../../lib/research';

const stageLabels: Record<string, string> = {
  market: 'Market analyst',
  fundamentals: 'Fundamentals analyst',
  news: 'News analyst',
  social: 'Sentiment analyst',
  research_debate: 'Research debate',
  trader: 'Trader assessment',
  risk_review: 'Risk review',
  final_synthesis: 'Final synthesis',
};
const analystStages = ['market', 'fundamentals', 'news', 'social'];
const finalStages = [
  'research_debate',
  'trader',
  'risk_review',
  'final_synthesis',
];

function displayStage(value?: string | null) {
  return value
    ? (stageLabels[value] ?? value.replaceAll('_', ' '))
    : 'Awaiting a research run';
}

function stageFromProgressMessage(value?: string | null) {
  const message = value?.toLowerCase() ?? '';
  if (message.includes('market analyst')) return 'market';
  if (message.includes('fundamentals analyst')) return 'fundamentals';
  if (message.includes('news analyst')) return 'news';
  if (message.includes('sentiment analyst')) return 'social';
  if (message.includes('research debate')) return 'research_debate';
  if (message.includes('trader')) return 'trader';
  if (message.includes('risk debate')) return 'risk_review';
  if (message.includes('portfolio manager')) return 'final_synthesis';
  return undefined;
}

function jobStatusVariant(status?: AnalysisJob['status']) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'succeeded') return 'default';
  return 'secondary';
}

export function PipelinePanel({
  job,
  events,
  loading,
}: {
  job?: AnalysisJob;
  events?: AnalysisEvent[];
  loading?: boolean;
}) {
  const stages = [...(job?.analysts ?? analystStages), ...finalStages];
  const activeStage = stageFromProgressMessage(job?.current_step);
  const activeIndex = activeStage ? stages.indexOf(activeStage) : -1;

  return (
    <Card aria-labelledby="pipeline-title">
      <CardHeader>
        <CardDescription>Live research</CardDescription>
        <CardTitle>
          <h2 id="pipeline-title">Sequential agent activity</h2>
        </CardTitle>
        <CardAction>
          <Badge variant={jobStatusVariant(job?.status)} className="capitalize">
            {job?.status ?? 'Idle'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 @4xl/card:grid-cols-[minmax(0,1fr)_minmax(220px,.75fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {displayStage(job?.current_step)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {job?.progress_percent ?? 0}%
            </span>
          </div>
          <Progress value={job?.progress_percent ?? 0} />
          <div className="rounded-lg border">
            {stages.map((stage, index) => {
              const current =
                index === activeIndex && job?.status === 'running';
              const complete =
                activeIndex > index || job?.status === 'succeeded';
              return (
                <div key={stage}>
                  {index > 0 && <Separator />}
                  <div className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="flex-1">{displayStage(stage)}</span>
                    <Badge
                      variant={
                        current ? 'info' : complete ? 'default' : 'outline'
                      }
                    >
                      {complete
                        ? 'Complete'
                        : current
                          ? 'In progress'
                          : 'Pending'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock3 />
            Latest evidence
          </div>
          {loading ? (
            <div className="mt-4 flex flex-col gap-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : events?.length ? (
            <ScrollArea className="mt-4 h-56">
              <ol className="flex flex-col gap-3 pr-4 text-xs leading-5 text-muted-foreground">
                {events
                  .slice(-6)
                  .reverse()
                  .map((event, index) => (
                    <li key={`${event.time ?? 'event'}-${index}`}>
                      {event.message ?? 'Stage update received.'}
                    </li>
                  ))}
              </ol>
            </ScrollArea>
          ) : (
            <Empty className="min-h-48 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock3 />
                </EmptyMedia>
                <EmptyTitle>No evidence yet</EmptyTitle>
                <EmptyDescription>
                  Stage evidence will appear here while Core processes the run.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
