import {
  Check,
  CircleDashed,
  LoaderCircle,
  ScrollText,
} from 'lucide-react';

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
import { Skeleton } from '../ui/skeleton';
import { getStageIcon, Workflow } from '../icons/research-icons';
import { cn } from '@/frontend/lib/utils';
import type { AnalysisEvent, AnalysisJob } from '../../lib/research';

const stageLabels: Record<string, string> = {
  market: 'Market',
  fundamentals: 'Fundamentals',
  news: 'News',
  social: 'Sentiment',
  research_debate: 'Debate',
  trader: 'Trader',
  risk_review: 'Risk',
  final_synthesis: 'Synthesis',
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
    : 'Waiting for a run';
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
  const CurrentStageIcon = getStageIcon(activeStage ?? 'market');

  return (
    <Card aria-labelledby="pipeline-title" className="@container/card">
      <CardHeader className="border-b">
        <CardDescription className="inline-flex items-center gap-1.5">
          <Workflow className="size-3.5" />
          Live pipeline
        </CardDescription>
        <CardTitle>
          <h2 id="pipeline-title">Agent activity</h2>
        </CardTitle>
        <CardAction>
          <Badge variant={jobStatusVariant(job?.status)} className="capitalize">
            {job?.status ?? 'Idle'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 pt-1 @4xl/card:grid-cols-[minmax(0,1.2fr)_minmax(220px,.8fr)]">
        <div className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CurrentStageIcon className="size-4" />
              </span>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Current stage
                </p>
                <p className="mt-1 text-base font-medium">
                  {displayStage(activeStage ?? job?.current_step)}
                </p>
              </div>
            </div>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {job?.progress_percent ?? 0}%
            </span>
          </div>
          <Progress value={job?.progress_percent ?? 0} className="h-1.5" />

          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stages.map((stage, index) => {
              const current =
                index === activeIndex && job?.status === 'running';
              const complete =
                activeIndex > index || job?.status === 'succeeded';
              const statusLabel = complete
                ? 'Complete'
                : current
                  ? 'In progress'
                  : 'Pending';
              const StageIcon = getStageIcon(stage);
              return (
                <li
                  key={stage}
                  aria-label={`${displayStage(stage)}: ${statusLabel}`}
                  data-stage-status={statusLabel}
                  className={cn(
                    'relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    complete && 'border-primary/30 bg-primary/5',
                    current &&
                      'border-primary bg-primary/10 shadow-[0_0_0_1px] shadow-primary/20',
                    !complete && !current && 'bg-muted/20',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      complete || current
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <StageIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium leading-snug text-foreground">
                      {displayStage(stage)}
                    </p>
                    <p className="mt-0.5 font-mono text-xs tracking-wider text-muted-foreground uppercase">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                  </div>
                  {complete ? (
                    <Check
                      className="size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  ) : current ? (
                    <LoaderCircle
                      className="size-3.5 shrink-0 animate-spin text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleDashed
                      className="size-3.5 shrink-0 text-muted-foreground/60"
                      aria-hidden="true"
                    />
                  )}
                  <span className="sr-only">{statusLabel}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="rounded-xl border bg-muted/25 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <ScrollText className="size-3.5 text-muted-foreground" />
              Event log
            </p>
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              Latest
            </span>
          </div>
          {loading ? (
            <div className="mt-4 flex flex-col gap-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : events?.length ? (
            <ScrollArea className="mt-4 h-56">
              <ol className="flex flex-col gap-3 border-l border-border/80 pl-3 pr-3">
                {events
                  .slice(-6)
                  .reverse()
                  .map((event, index) => (
                    <li
                      key={`${event.time ?? 'event'}-${index}`}
                      className="relative text-xs leading-5 text-muted-foreground"
                    >
                      <span className="absolute top-1.5 -left-[17px] size-1.5 rounded-full bg-primary/70" />
                      {event.message ?? 'Stage update received.'}
                    </li>
                  ))}
              </ol>
            </ScrollArea>
          ) : (
            <Empty className="min-h-48 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollText />
                </EmptyMedia>
                <EmptyTitle>No events yet</EmptyTitle>
                <EmptyDescription>
                  Stage updates appear here while the run is processing.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
