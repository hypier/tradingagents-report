import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/frontend/components/ui/button';
import { cn } from '@/frontend/lib/utils';
import type { StockLeaderboardTab } from '@/shared/market-codes';

type BoardTabsNavProps = {
  tabs: readonly StockLeaderboardTab[];
  value: StockLeaderboardTab;
  onChange: (tab: StockLeaderboardTab) => void;
  className?: string;
};

export function BoardTabsNav({
  tabs,
  value,
  onChange,
  className,
}: BoardTabsNavProps) {
  const { t } = useTranslation('quotes');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const maxScroll = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && node.scrollLeft < maxScroll - 2);
  }, []);

  useLayoutEffect(() => {
    updateScrollState();
  }, [tabs, value, updateScrollState]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    updateScrollState();
    const onScroll = () => updateScrollState();
    node.addEventListener('scroll', onScroll, { passive: true });

    const observer = new ResizeObserver(() => updateScrollState());
    observer.observe(node);

    return () => {
      node.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [updateScrollState]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const active = node.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    active?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [value]);

  function scrollByPage(direction: -1 | 1) {
    const node = scrollerRef.current;
    if (!node) return;
    const amount = Math.max(160, Math.floor(node.clientWidth * 0.7));
    node.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  return (
    <div className={cn('relative', className)}>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={t('heading')}
        className="min-w-0 overflow-x-auto px-3 sm:px-5 lg:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max flex-nowrap items-stretch">
          {tabs.map((boardTab) => {
            const selected = value === boardTab;
            return (
              <button
                key={boardTab}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  '-mb-px shrink-0 cursor-pointer border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors sm:px-3.5 sm:py-3.5',
                  selected
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onChange(boardTab)}
              >
                {t(`tabs.${boardTab}`)}
              </button>
            );
          })}
        </div>
      </div>

      {canScrollLeft ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-background via-background/90 to-transparent pl-0.5 pr-6">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('tabsNav.scrollLeft')}
            className="pointer-events-auto rounded-none"
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft />
          </Button>
        </div>
      ) : null}

      {canScrollRight ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-background via-background/90 to-transparent pr-0.5 pl-6">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('tabsNav.scrollRight')}
            className="pointer-events-auto rounded-none"
            onClick={() => scrollByPage(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
