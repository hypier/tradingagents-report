import {
  Activity,
  CalendarDays,
  CandlestickChart,
  CircleDollarSign,
  Clock3,
  Crosshair,
  Eye,
  Gauge,
  Landmark,
  Layers3,
  MessageCircleMore,
  Newspaper,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/frontend/components/ui/badge';
import { Separator } from '@/frontend/components/ui/separator';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '@/frontend/lib/format-decision';
import type {
  AnalysisDecision,
  DecisionPriceRange,
  DecisionSectionSignal,
  DecisionStance,
} from '@/frontend/lib/research';
import { cn } from '@/frontend/lib/utils';

export function hasDecisionBrief(
  decision: string | AnalysisDecision | null | undefined,
): decision is AnalysisDecision {
  return (
    typeof decision === 'object' &&
    decision !== null &&
    typeof decision.headline === 'string' &&
    Boolean(decision.headline.trim())
  );
}

type MetricTone = 'reference' | 'entry' | 'stop' | 'target';

const metricToneClasses: Record<
  MetricTone,
  { card: string; icon: string; value: string }
> = {
  reference: {
    card: 'border-border bg-card',
    icon: 'bg-muted text-muted-foreground',
    value: 'text-foreground',
  },
  entry: {
    card: 'border-sky-500/25 bg-sky-500/8 dark:bg-sky-400/8',
    icon: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    value: 'text-sky-800 dark:text-sky-200',
  },
  stop: {
    card: 'border-rose-500/25 bg-rose-500/8 dark:bg-rose-400/8',
    icon: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    value: 'text-rose-800 dark:text-rose-200',
  },
  target: {
    card: 'border-emerald-500/25 bg-emerald-500/8 dark:bg-emerald-400/8',
    icon: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    value: 'text-emerald-800 dark:text-emerald-200',
  },
};

const signalIcons: Record<
  keyof NonNullable<AnalysisDecision['section_stances']>,
  LucideIcon
> = {
  market: CandlestickChart,
  sentiment: MessageCircleMore,
  news: Newspaper,
  fundamentals: Landmark,
};

const signalToneClasses: Record<
  DecisionStance,
  { lane: string; icon: string }
> = {
  bullish: {
    lane: 'border-emerald-500/35 bg-emerald-500/5',
    icon: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  bearish: {
    lane: 'border-rose-500/35 bg-rose-500/5',
    icon: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
  neutral: {
    lane: 'border-border bg-card',
    icon: 'bg-muted text-muted-foreground',
  },
  unavailable: {
    lane: 'border-dashed border-border bg-muted/30',
    icon: 'bg-muted text-muted-foreground',
  },
};

export function DecisionBriefCard({
  decision,
}: {
  decision: AnalysisDecision;
}) {
  const { t, i18n } = useTranslation(['report', 'common']);
  if (!hasDecisionBrief(decision)) return null;

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const currency = decision.currency?.trim() || null;
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const formatPrice = (value: number) =>
    `${formatNumber(value)}${currency ? ` ${currency}` : ''}`;
  const formatRange = (range: DecisionPriceRange) =>
    `${formatNumber(range.low)}–${formatNumber(range.high)}${currency ? ` ${currency}` : ''}`;
  const rating = formatDecisionLabel(decision, (key, options) =>
    t(`common:${key}`, options),
  );
  const ratingVariant = decisionBadgeVariant(decision);
  const signals = decision.section_stances
    ? (Object.entries(decision.section_stances) as [
        keyof typeof decision.section_stances,
        DecisionSectionSignal,
      ][])
    : [];

  const priceItems = [
    typeof decision.as_of_price === 'number'
      ? {
          label: t('decisionBrief.referencePrice'),
          value: formatPrice(decision.as_of_price),
          icon: CircleDollarSign,
          tone: 'reference' as const,
        }
      : null,
    decision.entry_zone
      ? {
          label: t('decisionBrief.entryZone'),
          value: formatRange(decision.entry_zone),
          icon: Activity,
          tone: 'entry' as const,
        }
      : null,
    decision.add_levels?.length
      ? {
          label: t('decisionBrief.addLevels'),
          value: decision.add_levels.map(formatRange).join(' / '),
          icon: Layers3,
          tone: 'entry' as const,
        }
      : null,
    typeof decision.stop_or_reduce === 'number'
      ? {
          label: t('decisionBrief.stopOrReduce'),
          value: formatPrice(decision.stop_or_reduce),
          icon: ShieldAlert,
          tone: 'stop' as const,
        }
      : null,
    typeof decision.target_price === 'number'
      ? {
          label: t('decisionBrief.targetPrice'),
          value: formatPrice(decision.target_price),
          icon: Target,
          tone: 'target' as const,
        }
      : null,
  ].filter(
    (
      item,
    ): item is {
      label: string;
      value: string;
      icon: LucideIcon;
      tone: MetricTone;
    } => item !== null,
  );

  return (
    <section
      aria-labelledby="decision-brief-title"
      className="flex flex-col gap-6 border-y border-border/80 bg-background py-6"
    >
      <div
        className={cn(
          'flex flex-col gap-4 border-l-[3px] pl-4 sm:flex-row sm:items-start sm:justify-between',
          ratingVariant === 'up' && 'border-emerald-500',
          ratingVariant === 'down' && 'border-rose-500',
          ratingVariant === 'outline' && 'border-foreground/35',
        )}
      >
        <div className="min-w-0 max-w-5xl">
          <h2
            id="decision-brief-title"
            className="font-heading text-xl leading-snug font-semibold text-foreground md:text-2xl"
          >
            {decision.headline}
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {decision.conviction ? (
              <DecisionMeta icon={Gauge}>
                {t('decisionBrief.conviction')} ·{' '}
                {t(`decisionBrief.levels.${decision.conviction}`)}
              </DecisionMeta>
            ) : null}
            {decision.as_of_date ? (
              <DecisionMeta icon={CalendarDays}>
                {t('decisionBrief.asOf')} · {decision.as_of_date}
              </DecisionMeta>
            ) : null}
            {decision.time_horizon ? (
              <DecisionMeta icon={Clock3}>
                {t('decisionBrief.timeHorizon')} · {decision.time_horizon}
              </DecisionMeta>
            ) : null}
          </div>
        </div>
        {rating ? (
          <Badge
            variant={ratingVariant}
            className="h-8 px-3 text-sm font-semibold"
          >
            {rating}
          </Badge>
        ) : null}
      </div>

      {priceItems.length ? (
        <div
          role="list"
          aria-label={t('decisionBrief.pricePlan')}
          className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]"
        >
          {priceItems.map((item) => (
            <PriceMetric key={item.label} {...item} />
          ))}
        </div>
      ) : null}

      {decision.position_guidance ? (
        <div className="border-l-2 border-sky-500/60 bg-sky-500/5 px-4 py-3">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">
            {t('decisionBrief.positionGuidance')}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {decision.position_guidance}
          </p>
        </div>
      ) : null}

      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        <InsightBlock
          icon={TrendingUp}
          label={t('decisionBrief.bullCase')}
          value={decision.bull_case}
          tone="bull"
        />
        <InsightBlock
          icon={TrendingDown}
          label={t('decisionBrief.bearCase')}
          value={decision.bear_case}
          tone="bear"
        />
        <InsightBlock
          icon={ShieldAlert}
          label={t('decisionBrief.keyRisk')}
          value={decision.key_risk}
          tone="risk"
        />
        <InsightBlock
          icon={Target}
          label={t('decisionBrief.invalidation')}
          value={decision.invalidation}
          tone="neutral"
        />
      </div>

      {decision.what_to_watch?.length ? (
        <div className="border-t border-border pt-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Eye
              className="size-4 text-sky-600 dark:text-sky-300"
              aria-hidden="true"
            />
            <h3>{t('decisionBrief.whatToWatch')}</h3>
          </div>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {decision.what_to_watch.map((item) => (
              <li
                key={item}
                className="border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {signals.length ? (
        <>
          <Separator />
          <div
            role="list"
            aria-label={t('decisionBrief.signalSummary')}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {signals.map(([key, signal]) => (
              <SignalLane key={key} signalKey={key} signal={signal} />
            ))}
          </div>
        </>
      ) : null}

      {decision.conflict_note ? (
        <div className="flex gap-3 border-t border-border pt-4 text-sm leading-relaxed">
          <Crosshair
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">
              {t('decisionBrief.conflict')}:
            </span>{' '}
            {decision.conflict_note}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function DecisionMeta({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function PriceMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: MetricTone;
}) {
  const styles = metricToneClasses[tone];
  return (
    <div
      role="listitem"
      className={cn(
        'flex min-h-28 min-w-0 flex-col justify-between border p-4 shadow-xs',
        styles.card,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-snug font-semibold text-muted-foreground">
          {label}
        </p>
        <span
          className={cn('grid size-7 shrink-0 place-items-center', styles.icon)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
      <p
        className={cn(
          'mt-4 break-words font-mono text-lg leading-snug font-semibold tabular-nums',
          styles.value,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InsightBlock({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
  tone: 'bull' | 'bear' | 'risk' | 'neutral';
}) {
  if (!value) return null;
  return (
    <div
      className={cn(
        'border-t-2 pt-4',
        tone === 'bull' && 'border-emerald-500/55',
        tone === 'bear' && 'border-rose-500/55',
        tone === 'risk' && 'border-amber-500/55',
        tone === 'neutral' && 'border-border',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'size-4',
            tone === 'bull' && 'text-emerald-600 dark:text-emerald-300',
            tone === 'bear' && 'text-rose-600 dark:text-rose-300',
            tone === 'risk' && 'text-amber-600 dark:text-amber-300',
            tone === 'neutral' && 'text-muted-foreground',
          )}
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-foreground">{label}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

function SignalLane({
  signalKey,
  signal,
}: {
  signalKey: keyof NonNullable<AnalysisDecision['section_stances']>;
  signal: DecisionSectionSignal;
}) {
  const { t } = useTranslation('report');
  const Icon = signalIcons[signalKey];
  const styles = signalToneClasses[signal.stance];
  return (
    <div
      role="listitem"
      className={cn('min-w-0 border-t-2 px-4 py-3', styles.lane)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center',
              styles.icon,
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <p className="truncate text-sm font-semibold text-foreground">
            {t(`decisionBrief.sections.${signalKey}`)}
          </p>
        </div>
        <Badge variant={stanceVariant(signal.stance)}>
          {t(`decisionBrief.stances.${signal.stance}`)}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {signal.note}
      </p>
    </div>
  );
}

function stanceVariant(
  stance: DecisionStance,
): 'up' | 'down' | 'secondary' | 'outline' {
  if (stance === 'bullish') return 'up';
  if (stance === 'bearish') return 'down';
  if (stance === 'neutral') return 'secondary';
  return 'outline';
}
