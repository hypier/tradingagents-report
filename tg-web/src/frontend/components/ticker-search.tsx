import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { cn } from '../lib/utils';
import {
  searchMarkets,
  type MarketSearchHit,
  type SelectedInstrument,
} from '../lib/research';

type TickerSearchProps = {
  id?: string;
  value: SelectedInstrument | null;
  onChange: (instrument: SelectedInstrument | null) => void;
  className?: string;
  /** Prefer listings from this product market when ranking search hits. */
  preferredMarket?: 'US' | 'HK' | 'CN' | 'CRYPTO';
};

const MARKET_EXCHANGES: Record<
  NonNullable<TickerSearchProps['preferredMarket']>,
  string[]
> = {
  US: ['NASDAQ', 'NYSE', 'AMEX'],
  HK: ['HKEX'],
  CN: ['SSE', 'SZSE'],
  CRYPTO: [],
};

function toInstrument(hit: MarketSearchHit): SelectedInstrument | null {
  if (!hit.provider_symbol || !hit.exchange) return null;
  return {
    display_ticker: hit.display_ticker,
    provider_symbol: hit.provider_symbol,
    display_name: hit.display_name,
    exchange: hit.exchange,
    symbol: hit.symbol,
    ...(hit.logo_url ? { logo_url: hit.logo_url } : {}),
  };
}

function optionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}

export function TickerSearch({
  id,
  value,
  onChange,
  className,
  preferredMarket,
}: TickerSearchProps) {
  const { t } = useTranslation('search');
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.display_ticker ?? '');
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const showMenu = open && !value && debouncedQuery.length >= 1;

  const search = useQuery({
    queryKey: ['market-search', debouncedQuery],
    queryFn: () => searchMarkets(debouncedQuery),
    enabled: showMenu,
  });

  const hits = rankMarketHits(search.data?.data ?? [], preferredMarket);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, hits.length]);

  useLayoutEffect(() => {
    if (!showMenu) return;

    function updatePosition() {
      const rect = inputWrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 50,
      });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu || hits.length === 0) return;
    const option = document.getElementById(optionId(listboxId, activeIndex));
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, hits.length, listboxId, showMenu]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        listboxRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function clearSelection() {
    onChange(null);
    setQuery('');
    setOpen(true);
  }

  function selectHit(hit: MarketSearchHit) {
    const instrument = toInstrument(hit);
    if (!instrument) return;
    onChange(instrument);
    setQuery(instrument.display_ticker);
    setOpen(false);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showMenu) {
      if (event.key === 'ArrowDown' && query.trim()) {
        setOpen(true);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (hits.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % hits.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
      return;
    }

    if (event.key === 'Enter') {
      const hit = hits[activeIndex];
      if (!hit) return;
      event.preventDefault();
      selectHit(hit);
    }
  }

  const menu =
    showMenu && menuStyle
      ? createPortal(
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            style={menuStyle}
            className="max-h-80 overflow-auto rounded-none border border-border bg-popover p-1 shadow-lg"
          >
            {search.isLoading ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {t('searching')}
              </div>
            ) : hits.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                {t('noMatches')}
              </p>
            ) : (
              hits.map((hit, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={hit.provider_symbol ?? hit.display_ticker}
                    id={optionId(listboxId, index)}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-none px-2.5 py-2.5 text-left',
                      active ? 'bg-accent' : 'hover:bg-accent/70',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectHit(hit)}
                  >
                    <Avatar className="size-10! shrink-0 !rounded-none after:!rounded-none">
                      <AvatarImage
                        src={hit.logo_url}
                        alt=""
                        className="!rounded-none"
                      />
                      <AvatarFallback className="!rounded-none text-sm font-semibold">
                        {hit.display_ticker.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium">
                        {hit.display_name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 font-mono text-xs tracking-wide text-muted-foreground">
                        <span>{hit.display_ticker}</span>
                        <span aria-hidden>·</span>
                        <span>{hit.exchange}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        ref={inputWrapRef}
        className={cn(
          'relative flex items-center border border-border bg-card',
          'focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/35',
        )}
      >
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-primary/80"
        />
        <Input
          id={id}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showMenu && hits[activeIndex]
              ? optionId(listboxId, activeIndex)
              : undefined
          }
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (value) onChange(null);
            setOpen(true);
          }}
          onFocus={() => {
            if (!value) setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          placeholder={t('placeholder')}
          className="h-12 min-w-0 flex-1 border-0 bg-transparent pr-11 pl-12 font-mono text-base tracking-wide shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent"
          autoComplete="off"
        />
        {value || query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-2 z-10 size-8 -translate-y-1/2 text-muted-foreground"
            aria-label={t('clear')}
            onClick={clearSelection}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {menu}

      {value ? (
        <p className="mt-2 truncate text-sm text-muted-foreground">
          {value.display_name}
          <span className="text-muted-foreground/70">
            {' '}
            · {value.provider_symbol}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function rankMarketHits(
  hits: MarketSearchHit[],
  preferredMarket?: TickerSearchProps['preferredMarket'],
) {
  if (!preferredMarket) return hits;
  const preferred = new Set(MARKET_EXCHANGES[preferredMarket]);
  if (preferred.size === 0) return hits;
  return [...hits].sort((left, right) => {
    const leftScore = left.exchange && preferred.has(left.exchange) ? 1 : 0;
    const rightScore = right.exchange && preferred.has(right.exchange) ? 1 : 0;
    return rightScore - leftScore;
  });
}
