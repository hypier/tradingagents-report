import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { MarkdownReport } from '../components/report/markdown-report';
import {
  ReportReadingToolbar,
  reportDeskThemes,
  reportPaperThemes,
  type ReportDeskThemeId,
  type ReportPaperThemeId,
} from '../components/report/report-reading-toolbar';
import { ReportTabsNav } from '../components/report/report-tabs-nav';
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
import { Tabs, TabsContent } from '../components/ui/tabs';
import { getAnalystIcon, getStageIcon } from '../components/icons/research-icons';
import {
  loadReportReadingPreferences,
  saveReportReadingPreferences,
} from '../lib/report-reading-preferences';
import { getResearch } from '../lib/research';
import { cn } from '../lib/utils';

const reportFontSteps = [0.92, 1.0, 1.08, 1.18, 1.3] as const;
const defaultFontStep = 1;
const defaultReadingPreferences = {
  fontStep: defaultFontStep,
  paperTheme: 'ivory' as const,
  deskTheme: 'slate' as const,
};

function formatFontSize(step: number) {
  const clamped = Math.min(
    reportFontSteps.length - 1,
    Math.max(0, step),
  );
  return `${(1.05 * reportFontSteps[clamped]!).toFixed(2)}rem`;
}

const reportTabLabels: Record<string, string> = {
  market_report: 'Market',
  sentiment_report: 'Sentiment',
  news_report: 'News',
  fundamentals_report: 'Fundamentals',
  research_team_decision: 'Research Decision',
  trader_investment_plan: 'Trader Plan',
  final_trade_decision: 'Final Decision',
  bull_researcher: 'Bull',
  bear_researcher: 'Bear',
  risk_management_decision: 'Risk Judge',
  risky_analyst: 'Risky',
  safe_analyst: 'Safe',
  neutral_analyst: 'Neutral',
};

function reportTabLabel(key: string) {
  return (
    reportTabLabels[key] ??
    key
      .replace(/_report$/u, '')
      .replaceAll('_', ' ')
      .replace(/\b\w/gu, (char) => char.toUpperCase())
  );
}

function reportTabIcon(key: string) {
  const normalized = key.replace(/_report$/u, '').replace(/_history$/u, '');
  if (
    normalized in {
      market: 1,
      fundamentals: 1,
      news: 1,
      social: 1,
      sentiment: 1,
    }
  ) {
    return getAnalystIcon(
      normalized === 'sentiment' ? 'social' : normalized,
    );
  }
  if (key.includes('bull') || key.includes('bear') || key.includes('research')) {
    return getStageIcon('research_debate');
  }
  if (key.includes('trader')) return getStageIcon('trader');
  if (
    key.includes('risk') ||
    key.includes('risky') ||
    key.includes('safe') ||
    key.includes('neutral') ||
    key.includes('judge')
  ) {
    return getStageIcon('risk_review');
  }
  if (key.includes('final')) return getStageIcon('final_synthesis');
  return getStageIcon(key);
}

function formatDecision(decision: unknown): string | null {
  if (decision == null) return null;
  if (typeof decision === 'string') {
    const trimmed = decision.trim();
    return trimmed || null;
  }
  if (typeof decision === 'object') {
    const action = (decision as { action?: unknown }).action;
    if (typeof action === 'string' && action.trim()) return action.trim();
  }
  return null;
}

