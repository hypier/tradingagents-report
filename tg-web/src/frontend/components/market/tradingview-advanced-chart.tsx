import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
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
 * Slim TradingView Advanced Chart — candle chart without chrome toolbars.
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
          hide_top_toolbar: true,
          hide_side_toolbar: true,
          hide_legend: false,
          save_image: false,
          withdateranges: false,
          details: false,
          hotlist: false,
          calendar: false,
          container_id: widgetId,
          disabled_features: [
            'header_widget',
            'header_symbol_search',
            'header_resolutions',
            'header_chart_type',
            'header_compare',
            'header_indicators',
            'header_undo_redo',
            'header_screenshot',
            'header_fullscreen_button',
            'header_settings',
            'left_toolbar',
            'context_menus',
            'control_bar',
            'timeframes_toolbar',
            'edit_buttons_in_legend',
            'border_around_the_chart',
          ],
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
      style={{ height }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
