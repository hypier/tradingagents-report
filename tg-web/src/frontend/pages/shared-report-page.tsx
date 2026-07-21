import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Link2Off } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { MarkdownReport } from '../components/report/markdown-report';
import {
  ReportReadingToolbar,
  reportDeskThemes,
  reportPaperThemes,
  type ReportDeskThemeId,
  type ReportPaperThemeId,
} from '../components/report/report-reading-toolbar';
import { ReportTabsNav } from '../components/report/report-tabs-nav';
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
import { getAnalystIcon, getStageIcon } from '../components/icons/research-icons';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '../lib/format-decision';
import {
  formatLocaleCalendarDate,
  formatLocaleDateTime,
} from '../lib/format-locale';
import { formatOutputLanguage } from '../lib/format-output-language';
import {
  loadReportReadingPreferences,
  saveReportReadingPreferences,
} from '../lib/report-reading-preferences';
import { getSharedReport } from '../lib/share';
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


function getReportScrollParent() {
  return (
    document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]') ??
    document.documentElement
  );
}

export function SharedReportPage({
  publicView = false,
}: {
  publicView?: boolean;
}) {
  const { t } = useTranslation(['report', 'common']);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { token } = useParams();
  const detail = useQuery({
    queryKey: ['shared-report', token],
    queryFn: () => getSharedReport(token!),
    enabled: Boolean(token),
    retry: false,
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
  const decisionLabel = formatDecisionLabel(job?.decision, (key, options) =>
    t(`common:${key}`, options),
  );
  const ticker = job?.ticker ? formatDisplayTicker(job.ticker) : null;
  const displayName = job?.display?.display_name?.trim() || null;
  const logoUrl = job?.display?.logo_url?.trim() || null;
  const language = job?.output_language?.trim() || null;
  const tradeDate =
    typeof job?.trade_date === 'string' ? job.trade_date : null;
  const title = displayName ?? ticker ?? t('fallbackTitle');
  const expiresLabel = job?.share_expires_at
    ? formatLocaleDateTime(String(job.share_expires_at))
    : null;
  const headerMeta = [
    language
      ? formatOutputLanguage(language, (key, options) =>
          t(`common:${key}`, options),
        )
      : null,
    tradeDate ? formatLocaleCalendarDate(tradeDate) : null,
    expiresLabel ? t('share.expires', { date: expiresLabel }) : null,
  ].filter((part): part is string => Boolean(part));

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
    const scroller = getReportScrollParent();
    function onScroll() {
      const node = getReportScrollParent();
      const threshold = Math.max(320, (node?.clientHeight ?? 800) * 0.45);
      setShowBackToTop((node?.scrollTop ?? window.scrollY) > threshold);
    }
    onScroll();
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [activeTab, token]);

  function scrollToTop() {
    const scroller = getReportScrollParent();
    if (scroller === document.documentElement) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    scroller?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const body = (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-5 px-5 py-3.5 md:gap-5 lg:px-6">
        <div className="flex items-center gap-3 border-b border-border pb-3.5">
          <InstrumentLogo
            symbol={ticker ?? 'R'}
            logoUrl={logoUrl}
            alt={t('logoAlt', {
              name: displayName ?? ticker ?? t('instrumentFallback'),
            })}
            size="xl"
            tone="accent"
          />
          <div className="min-w-0 flex-1">
            <InstrumentIdentity
              density="header"
              nameAs="h1"
              name={displayName}
              ticker={ticker || title}
              trailing={
                decisionLabel ? (
                  <Badge variant={decisionBadgeVariant(job?.decision)}>
                    {decisionLabel}
                  </Badge>
                ) : null
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
          {publicView ? (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/">{t('share.signIn')}</Link>
            </Button>
          ) : null}
        </div>

        {!token ? (
          <Alert variant="destructive">
            <Link2Off />
            <AlertTitle>{t('share.unavailableTitle')}</AlertTitle>
            <AlertDescription>{t('share.missingToken')}</AlertDescription>
          </Alert>
        ) : detail.isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full max-w-xl rounded-none" />
            <Skeleton className="h-[28rem] w-full rounded-none" />
          </div>
        ) : detail.isError ? (
          <Alert variant="destructive">
            <Link2Off />
            <AlertTitle>{t('share.unavailableTitle')}</AlertTitle>
            <AlertDescription>{t('share.unavailableBody')}</AlertDescription>
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
            <div
              className={cn(
                'sticky z-10 -mx-5 bg-background/95 px-5 py-3 backdrop-blur-md lg:-mx-6 lg:px-6',
                publicView ? 'top-0' : 'top-(--header-height)',
              )}
            >
              <ReportTabsNav
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
            </div>
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
        />
      ) : null}
    </div>
  );

  return publicView ? (
    <main className="min-h-svh bg-background">{body}</main>
  ) : (
    <AppShell>{body}</AppShell>
  );
}
