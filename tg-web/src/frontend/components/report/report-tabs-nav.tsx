import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/frontend/components/ui/button';
import { cn } from '@/frontend/lib/utils';

type ReportTabsNavProps = {
  entries: string[];
  activeTab: string;
  onSelect: (key: string) => void;
  renderIcon: (key: string) => ReactNode;
  renderLabel: (key: string) => string;
};

/**
 * Report section tabs. Plain buttons (not shared TabsTrigger) so the active
 * underline is not wiped by the design-system trigger chrome.
 */
export function ReportTabsNav({
  entries,
  activeTab,
  onSelect,
  renderIcon,
  renderLabel,
}: ReportTabsNavProps) {
  const { t } = useTranslation('report');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const maxScroll = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 2);
    setCanScrollRight(node.scrollLeft < maxScroll - 2);
  }, []);

  useLayoutEffect(() => {
    updateScrollState();
  }, [entries, activeTab, updateScrollState]);

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
      inline: 'nearest',
      block: 'nearest',
    });
  }, [activeTab]);

  function scrollByPage(direction: -1 | 1) {
    const node = scrollerRef.current;
    if (!node) return;
    const amount = Math.max(180, Math.floor(node.clientWidth * 0.75));
    node.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Scroll tabs left"
          disabled={!canScrollLeft}
          className="mb-0.5 shrink-0 rounded-none"
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft />
        </Button>

        <div
          ref={scrollerRef}
          role="tablist"
          className="flex min-w-0 flex-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="inline-flex h-10 w-max min-w-full flex-nowrap items-stretch justify-center">
            {entries.map((key) => {
              const selected = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-report-tab={key}
                  tabIndex={selected ? 0 : -1}
                  className={cn(
                    '-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 border-solid bg-transparent px-3 text-sm capitalize transition-colors',
                    selected
                      ? 'border-b-primary font-semibold text-primary'
                      : 'border-b-transparent text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => onSelect(key)}
                >
                  {renderIcon(key)}
                  {renderLabel(key)}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Scroll tabs right"
          disabled={!canScrollRight}
          className="mb-0.5 shrink-0 rounded-none"
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <p className="text-center text-[11px] tracking-wide text-muted-foreground">
        {t('keyboardHint')}
      </p>
    </div>
  );
}
