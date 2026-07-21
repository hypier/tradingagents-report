import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/frontend/components/ui/toggle-group';
import { cn } from '@/frontend/lib/utils';

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

const SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

/** TradingView Advanced Chart interval codes. */
export const CHART_INTERVALS = [
  { value: '5', labelKey: '5m' },
  { value: '15', labelKey: '15m' },
  { value: '60', labelKey: '1H' },
  { value: 'D', labelKey: '1D' },
  { value: 'W', labelKey: '1W' },
  { value: 'M', labelKey: '1M' },
] as const;

export type ChartInterval = (typeof CHART_INTERVALS)[number]['value'];

const DEFAULT_INTERVAL: ChartInterval = 'D';

function loadTradingViewScript(): Promise<void> {
  if (window.TradingView) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${SCRIPT_SRC}"]`,
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.head.appendChild(script);
  });
}

/**
 * TradingView Advanced Chart embed (tv.js).
 * Interval is controlled by an external toggle — the free widget does not
 * expose a reliable resolution API without remounting.
 * Symbol must be EXCHANGE:TICKER (e.g. NASDAQ:MU).
 */
export function TradingViewAdvancedChart({
  symbol,
  className,
  height = 420,
  timezone = 'Etc/UTC',
  defaultInterval = DEFAULT_INTERVAL,
}: {
  symbol: string;
  className?: string;
  height?: number;
  /** IANA timezone for the chart axis (prefer market session TZ). */
  timezone?: string;
  defaultInterval?: ChartInterval;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { resolvedTheme } = useTheme();
  const { i18n, t } = useTranslation('stock');
  const isDark = resolvedTheme === 'dark';
  const locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';
  const [interval, setInterval] = useState<ChartInterval>(defaultInterval);

  useEffect(() => {
    const host = containerRef.current;
    if (!host || !symbol) return;

    let cancelled = false;
    const widgetId = `tv_chart_${symbol.replace(/[^a-zA-Z0-9]/gu, '_')}_${Date.now()}`;

    host.replaceChildren();
    const mount = document.createElement('div');
    mount.id = widgetId;
    mount.style.height = '100%';
    mount.style.width = '100%';
    host.appendChild(mount);

    void loadTradingViewScript()
      .then(() => {
        if (cancelled || !window.TradingView) return;
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval,
          timezone,
          theme: isDark ? 'dark' : 'light',
          style: '1',
          locale,
          toolbar_bg: isDark ? '#0E141B' : '#ffffff',
          enable_publishing: false,
          allow_symbol_change: false,
          // External ToggleGroup owns interval; keep TV chrome minimal.
          hide_top_toolbar: true,
          hide_side_toolbar: true,
          hide_legend: false,
          save_image: false,
          withdateranges: false,
          details: false,
          hotlist: false,
          calendar: false,
          container_id: widgetId,
        });
      })
      .catch(() => {
        if (cancelled || !host.isConnected) return;
        host.replaceChildren();
        const fallback = document.createElement('p');
        fallback.className =
          'flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground';
        fallback.textContent = t('chart.unavailable');
        host.appendChild(fallback);
      });

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [symbol, interval, isDark, locale, t, timezone]);

  return (
    <div
      className={cn('overflow-hidden border border-border bg-card', className)}
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <h2
          id={titleId}
          className="shrink-0 text-sm font-semibold tracking-tight"
        >
          {t('chart.title')}
        </h2>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={interval}
          onValueChange={(value) => {
            if (value) setInterval(value as ChartInterval);
          }}
          aria-label={t('chart.interval')}
          className="rounded-none"
        >
          {CHART_INTERVALS.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              className="h-7 min-w-9 rounded-none px-2 font-mono text-[11px] tabular-nums"
            >
              {t(`chart.intervals.${item.labelKey}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div ref={containerRef} className="w-full" style={{ height }} />
    </div>
  );
}
