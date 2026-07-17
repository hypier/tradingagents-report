import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';

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

export function TickerSearch({
  id,
  value,
  onChange,
  className,
}: TickerSearchProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.display_ticker ?? '');
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const search = useQuery({
    queryKey: ['market-search', debouncedQuery],
    queryFn: () => searchMarkets(debouncedQuery),
    enabled: open && debouncedQuery.length >= 1 && !value,
  });

  const hits = search.data?.data ?? [];

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

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
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
          placeholder="Search AAPL, 0700.HK, Tencent…"
          className="pr-9 pl-9 font-mono text-base tracking-wide"
          autoComplete="off"
        />
        {value || query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1.5 size-7 -translate-y-1/2 text-muted-foreground"
            aria-label="Clear ticker"
            onClick={clearSelection}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {open && !value && debouncedQuery.length >= 1 ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          {search.isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Searching…
            </div>
          ) : hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No matching stocks
            </p>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.provider_symbol ?? hit.display_ticker}
                type="button"
                role="option"
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                onClick={() => selectHit(hit)}
              >
                <Avatar size="sm" className="size-8 rounded-md after:rounded-md">
                  <AvatarImage
                    className="rounded-md"
                    src={hit.logo_url}
                    alt=""
                  />
                  <AvatarFallback className="rounded-md text-xs font-semibold">
                    {hit.display_ticker.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {hit.display_name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-muted-foreground">
                    <span>{hit.display_ticker}</span>
                    <span aria-hidden>·</span>
                    <span>{hit.exchange}</span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {value ? (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
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
