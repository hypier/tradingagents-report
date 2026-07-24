import { useEffect, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  CandlestickChart,
  ClipboardList,
  Download,
  FileText,
  ListTree,
  Star,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MarkdownReport } from '../components/report/markdown-report';
import {
  DecisionBriefCard,
  hasDecisionBrief,
} from '../components/report/decision-brief-card';
import {
  ReportReadingToolbar,
  reportDeskThemes,
  reportPaperThemes,
  type ReportDeskThemeId,
  type ReportPaperThemeId,
} from '../components/report/report-reading-toolbar';
import { ReportMindMap } from '../components/report/report-mind-map';
import { InstrumentIdentity } from '../components/instrument-identity';
import { InstrumentLogo } from '../components/instrument-logo';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { getAnalystIcon, getStageIcon } from '../components/icons/research-icons';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '../lib/format-decision';
import { formatDecisionBriefMarkdown } from '../lib/format-decision-brief-markdown';
import { formatLocaleCalendarDate } from '../lib/format-locale';
import { formatOutputLanguage } from '../lib/format-output-language';
import { fetchPublicConfig } from '../lib/public-config';
import {
  loadReportReadingPreferences,
  saveReportReadingPreferences,
} from '../lib/report-reading-preferences';
import { orderReportKeys } from '../lib/report-flow-order';
import { getResearch, type AnalysisDetail } from '../lib/research';
import {
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItem,
} from '../lib/watchlist';
import { cn } from '../lib/utils';
import {
  formatDisplayTicker,
  listingFromParts,
  resolveListingTicker,
  type ResolvedListing,
} from '@/shared/listing';

const reportFontSteps = [0.92, 1.0, 1.08, 1.18, 1.3] as const;
const defaultFontStep = 1;
const defaultReadingPreferences = {
  fontStep: defaultFontStep,
  paperTheme: 'mist' as const,
  deskTheme: 'slate' as const,
};

