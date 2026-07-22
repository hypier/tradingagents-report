import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { InstrumentLogo } from '@/frontend/components/instrument-logo';
import { cn } from '@/frontend/lib/utils';

import { ReportTabsNav } from './report-tabs-nav';

type ReportStickyTabsProps = {
  entries: string[];
  activeTab: string;
  onSelect: (key: string) => void;
  renderIcon: (key: string) => ReactNode;
  renderLabel: (key: string) => string;
  symbol: string;
  logoUrl?: string | null;
  displayName?: string | null;
  ticker?: string | null;
  /** `header` offsets below the app shell; `none` sticks to the viewport top. */
  stickyTop?: 'header' | 'none';
};

/** Nearest scrollport for the sticky bar (overflow container or window). */
function findScrollParent(el: HTMLElement): HTMLElement | Window {
  let node: HTMLElement | null = el.parentElement;
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

/**
 * Sticky report tab bar. When stuck, shows a compact instrument chip so the
 * stock identity remains visible after the page header scrolls away.
 */
export function ReportStickyTabs({
  entries,
  activeTab,
  onSelect,
  renderIcon,
  renderLabel,
  symbol,
  logoUrl,
  displayName,
  ticker,
  stickyTop = 'header',
}: ReportStickyTabsProps) {
  const { t } = useTranslation('report');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  const name = displayName?.trim() || '';
  const code = ticker?.trim() || symbol.trim() || '';
  const label = name || code || t('instrumentFallback');
  const showTicker = Boolean(code) && Boolean(name) && name !== code;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const sticky = stickyRef.current;
    if (!sentinel || !sticky) return;

    const updateStuck = () => {
      // Compare against the sticky offset line in viewport coords — works for
      // both document scroll and overflow containers (sidebar-inset may not
      // be the actual scrollport when variant !== inset).
      const topOffset = parseFloat(getComputedStyle(sticky).top) || 0;
      setIsStuck(sentinel.getBoundingClientRect().top < topOffset + 0.5);
    };

    updateStuck();
    const scroller = findScrollParent(sticky);
    scroller.addEventListener('scroll', updateStuck, { passive: true });
    window.addEventListener('resize', updateStuck);
    const resizeObserver = new ResizeObserver(updateStuck);
    resizeObserver.observe(sticky);

    return () => {
      scroller.removeEventListener('scroll', updateStuck);
      window.removeEventListener('resize', updateStuck);
      resizeObserver.disconnect();
    };
  }, [stickyTop]);

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden
        data-sticky-sentinel=""
        className="pointer-events-none h-px w-full"
      />
      <div
        ref={stickyRef}
        className={cn(
          'sticky z-10 -mx-5 bg-background/95 px-5 py-3 backdrop-blur-md lg:-mx-6 lg:px-6',
          stickyTop === 'header' ? 'top-(--header-height)' : 'top-0',
        )}
      >
        <ReportTabsNav
          entries={entries}
          activeTab={activeTab}
          onSelect={onSelect}
          renderIcon={renderIcon}
          renderLabel={renderLabel}
          leading={
            <div
              className={cn(
                'mb-0.5 flex min-w-0 shrink items-center gap-2 overflow-hidden border-b border-transparent transition-[max-width,opacity,margin] duration-200',
                isStuck
                  ? 'mr-1 max-w-[10rem] opacity-100 sm:max-w-[14rem]'
                  : 'max-w-0 opacity-0',
              )}
              aria-hidden={!isStuck}
              data-stuck-identity={isStuck ? 'true' : 'false'}
            >
              <InstrumentLogo
                symbol={symbol}
                logoUrl={logoUrl}
                alt={t('logoAlt', { name: label })}
                size="sm"
                tone="accent"
              />
              <div className="min-w-0">
                <span className="block truncate text-sm font-normal tracking-tight text-foreground">
                  {label}
                </span>
                {showTicker ? (
                  <span className="block truncate font-mono text-[11px] tracking-wide text-muted-foreground">
                    {code}
                  </span>
                ) : null}
              </div>
            </div>
          }
        />
      </div>
    </>
  );
}
