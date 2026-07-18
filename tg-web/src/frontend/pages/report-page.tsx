import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
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
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
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
import { formatOutputLanguage } from '../lib/format-output-language';
import {
  loadReportReadingPreferences,
  saveReportReadingPreferences,
} from '../lib/report-reading-preferences';
import { getResearch, type AnalysisDetail } from '../lib/research';
import { cn } from '../lib/utils';
import { formatDisplayTicker } from '@/shared/listing';

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

function reportIdentity(job: AnalysisDetail | undefined) {
  const ticker = job?.ticker ? formatDisplayTicker(job.ticker) : null;
  const displayName = job?.display?.display_name?.trim() || null;
  const logoUrl = job?.display?.logo_url?.trim() || null;
  const exchange = job?.exchange?.trim() || null;
  const country = job?.display?.country?.trim() || null;
  const language = job?.output_language?.trim() || null;
  return { ticker, displayName, logoUrl, exchange, country, language };
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
  const { t } = useTranslation(['report', 'common']);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
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
  const reportHighlight = isDark
    ? paperThemeConfig.darkHighlight
    : paperThemeConfig.highlight;
  const reportHighlightSoft = isDark
    ? paperThemeConfig.darkHighlightSoft
    : paperThemeConfig.highlightSoft;
  const decisionLabel = formatDecision(job?.decision);
  const identity = reportIdentity(job);
  const title =
    identity.displayName ?? identity.ticker ?? t('fallbackTitle');
  const subtitle = decisionLabel
    ? t('finalDecision', { decision: decisionLabel })
    : identity.ticker
      ? t('analysisFor', { ticker: identity.ticker })
      : t('fallbackSubtitle');

  function reportTabLabel(key: string) {
    return t(`tabs.${key}`, {
      defaultValue: key
        .replace(/_report$/u, '')
        .replaceAll('_', ' ')
        .replace(/\b\w/gu, (char) => char.toUpperCase()),
    });
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
            aria-label={t('backAria')}
            className="shrink-0"
            onClick={() => navigate('/')}
          >
            <ArrowLeft />
          </Button>
          <Avatar
            size="lg"
            className="size-11 rounded-xl after:rounded-xl"
            data-logo-url={identity.logoUrl ?? undefined}
          >
            <AvatarImage
              src={identity.logoUrl ?? undefined}
              alt={t('logoAlt', {
                name:
                  identity.displayName ??
                  identity.ticker ??
                  t('instrumentFallback'),
              })}
              className="rounded-xl"
            />
            <AvatarFallback className="rounded-xl bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15">
              {(identity.ticker ?? 'R').slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              {t('eyebrow')}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {title}
              </h1>
              {decisionLabel ? (
                <Badge variant="default" className="capitalize">
                  {decisionLabel}
                </Badge>
              ) : null}
              {job?.status ? (
                <Badge variant="outline">
                  {t(`common:status.${job.status}`, {
                    defaultValue: job.status,
                  })}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {identity.ticker && identity.displayName ? (
                <Badge variant="secondary" className="font-mono tracking-wide">
                  {identity.ticker}
                </Badge>
              ) : null}
              {identity.exchange ? (
                <Badge variant="outline">{identity.exchange}</Badge>
              ) : null}
              {identity.country ? (
                <Badge variant="outline">{identity.country}</Badge>
              ) : null}
              {identity.language ? (
                <Badge variant="outline">
                  {formatOutputLanguage(
                    identity.language,
                    (key, options) => t(`common:${key}`, options),
                  )}
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
            <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
            <AlertDescription>{t('missingId')}</AlertDescription>
          </Alert>
        ) : detail.isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
            <Skeleton className="h-[28rem] w-full rounded-xl" />
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
              <TabsContent
                key={key}
                value={key}
                className={cn(
                  'mt-0 flex-1 pt-5',
                  '-mx-4 px-4 pb-6 md:-mx-6 md:px-6 md:pb-8 lg:px-6',
                  deskClassName,
                )}
              >
                <article
                  className={cn(
                    'mx-auto min-h-[70dvh] max-w-[64rem] overflow-hidden rounded-xl text-foreground',
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
          <Empty className="min-h-64 flex-1 rounded-xl border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('emptyBody')}</EmptyDescription>
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
