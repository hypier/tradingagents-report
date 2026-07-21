import { useMemo, useState } from 'react';
import { ChevronsUpDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Input } from '@/frontend/components/ui/input';
import { cn } from '@/frontend/lib/utils';
import { normalizeUiLocale } from '@/frontend/i18n/locales';
import {
  displayNameForTvMarket,
  groupTvMarketsByContinent,
  TV_MARKETS_CATALOG,
  type TvMarketContinent,
} from '@/shared/market-codes';

export type MarketCodeOption = {
  code: string;
  displayName: string;
};

export function MarketCodePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  /** @deprecated Catalog is local; prop ignored. */
  markets?: MarketCodeOption[];
}) {
  const { t, i18n } = useTranslation('quotes');
  const locale = normalizeUiLocale(i18n.language) === 'zh' ? 'zh' : 'en';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedName = displayNameForTvMarket(value, locale);
  const groups = useMemo(
    () => groupTvMarketsByContinent(locale),
    [locale],
  );

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        markets: group.markets.filter(
          (market) =>
            market.code.includes(needle) ||
            market.displayName.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.markets.length > 0);
  }, [groups, query]);

  const continentLabel = (continent: TvMarketContinent) =>
    t(`marketPicker.continents.${continent}`, {
      defaultValue: continent,
    });

  return (
    <div className={cn('min-w-[14rem]', className)}>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-between rounded-none px-3.5 font-normal"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="truncate text-left">
          <span className="block text-xs text-muted-foreground">
            {t('marketPicker.label')}
          </span>
          <span className="font-medium">
            {selectedName || value || t('marketPicker.placeholder')}
          </span>
        </span>
        <ChevronsUpDown className="size-4 opacity-60" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <DialogContent className="flex max-h-[min(85dvh,40rem)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
            <DialogTitle>{t('marketPicker.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('marketPicker.dialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="relative shrink-0 border-b border-border px-5 py-3">
            <Search className="pointer-events-none absolute top-1/2 left-8 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('marketPicker.search')}
              className="h-11 rounded-none pl-9"
              autoFocus
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {filteredGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('marketPicker.empty')}
              </p>
            ) : (
              <div className="space-y-5">
                {filteredGroups.map((group) => (
                  <section key={group.continent}>
                    <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
                      {continentLabel(group.continent)}
                      <span className="ml-2 font-mono tabular-nums opacity-70">
                        {group.markets.length}
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
                      {group.markets.map((market) => {
                        const selected = market.code === value;
                        return (
                          <button
                            key={market.code}
                            type="button"
                            className={cn(
                              'flex cursor-pointer items-center justify-between gap-2 bg-popover px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50',
                              selected &&
                                'bg-primary/10 font-medium text-primary hover:bg-primary/15',
                            )}
                            onClick={() => {
                              onChange(market.code);
                              setOpen(false);
                              setQuery('');
                            }}
                          >
                            <span className="truncate text-sm">
                              {market.displayName}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground">
                              {market.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-5 py-2.5 font-mono text-[11px] tracking-wide text-muted-foreground">
            {t('marketPicker.catalogCount', {
              count: TV_MARKETS_CATALOG.length,
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