function formatFontSize(step: number) {
  const clamped = Math.min(
    reportFontSteps.length - 1,
    Math.max(0, step),
  );
  return `${(1.05 * reportFontSteps[clamped]!).toFixed(2)}rem`;
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

function reportIdentity(job: AnalysisDetail | undefined) {
  const ticker = job?.ticker ? formatDisplayTicker(job.ticker) : null;
  const displayName = job?.display?.display_name?.trim() || null;
  const englishName = job?.display?.english_name?.trim() || null;
  const logoUrl = job?.display?.logo_url?.trim() || null;
  const exchange = job?.exchange?.trim() || null;
  const country = job?.display?.country?.trim() || null;
  const language = job?.output_language?.trim() || null;
  const quickThinkLlm = job?.quick_think_llm?.trim() || null;
  const deepThinkLlm = job?.deep_think_llm?.trim() || null;
  return {
    ticker,
    displayName,
    englishName,
    logoUrl,
    exchange,
    country,
    language,
    quickThinkLlm,
    deepThinkLlm,
  };
}

/** Resolve listing identity for quote / watchlist actions. */
function listingForJob(job: AnalysisDetail | undefined): ResolvedListing | null {
  if (!job?.ticker?.trim()) return null;
  try {
    const displaySymbol = job.display?.symbol?.trim();
    if (job.exchange?.trim() && displaySymbol) {
      return listingFromParts(job.exchange, displaySymbol);
    }
    const listing = resolveListingTicker(job.ticker);
    if (listing.provider_symbol) return listing;
    if (job.exchange?.trim()) {
      return listingFromParts(job.exchange, listing.symbol);
    }
  } catch {
    return null;
  }
  return null;
}

function getActiveReportPaper() {
  return (
    document.querySelector<HTMLElement>(
      '[data-slot="tabs-content"][data-state="active"] [data-report-paper]',
    ) ?? document.querySelector<HTMLElement>('[data-report-paper]')
  );
}

/** Nearest overflow scrollport, or the window when the document scrolls. */
function findReportScrollParent(start: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = start;
  while (node && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflowY === 'overlay') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

function getReportScrollTop(scroller: HTMLElement | Window) {
  return scroller === window
    ? window.scrollY || document.documentElement.scrollTop
    : scroller.scrollTop;
}

function getReportClientHeight(scroller: HTMLElement | Window) {
  return scroller === window ? window.innerHeight : scroller.clientHeight;
}

function scrollReportToTop(scroller: HTMLElement | Window) {
  if (scroller === window) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  scroller.scrollTo({ top: 0, behavior: 'smooth' });
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function ReportPage() {
  const { t, i18n } = useTranslation(['report', 'common']);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getResearch(id!),
    enabled: Boolean(id),
  });
  const publicConfig = useQuery({
    queryKey: ['public-config'],
    queryFn: () => fetchPublicConfig(),
    staleTime: 60_000,
  });
  const watchlistEnabled =
    publicConfig.isLoading ||
    publicConfig.data?.features.watchlist !== false;
  const job = detail.data?.data;
  const watchlist = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => getWatchlist(),
    enabled: watchlistEnabled,
    staleTime: 60_000,
  });
  const addWatchlist = useMutation({
    mutationFn: (input: Parameters<typeof addWatchlistItem>[0]) =>
      addWatchlistItem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success(t('watchlist.added'));
    },
    onError: () => toast.error(t('watchlist.addError')),
  });
  const removeWatchlist = useMutation({
    mutationFn: (itemId: string) => removeWatchlistItem(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success(t('watchlist.removed'));
    },
    onError: () => toast.error(t('watchlist.removeError')),
  });
  const reportMap = job?.reports ?? {};
  const tabKeys = orderReportKeys(Object.keys(reportMap));
  const entries = tabKeys.map(
    (key) => [key, reportMap[key]] as const,
  );
  const tabKeysKey = tabKeys.join('\0');
  const showBrief = hasDecisionBrief(job?.decision);
  const [reportView, setReportView] = useState<'brief' | 'detail'>('brief');
  const [activeTab, setActiveTab] = useState(tabKeys[0] ?? '');
  const [outlineOpen, setOutlineOpen] = useState(false);
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
  const reportHighlight = isDark
    ? paperThemeConfig.darkHighlight
    : paperThemeConfig.highlight;
  const reportHighlightSoft = isDark
    ? paperThemeConfig.darkHighlightSoft
    : paperThemeConfig.highlightSoft;
  const decisionLabel = formatDecisionLabel(job?.decision, (key, options) =>
    t(`common:${key}`, options),
  );
  const identity = reportIdentity(job);
  const listing = listingForJob(job);
  const providerSymbol = listing?.provider_symbol ?? null;
  const watchlistItem = watchlist.data?.data.items.find(
    (item) => item.providerSymbol === providerSymbol,
  );
  const costUsd =
    typeof job?.cost_usd === 'number' && Number.isFinite(job.cost_usd)
      ? job.cost_usd
      : null;
  const creditUnits =
    typeof job?.credit_units === 'number' && Number.isFinite(job.credit_units)
      ? job.credit_units
      : null;
  const tradeDate =
    typeof job?.trade_date === 'string'
      ? job.trade_date
      : typeof (job as { tradeDate?: string } | undefined)?.tradeDate ===
          'string'
        ? (job as { tradeDate?: string }).tradeDate
        : null;
  const title =
    identity.displayName ?? identity.ticker ?? t('fallbackTitle');
  const subtitle = decisionLabel
    ? t('finalDecision', { decision: decisionLabel })
    : identity.ticker
      ? t('analysisFor', { ticker: identity.ticker })
      : t('fallbackSubtitle');
  const headerMeta = [
    identity.language
      ? formatOutputLanguage(identity.language, (key, options) =>
          t(`common:${key}`, options),
        )
      : null,
    tradeDate ? formatLocaleCalendarDate(tradeDate) : null,
    identity.quickThinkLlm
      ? t('models.quick', { name: identity.quickThinkLlm })
      : null,
    identity.deepThinkLlm
      ? t('models.deep', { name: identity.deepThinkLlm })
      : null,
  ].filter((part): part is string => Boolean(part));
  const showStatusBadge =
    Boolean(job?.status) && job?.status !== 'succeeded';

  function reportTabLabel(key: string) {
    return t(`tabs.${key}`, {
      defaultValue: key
        .replace(/_report$/u, '')
        .replaceAll('_', ' ')
        .replace(/\b\w/gu, (char) => char.toUpperCase()),
    });
  }

  function exportMarkdown() {
    if (!job) return;
    const briefMarkdown = hasDecisionBrief(job.decision)
      ? formatDecisionBriefMarkdown(job.decision, {
          locale: i18n.resolvedLanguage ?? i18n.language,
          sectionTitle: t('views.brief'),
          t: (key, options) => t(key, options),
          tCommon: (key, options) => t(`common:${key}`, options),
        })
      : '';
    const sections = entries
      .map(([key, value]) => {
        const body =
          typeof value === 'string'
            ? value
            : JSON.stringify(value, null, 2);
        return `## ${reportTabLabel(key)}\n\n${body}`;
      })
      .join('\n\n');
    const bodySections = [briefMarkdown, sections].filter(Boolean).join('\n\n');
    const markdown = [
      `# ${title}`,
      '',
      subtitle,
      tradeDate
        ? t('tradeDate', { date: formatLocaleCalendarDate(tradeDate) })
        : '',
      identity.quickThinkLlm
        ? t('models.quick', { name: identity.quickThinkLlm })
        : '',
      identity.deepThinkLlm
        ? t('models.deep', { name: identity.deepThinkLlm })
        : '',
      costUsd != null
        ? t('costUsd', { amount: costUsd })
        : creditUnits != null
          ? t('creditCost', { count: creditUnits })
          : '',
      t('dataAsOf'),
      t('riskNotice'),
      '',
      bodySections,
    ]
      .filter(Boolean)
      .join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${identity.ticker ?? 'report'}-${id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
    setReportView(showBrief ? 'brief' : 'detail');
  }, [id, showBrief]);

  useEffect(() => {
    const keys = tabKeysKey ? tabKeysKey.split('\0') : [];
    if (!keys.length || reportView !== 'detail') return;

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
      scrollReportToTop(findReportScrollParent(getActiveReportPaper()));
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, reportView, tabKeysKey]);

  useEffect(() => {
    if (reportView !== 'detail') {
      setShowBackToTop(false);
      return;
    }

    const scroller = findReportScrollParent(getActiveReportPaper());

    function onScroll() {
      const node = findReportScrollParent(getActiveReportPaper());
      const threshold = Math.max(320, getReportClientHeight(node) * 0.45);
      setShowBackToTop(getReportScrollTop(node) > threshold);
    }

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [activeTab, id, reportView]);

  function scrollToTop() {
    scrollReportToTop(findReportScrollParent(getActiveReportPaper()));
  }

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/reports');
  }

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="@container/main flex flex-1 flex-col pb-3.5"
        style={
          {
            // Keep outline / chapter chrome below the stuck report identity bar.
            // Identity bar ≈ logo 2.75rem + py-3.5×2 + border; leave a clear gap.
            '--report-header-height': '5rem',
          } as CSSProperties
        }
      >
        <div
          className={cn(
            'sticky top-(--header-height) z-[12]',
            'flex items-center gap-3 border-b border-border bg-background/95 px-5 py-3.5 backdrop-blur-md lg:px-6',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('backAria')}
            className="shrink-0"
            onClick={goBack}
          >
            <ArrowLeft />
          </Button>
          <InstrumentLogo
            symbol={identity.ticker ?? 'R'}
            logoUrl={identity.logoUrl}
            alt={t('logoAlt', {
              name:
                identity.displayName ??
                identity.ticker ??
                t('instrumentFallback'),
            })}
            size="xl"
            tone="accent"
          />
          <div className="min-w-0 flex-1">
            <InstrumentIdentity
              density="header"
              nameAs="h1"
              name={identity.displayName}
              secondaryName={identity.englishName}
              ticker={identity.ticker || title}
              trailing={
                <>
                  {decisionLabel ? (
                    <Badge variant={decisionBadgeVariant(job?.decision)}>
                      {decisionLabel}
                    </Badge>
                  ) : null}
                  {showStatusBadge ? (
                    <Badge variant="outline">
                      {t(`common:status.${job!.status}`, {
                        defaultValue: job!.status,
                      })}
                    </Badge>
                  ) : null}
                </>
              }
              tickerTitle={
                identity.ticker
                  ? [identity.ticker, ...headerMeta].join(' · ')
                  : null
              }
              tickerSuffix={
                headerMeta.length ? (
                  <>
                    {headerMeta.map((part) => (
                      <span key={part}> · {part}</span>
                    ))}
                  </>
                ) : null
              }
            />
          </div>
          {job ? (
            <div className="flex shrink-0 items-center gap-1">
              {providerSymbol ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
                      aria-label={t('openLiveQuote')}
                      onClick={() =>
                        navigate(
                          `/stocks/${encodeURIComponent(providerSymbol)}`,
                        )
                      }
                    >
                      <CandlestickChart />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {t('openLiveQuote')}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {watchlistEnabled && listing?.provider_symbol ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={watchlistItem ? 'default' : 'outline'}
                      size="icon-sm"
                      disabled={
                        addWatchlist.isPending || removeWatchlist.isPending
                      }
                      aria-label={
                        watchlistItem
                          ? t('watchlist.remove')
                          : t('watchlist.add')
                      }
                      onClick={() => {
                        if (watchlistItem) {
                          removeWatchlist.mutate(watchlistItem.id);
                          return;
                        }
                        if (!listing.provider_symbol) return;
                        addWatchlist.mutate({
                          exchange: listing.exchange ?? '',
                          symbol: listing.symbol,
                          displayTicker: listing.display_ticker,
                          providerSymbol: listing.provider_symbol,
                          displayName:
                            identity.displayName || listing.display_ticker,
                          logoUrl: identity.logoUrl,
                        });
                      }}
                    >
                      {watchlistItem ? (
                        <Star className="fill-current" />
                      ) : (
                        <BookmarkPlus />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {watchlistItem
                      ? t('watchlist.remove')
                      : t('watchlist.add')}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!entries.length}
                    aria-label={t('exportMarkdown')}
                    onClick={exportMarkdown}
                  >
                    <Download />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {t('exportMarkdown')}
                </TooltipContent>
              </Tooltip>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-5 pt-5',
            reportView === 'detail' && entries.length ? deskClassName : null,
          )}
        >
        {!id ? (
          <Alert variant="destructive" className="mx-5 lg:mx-6">
            <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
            <AlertDescription>{t('missingId')}</AlertDescription>
          </Alert>
        ) : detail.isLoading ? (
          <div className="flex flex-col gap-4 px-5 lg:px-6">
            <Skeleton className="h-10 w-full max-w-xl rounded-none" />
            <Skeleton className="h-[28rem] w-full rounded-none" />
          </div>
        ) : detail.isError ? (
          <Alert variant="destructive" className="mx-5 lg:mx-6">
            <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
            <AlertDescription>{t('common:errors.generic')}</AlertDescription>
          </Alert>
        ) : showBrief || entries.length ? (
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col px-5 lg:px-6',
              showBrief ? 'gap-6' : 'gap-0',
            )}
          >
            {showBrief ? (
              <div className="mx-auto w-full max-w-[72rem] xl:max-w-[80rem]">
                <div
                  role="tablist"
                  aria-label={t('views.ariaLabel')}
                  className="flex h-10 items-stretch border-b border-border"
                >
                  {(
                    [
                      {
                        id: 'brief' as const,
                        label: t('views.brief'),
                        icon: ClipboardList,
                        disabled: false,
                      },
                      {
                        id: 'detail' as const,
                        label: t('views.detail'),
                        icon: FileText,
                        disabled: !entries.length,
                      },
                    ] as const
                  ).map((item) => {
                    const selected = reportView === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        disabled={item.disabled}
                        tabIndex={selected ? 0 : -1}
                        className={cn(
                          '-mb-px inline-flex h-10 items-center gap-1.5 border-0 border-b-2 border-solid bg-transparent px-3 text-sm transition-colors',
                          'disabled:pointer-events-none disabled:opacity-50',
                          selected
                            ? 'border-b-primary font-semibold text-primary'
                            : 'border-b-transparent text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => {
                          setReportView(item.id);
                          scrollToTop();
                        }}
                      >
                        <Icon className="size-4 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {showBrief &&
            reportView === 'brief' &&
            hasDecisionBrief(job?.decision) ? (
              <div
                role="tabpanel"
                aria-label={t('views.brief')}
                className="mx-auto w-full max-w-[72rem] xl:max-w-[80rem]"
              >
                <DecisionBriefCard
                  decision={job.decision}
                  onViewDetail={
                    entries.length
                      ? () => {
                          setReportView('detail');
                          scrollToTop();
                        }
                      : undefined
                  }
                />
              </div>
            ) : null}

            {(reportView === 'detail' || !showBrief) && entries.length ? (
          <Tabs
            value={activeTab || entries[0][0]}
            onValueChange={(value) => {
              setActiveTab(value);
              scrollToTop();
            }}
            className="min-h-0 flex-1 gap-0"
          >
            {/* Outline + paper as one centered unit on the desk background. */}
            <div
              className={cn(
                'mx-auto flex w-full min-h-0 max-w-[72rem] flex-1 flex-col',
                // No overflow-hidden: it breaks sticky outline positioning.
                'rounded-lg border border-border/70 bg-background/70 shadow-sm',
                'xl:max-w-[80rem]',
                'lg:flex-row lg:items-start',
              )}
            >
              <aside
                className={cn(
                  'hidden w-[17.5rem] shrink-0 self-start lg:block xl:w-[18.5rem]',
                  'sticky top-[calc(var(--header-height)+var(--report-header-height))] z-[5]',
                  'max-h-[calc(100dvh-var(--header-height)-var(--report-header-height))] overflow-y-auto',
                  'border-r border-border/70 bg-background/90 px-3 py-3',
                )}
              >
                <ReportMindMap
                  entries={tabKeys}
                  activeTab={activeTab || entries[0][0]}
                  onSelect={(value) => {
                    setActiveTab(value);
                    scrollToTop();
                  }}
                  renderLabel={reportTabLabel}
                  renderIcon={(key) => {
                    const Icon = reportTabIcon(key);
                    return <Icon className="size-3.5" />;
                  }}
                />
              </aside>

              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'sticky z-10 mb-0 border-b border-border/70 bg-background/95 px-4 py-2 lg:hidden',
                    'top-[calc(var(--header-height)+var(--report-header-height))]',
                  )}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start rounded-none"
                    aria-label={t('flow.openOutline')}
                    onClick={() => setOutlineOpen(true)}
                  >
                    <ListTree />
                    <span className="truncate">
                      {t('flow.outline')}
                      {' · '}
                      {reportTabLabel(activeTab || entries[0][0])}
                    </span>
                  </Button>
                </div>

                <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
                  <SheetContent
                    side="left"
                    className="w-[min(20rem,90vw)] gap-0 p-0 sm:max-w-sm"
                  >
                    <SheetHeader className="border-b border-border">
                      <SheetTitle>{t('flow.title')}</SheetTitle>
                      <SheetDescription>
                        {t('flow.mindMapHint')}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="overflow-y-auto px-4 py-3">
                      <ReportMindMap
                        entries={tabKeys}
                        activeTab={activeTab || entries[0][0]}
                        onSelect={(value) => {
                          setActiveTab(value);
                          setOutlineOpen(false);
                          scrollToTop();
                        }}
                        renderLabel={reportTabLabel}
                        renderIcon={(key) => {
                          const Icon = reportTabIcon(key);
                          return <Icon className="size-3.5" />;
                        }}
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                {entries.map(([key, value], index) => {
                  const prevKey = index > 0 ? tabKeys[index - 1] : null;
                  const nextKey =
                    index < tabKeys.length - 1 ? tabKeys[index + 1] : null;
                  return (
                    <TabsContent
                      key={key}
                      value={key}
                      className="mt-0 flex-1 p-0"
                    >
                      <article
                        data-report-paper=""
                        className={cn(
                          'min-h-[70dvh] w-full overflow-hidden rounded-none text-foreground',
                          paperClassName,
                        )}
                        style={
                          {
                            '--report-font-size': formatFontSize(fontStep),
                            '--report-highlight': reportHighlight,
                            '--report-highlight-soft': reportHighlightSoft,
                          } as CSSProperties
                        }
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-black/5 px-6 py-4 md:px-10 lg:px-12 dark:border-white/10">
                          <p className="min-w-0 truncate text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                            <span className="font-medium tracking-[0.12em]">
                              {t('flow.chapterProgress', {
                                current: index + 1,
                                total: tabKeys.length,
                              })}
                            </span>
                            <span className="mx-2 font-normal text-muted-foreground/50">
                              ·
                            </span>
                            <span>{reportTabLabel(key)}</span>
                          </p>
                          <p className="shrink-0 text-right text-[11px] leading-snug tracking-wide text-muted-foreground">
                            {t('keyboardHint')}
                          </p>
                        </div>
                        <div className="px-6 py-10 md:px-10 md:py-12 lg:px-12">
                          <div className="mx-auto max-w-[46rem]">
                            <MarkdownReport value={value} />
                          </div>
                        </div>
                        {prevKey || nextKey ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 px-6 py-4 md:px-10 lg:px-12 dark:border-white/10">
                            {prevKey ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="rounded-none px-2"
                                onClick={() => {
                                  setActiveTab(prevKey);
                                  scrollToTop();
                                }}
                              >
                                <ArrowLeft />
                                {t('flow.previousChapter', {
                                  label: reportTabLabel(prevKey),
                                })}
                              </Button>
                            ) : (
                              <span />
                            )}
                            {nextKey ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-none"
                                onClick={() => {
                                  setActiveTab(nextKey);
                                  scrollToTop();
                                }}
                              >
                                {t('flow.nextChapter', {
                                  label: reportTabLabel(nextKey),
                                })}
                                <ArrowRight />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t('flow.endOfReport')}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </article>
                    </TabsContent>
                  );
                })}
              </div>
            </div>
          </Tabs>
            ) : reportView === 'detail' || !showBrief ? (
          <Empty className="min-h-64 flex-1 rounded-none border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('emptyBody')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
            ) : null}
          </div>
        ) : (
          <Empty className="mx-5 min-h-64 flex-1 rounded-none border lg:mx-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('emptyBody')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {job ? (
          <p className="mx-auto max-w-2xl px-5 pb-1 text-center text-xs leading-relaxed text-muted-foreground lg:px-6">
            {t('dataAsOf')} {t('riskNotice')}
          </p>
        ) : null}
        </div>
      </div>

      {entries.length && reportView === 'detail' ? (
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
          layoutKey={activeTab || entries[0]?.[0] || id}
        />
      ) : null}
    </div>
  );
}
