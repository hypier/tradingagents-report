import { useTheme } from 'next-themes';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/frontend/lib/utils';

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

const SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

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
 * Keeps the native top toolbar so users can switch intervals;
 * hides the side drawing toolbar for a denser research layout.
 * Symbol must be EXCHANGE:TICKER (e.g. NASDAQ:MU).
 */
export function TradingViewAdvancedChart({
  symbol,
  className,
  height = 420,
}: {
  symbol: string;
  className?: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { resolvedTheme } = useTheme();
  const { i18n, t } = useTranslation('stock');
  const isDark = resolvedTheme === 'dark';
  const locale = i18n.language.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';

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
          interval: 'D',
          timezone: 'Etc/UTC',
          theme: isDark ? 'dark' : 'light',
          style: '1',
          locale,
          toolbar_bg: isDark ? '#0E141B' : '#ffffff',
          enable_publishing: false,
          allow_symbol_change: false,
          // Top toolbar owns interval / range switching on the free widget.
          hide_top_toolbar: false,
          hide_side_toolbar: true,
          hide_legend: false,
          save_image: false,
          withdateranges: true,
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
  }, [symbol, isDark, locale, t]);

  return (
    <div
      className={cn('overflow-hidden border border-border bg-card', className)}
      aria-labelledby={titleId}
    >
      <div className="border-b border-border px-3 py-2">
        <h2 id={titleId} className="text-sm font-semibold tracking-tight">
          {t('chart.title')}
        </h2>
      </div>
      <div ref={containerRef} className="w-full" style={{ height }} />
    </div>
  );
}