function getReportScrollParent() {
  return document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]');
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
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
  const tabKeys = entries.map(([key]) => key);
  const tabKeysKey = tabKeys.join('\0');
  const [activeTab, setActiveTab] = useState(tabKeys[0] ?? '');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [fontStep, setFontStep] = useState(defaultReadingPreferences.fontStep);
  const [paperTheme, setPaperTheme] = useState<ReportPaperThemeId>(
    defaultReadingPreferences.paperTheme,
  );
  const [deskTheme, setDeskTheme] = useState<ReportDeskThemeId>(
    defaultReadingPreferences.deskTheme,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const paperThemeConfig =
    reportPaperThemes.find((theme) => theme.id === paperTheme) ??
    reportPaperThemes[0];
  const paperClassName = paperThemeConfig.className;
  const deskClassName =
    reportDeskThemes.find((theme) => theme.id === deskTheme)?.className ??
    reportDeskThemes[0].className;
  const decisionLabel = formatDecision(job?.decision);
  const subtitle = job?.ticker
    ? decisionLabel
      ? `${job.ticker} · ${decisionLabel}`
      : `Analysis for ${job.ticker}`
    : 'Report content returned by the Core analysis job.';

  useEffect(() => {
    const preferences = loadReportReadingPreferences({
      ...defaultReadingPreferences,
      fontStep: Math.min(
        reportFontSteps.length - 1,
        Math.max(0, defaultReadingPreferences.fontStep),
      ),
    });
    setFontStep(
      Math.min(
        reportFontSteps.length - 1,
        Math.max(0, preferences.fontStep),
      ),
    );
    setPaperTheme(preferences.paperTheme);
    setDeskTheme(preferences.deskTheme);
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    saveReportReadingPreferences({ fontStep, paperTheme, deskTheme });
  }, [deskTheme, fontStep, paperTheme, preferencesReady]);
  useEffect(() => {
    const keys = tabKeysKey ? tabKeysKey.split('\0') : [];
    if (!keys.length) {
      setActiveTab('');
      return;
    }
    setActiveTab((current) => (keys.includes(current) ? current : keys[0]!));
  }, [tabKeysKey]);

  useEffect(() => {
    const keys = tabKeysKey ? tabKeysKey.split('\0') : [];
    if (!keys.length) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

      const index = keys.indexOf(activeTab || keys[0]!);
      if (index < 0) return;

      const nextIndex =
        event.key === 'ArrowLeft'
          ? Math.max(0, index - 1)
          : Math.min(keys.length - 1, index + 1);
      if (nextIndex === index) return;

      event.preventDefault();
      setActiveTab(keys[nextIndex]!);
      getReportScrollParent()?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, tabKeysKey]);

  useEffect(() => {
    const scroller = getReportScrollParent();
    if (!scroller) return;

    function onScroll() {
      const node = getReportScrollParent();
      if (!node) return;
      const threshold = Math.max(320, node.clientHeight * 0.45);
      setShowBackToTop(node.scrollTop > threshold);
    }

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [activeTab, id]);

  function scrollToTop() {
    getReportScrollParent()?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-5 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to research dashboard"
            className="shrink-0"
            onClick={() => navigate('/')}
          >
            <ArrowLeft />
          </Button>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Research report
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {job?.ticker ?? 'Report'}
              </h1>
              {decisionLabel ? (
                <Badge variant="default" className="capitalize">
                  {decisionLabel}
                </Badge>
              ) : null}
              {job?.status ? (
                <Badge variant="outline" className="capitalize">
                  {job.status}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>

        {!id ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load report</AlertTitle>
            <AlertDescription>Report identifier is missing.</AlertDescription>
          </Alert>
        ) : detail.isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
            <Skeleton className="h-[28rem] w-full rounded-xl" />
          </div>
        ) : detail.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load report</AlertTitle>
            <AlertDescription>Please try again.</AlertDescription>
          </Alert>
        ) : entries.length ? (
          <Tabs
            value={activeTab || entries[0][0]}
            onValueChange={(value) => {
              setActiveTab(value);
              scrollToTop();
            }}
            className="min-h-0 flex-1 gap-0"
          >
            <div className="sticky top-(--header-height) z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6 lg:px-6">
              <ReportTabsNav
                entries={tabKeys}
                activeTab={activeTab || entries[0][0]}
                renderLabel={reportTabLabel}
                renderIcon={(key) => {
                  const Icon = reportTabIcon(key);
                  return <Icon className="size-3.5" />;
                }}
              />
            </div>
            {entries.map(([key, value]) => (
              <TabsContent key={key} value={key} className="mt-0 flex-1 pt-5">
                <div className={cn('rounded-2xl px-3 py-5 sm:px-5 md:px-6 md:py-8 lg:px-8', deskClassName)}>
                  <article
                    className={cn(
                      'mx-auto min-h-[70dvh] max-w-[64rem] overflow-hidden rounded-sm text-foreground',
                      paperClassName,
                      'shadow-[0_1px_1px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.08)]',
                      'ring-1 ring-black/5',
                    )}
                    style={
                      {
                        '--report-font-size': formatFontSize(fontStep),
                        '--report-highlight': paperThemeConfig.highlight,
                        '--report-highlight-soft': paperThemeConfig.highlightSoft,
                      } as CSSProperties
                    }
                  >
                    <div className="border-b border-black/5 px-6 py-4 md:px-10 lg:px-12">
                      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                        {reportTabLabel(key)}
                      </p>
                    </div>
                    <div className="px-6 py-10 md:px-10 md:py-12 lg:px-12">
                      <div className="mx-auto max-w-[52rem]">
                        <MarkdownReport value={value} />
                      </div>
                    </div>
                  </article>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Empty className="min-h-64 flex-1 rounded-xl border">
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

      {entries.length ? (
        <ReportReadingToolbar
          fontStep={fontStep}
          fontSteps={reportFontSteps}
          onFontStepChange={setFontStep}
          paperTheme={paperTheme}
          onPaperThemeChange={setPaperTheme}
          deskTheme={deskTheme}
          onDeskThemeChange={setDeskTheme}
          showBackToTop={showBackToTop}
          onBackToTop={scrollToTop}
        />
      ) : null}
    </div>
  );
}
