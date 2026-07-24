import { Check, Star } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  buildReportFlowStages,
  orderReportKeys,
  type ReportFlowStageId,
} from '@/frontend/lib/report-flow-order';
import { cn } from '@/frontend/lib/utils';

type ReportMindMapProps = {
  entries: string[];
  activeTab: string;
  onSelect: (key: string) => void;
  renderIcon: (key: string) => ReactNode;
  renderLabel: (key: string) => string;
  className?: string;
};

/** Distinct accent per derivation stage (badge + rail + active chip). */
const stageTone: Record<
  ReportFlowStageId,
  {
    rail: string;
    badge: string;
    badgeActive: string;
    label: string;
    labelActive: string;
    itemActive: string;
    itemDone: string;
  }
> = {
  evidence: {
    rail: 'border-sky-500/45',
    badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    badgeActive: 'bg-sky-600 text-white',
    label: 'text-sky-700/80 dark:text-sky-300/80',
    labelActive: 'text-sky-700 dark:text-sky-300',
    itemActive: 'bg-sky-600 text-white',
    itemDone: 'text-sky-900 dark:text-sky-100 hover:bg-sky-500/10',
  },
  debate: {
    rail: 'border-violet-500/45',
    badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    badgeActive: 'bg-violet-600 text-white',
    label: 'text-violet-700/80 dark:text-violet-300/80',
    labelActive: 'text-violet-700 dark:text-violet-300',
    itemActive: 'bg-violet-600 text-white',
    itemDone: 'text-violet-900 dark:text-violet-100 hover:bg-violet-500/10',
  },
  research: {
    rail: 'border-emerald-500/45',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    badgeActive: 'bg-emerald-600 text-white',
    label: 'text-emerald-700/80 dark:text-emerald-300/80',
    labelActive: 'text-emerald-700 dark:text-emerald-300',
    itemActive: 'bg-emerald-600 text-white',
    itemDone: 'text-emerald-900 dark:text-emerald-100 hover:bg-emerald-500/10',
  },
  trade: {
    rail: 'border-amber-500/45',
    badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    badgeActive: 'bg-amber-600 text-white',
    label: 'text-amber-800/80 dark:text-amber-300/80',
    labelActive: 'text-amber-800 dark:text-amber-300',
    itemActive: 'bg-amber-600 text-white',
    itemDone: 'text-amber-950 dark:text-amber-100 hover:bg-amber-500/10',
  },
  risk: {
    rail: 'border-rose-500/45',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    badgeActive: 'bg-rose-600 text-white',
    label: 'text-rose-700/80 dark:text-rose-300/80',
    labelActive: 'text-rose-700 dark:text-rose-300',
    itemActive: 'bg-rose-600 text-white',
    itemDone: 'text-rose-900 dark:text-rose-100 hover:bg-rose-500/10',
  },
  risk_judge: {
    rail: 'border-fuchsia-500/45',
    badge: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
    badgeActive: 'bg-fuchsia-600 text-white',
    label: 'text-fuchsia-700/80 dark:text-fuchsia-300/80',
    labelActive: 'text-fuchsia-700 dark:text-fuchsia-300',
    itemActive: 'bg-fuchsia-600 text-white',
    itemDone: 'text-fuchsia-900 dark:text-fuchsia-100 hover:bg-fuchsia-500/10',
  },
  final: {
    rail: 'border-orange-500/50',
    badge: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
    badgeActive: 'bg-orange-600 text-white',
    label: 'text-orange-800/80 dark:text-orange-300/80',
    labelActive: 'text-orange-800 dark:text-orange-300',
    itemActive: 'bg-orange-600 text-white',
    itemDone: 'text-orange-950 dark:text-orange-100 hover:bg-orange-500/10',
  },
  other: {
    rail: 'border-slate-500/40',
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    badgeActive: 'bg-slate-600 text-white',
    label: 'text-slate-600 dark:text-slate-300',
    labelActive: 'text-slate-800 dark:text-slate-200',
    itemActive: 'bg-slate-600 text-white',
    itemDone: 'text-slate-900 dark:text-slate-100 hover:bg-slate-500/10',
  },
};

function nodeState(
  key: string,
  activeTab: string,
  ordered: readonly string[],
) {
  const activeIndex = ordered.indexOf(activeTab);
  const index = ordered.indexOf(key);
  if (key === activeTab) return 'active' as const;
  if (activeIndex >= 0 && index >= 0 && index < activeIndex) {
    return 'done' as const;
  }
  return 'upcoming' as const;
}

/**
 * Report outline / table of contents with stage headers and indented chapters.
 */
export function ReportMindMap({
  entries,
  activeTab,
  onSelect,
  renderIcon,
  renderLabel,
  className,
}: ReportMindMapProps) {
  const { t } = useTranslation('report');
  const rootRef = useRef<HTMLElement>(null);
  const ordered = orderReportKeys(entries);
  const stages = buildReportFlowStages(ordered);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      '[data-report-tab][aria-selected="true"]',
    );
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <nav
      ref={rootRef}
      aria-label={t('flow.ariaLabel')}
      className={cn('flex flex-col gap-3', className)}
    >
      <header className="space-y-0.5 px-0.5">
        <p className="text-sm font-medium tracking-tight text-foreground">
          {t('flow.title')}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {t('flow.mindMapHint')}
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {stages.map((stage, stageIndex) => {
          const stageActive = stage.keys.includes(activeTab);
          const tone = stageTone[stage.id] ?? stageTone.other;
          return (
            <li key={stage.id} className="min-w-0" data-flow-stage={stage.id}>
              <div
                className={cn(
                  'mb-1 flex items-center gap-2 px-1',
                  stageActive ? tone.labelActive : tone.label,
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center text-[10px] font-semibold tabular-nums',
                    stageActive ? tone.badgeActive : tone.badge,
                  )}
                >
                  {stageIndex + 1}
                </span>
                <span className="truncate text-[11px] font-semibold tracking-[0.12em] uppercase">
                  {t(`flow.stages.${stage.id as ReportFlowStageId}`)}
                </span>
              </div>

              <ul
                role="tablist"
                aria-label={t(`flow.stages.${stage.id}`)}
                className={cn(
                  'ml-2.5 flex flex-col gap-0.5 border-l-2 pl-2',
                  tone.rail,
                )}
              >
                {stage.keys.map((key) => {
                  const state = nodeState(key, activeTab, ordered);
                  const isFinal = key === 'final_trade_decision';
                  return (
                    <li key={key} className="min-w-0">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={state === 'active'}
                        data-report-tab={key}
                        tabIndex={state === 'active' ? 0 : -1}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors',
                          state === 'active' && tone.itemActive,
                          state === 'done' && tone.itemDone,
                          state === 'upcoming' &&
                            'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          isFinal &&
                            state !== 'active' &&
                            'font-medium',
                        )}
                        onClick={() => onSelect(key)}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {state === 'done' ? (
                            <Check className="size-3.5" strokeWidth={2.25} />
                          ) : isFinal ? (
                            <Star className="size-3.5 fill-current" />
                          ) : (
                            renderIcon(key)
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {renderLabel(key)}
                        </span>
                        {state === 'done' ? (
                          <span className="sr-only">{t('flow.read')}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
