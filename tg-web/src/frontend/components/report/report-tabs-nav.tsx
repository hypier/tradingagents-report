import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/frontend/components/ui/button';
import { TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { cn } from '@/frontend/lib/utils';

type ReportTabsNavProps = {
  entries: string[];
  activeTab: string;
  renderIcon: (key: string) => ReactNode;
  renderLabel: (key: string) => string;
};

export function ReportTabsNav({
  entries,
  activeTab,
  renderIcon,
  renderLabel,
}: ReportTabsNavProps) {
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
      `[data-slot="tabs-trigger"][data-state="active"]`,
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
    <div className="flex items-center gap-1 border-b border-border">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Scroll tabs left"
        disabled={!canScrollLeft}
        className="shrink-0 rounded-none"
        onClick={() => scrollByPage(-1)}
      >
        <ChevronLeft />
      </Button>

      <div
        ref={scrollerRef}
        className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TabsList
          variant="line"
          className="inline-flex h-auto w-max min-w-full flex-nowrap justify-start gap-0 rounded-none bg-transparent p-0"
        >
          {entries.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className={cn(
                'h-10 flex-none gap-1.5 rounded-none border-b-2 border-transparent px-3 text-sm capitalize shadow-none',
                'data-active:border-primary data-active:bg-transparent data-active:text-foreground data-active:shadow-none',
              )}
            >
              {renderIcon(key)}
              {renderLabel(key)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Scroll tabs right"
        disabled={!canScrollRight}
        className="shrink-0 rounded-none"
        onClick={() => scrollByPage(1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
