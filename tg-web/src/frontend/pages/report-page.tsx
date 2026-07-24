import { useEffect, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookmarkPlus,
  CandlestickChart,
  Download,
  FileText,
  Star,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MarkdownReport } from '../components/report/markdown-report';
import {
  ReportReadingToolbar,
  reportDeskThemes,
  reportPaperThemes,
  type ReportDeskThemeId,
  type ReportPaperThemeId,
} from '../components/report/report-reading-toolbar';
import { ReportStickyTabs } from '../components/report/report-sticky-tabs';
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
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { getAnalystIcon, getStageIcon } from '../components/icons/research-icons';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '../lib/format-decision';
import { formatLocaleCalendarDate } from '../lib/format-locale';
import { formatOutputLanguage } from '../lib/format-output-language';
import { fetchPublicConfig } from '../lib/public-config';
import {
  loadReportReadingPreferences,
  saveReportReadingPreferences,
} from '../lib/report-reading-preferences';
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
  return {
    ticker,
    displayName,
    englishName,
    logoUrl,
    exchange,
    country,
    language,
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
  const { t } = useTranslation(['report', 'common']);
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
    const sections = entries
      .map(([key, value]) => {
        const body =
          typeof value === 'string'
            ? value
            : JSON.stringify(value, null, 2);
        return `## ${reportTabLabel(key)}\n\n${body}`;
      })
      .join('\n\n');
    const markdown = [
      `# ${title}`,
      '',
      subtitle,
      tradeDate
        ? t('tradeDate', { date: formatLocaleCalendarDate(tradeDate) })
        : '',
      costUsd != null
        ? t('costUsd', { amount: costUsd })
        : creditUnits != null
          ? t('creditCost', { count: creditUnits })
          : '',
      t('dataAsOf'),
      t('riskNotice'),
      '',
      sections,
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
      scrollReportToTop(findReportScrollParent(getActiveReportPaper()));
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, tabKeysKey]);

  useEffect(() => {
    const scroller = findReportScrollParent(getActiveReportPaper());

    function onScroll() {
      const node = findReportScrollParent(getActiveReportPaper());
      const threshold = Math.max(320, getReportClientHeight(node) * 0.45);
      setShowBackToTop(getReportScrollTop(node) > threshold);
    }

    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [activeTab, id]);

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
      <div className="@container/main flex flex-1 flex-col gap-5 px-5 py-3.5 md:gap-5 lg:px-6">
        <div className="flex items-center gap-3 border-b border-border pb-3.5">
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

        {!id ? (
          <Alert variant="destructive">
            <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
            <AlertDescription>{t('missingId')}</AlertDescription>
          </Alert>
        ) : detail.isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full max-w-xl rounded-none" />
            <Skeleton className="h-[28rem] w-full rounded-none" />
          </div>
        ) : detail.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
            <AlertDescription>{t('common:errors.generic')}</AlertDescription>
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
            <ReportStickyTabs
              stickyTop="header"
              symbol={identity.ticker ?? 'R'}
              logoUrl={identity.logoUrl}
              displayName={identity.displayName}
              ticker={identity.ticker}
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
            {entries.map(([key, value]) => (
              <TabsContent
                key={key}
                value={key}
                className={cn(
                  'mt-0 flex-1 pt-5',
                  '-mx-5 px-5 pb-6 lg:-mx-6 lg:px-6 lg:pb-8',
                  deskClassName,
                )}
              >
                <article
                  data-report-paper=""
                  className={cn(
                    'mx-auto min-h-[70dvh] max-w-[64rem] overflow-hidden rounded-none text-foreground',
                    paperClassName,
                    'shadow-[0_1px_1px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.08)]',
                    'dark:shadow-[0_1px_1px_rgba(0,0,0,0.25),0_12px_32px_rgba(0,0,0,0.45)]',
                    'ring-1 ring-black/5 dark:ring-white/10',
                  )}
                  style={
                    {
                      '--report-font-size': formatFontSize(fontStep),
                      '--report-highlight': reportHighlight,
                      '--report-highlight-soft': reportHighlightSoft,
                    } as CSSProperties
                  }
                >
                  <div className="border-b border-black/5 px-6 py-4 md:px-10 lg:px-12 dark:border-white/10">
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
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <Empty className="min-h-64 flex-1 rounded-none border">
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
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {t('dataAsOf')} {t('riskNotice')}
          </p>
        ) : null}
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
          layoutKey={activeTab || entries[0]?.[0] || id}
        />
      ) : null}
    </div>
  );
}
