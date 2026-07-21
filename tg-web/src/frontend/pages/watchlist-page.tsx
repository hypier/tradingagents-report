import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CandlestickChart,
  LoaderCircle,
  Play,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { InstrumentIdentity } from '../components/instrument-identity';
import { InstrumentLogo } from '../components/instrument-logo';
import { PageFrame, PageToolbar } from '../components/page-chrome';
import { TickerSearch } from '../components/ticker-search';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty';
import { Skeleton } from '../components/ui/skeleton';
import { Spinner } from '../components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';
import type { SelectedInstrument } from '../lib/research';
import {
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItem,
  type WatchlistItem,
} from '../lib/watchlist';

export function WatchlistPage() {
  const { t } = useTranslation(['watchlist', 'common']);
  const queryClient = useQueryClient();
  const [pendingInstrument, setPendingInstrument] =
    useState<SelectedInstrument | null>(null);
  const watchlist = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => getWatchlist(),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['watchlist'] });

  const addItem = useMutation({
    mutationFn: (input: Parameters<typeof addWatchlistItem>[0]) =>
      addWatchlistItem(input),
    onSuccess: () => {
      setPendingInstrument(null);
      void refresh();
      toast.success(t('toasts.added'));
    },
    onError: () => toast.error(t('toasts.addError')),
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeWatchlistItem(itemId),
    onSuccess: () => {
      void refresh();
      toast.success(t('toasts.removed'));
    },
    onError: () => toast.error(t('toasts.removeError')),
  });

  const groups = watchlist.data?.data.groups ?? [];
  const defaultGroupId = groups[0]?.id;
  const items = groups.flatMap((group) => group.items);
  const alreadySaved = Boolean(
    pendingInstrument &&
      items.some(
        (item) => item.providerSymbol === pendingInstrument.provider_symbol,
      ),
  );

  function handleAdd() {
    if (!pendingInstrument || !defaultGroupId || alreadySaved) return;
    addItem.mutate({
      groupId: defaultGroupId,
      exchange: pendingInstrument.exchange,
      symbol: pendingInstrument.symbol,
      displayTicker: pendingInstrument.display_ticker,
      providerSymbol: pendingInstrument.provider_symbol,
      displayName: pendingInstrument.display_name,
      logoUrl: pendingInstrument.logo_url ?? null,
    });
  }

  return (
    <AppShell>
      <PageFrame
        title={t('title')}
        description={t('subtitle')}
        bodyClassName="gap-0 p-0"
        toolbar={
          <PageToolbar>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <TickerSearch
                  value={pendingInstrument}
                  onChange={setPendingInstrument}
                />
              </div>
              <Button
                className="shrink-0 sm:self-stretch"
                disabled={
                  !pendingInstrument ||
                  !defaultGroupId ||
                  alreadySaved ||
                  addItem.isPending
                }
                onClick={handleAdd}
              >
                {addItem.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                {alreadySaved ? t('add.already') : t('add.action')}
              </Button>
            </div>
          </PageToolbar>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {watchlist.isLoading ? (
            <div className="flex flex-col gap-0 border-t border-border">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-none" />
              ))}
            </div>
          ) : watchlist.isError ? (
            <div className="px-5 py-5 lg:px-6">
              <Alert variant="destructive">
                <AlertTitle>{t('loadError.title')}</AlertTitle>
                <AlertDescription>{t('loadError.body')}</AlertDescription>
              </Alert>
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 lg:px-6">
              <Empty className="border border-border py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Star />
                  </EmptyMedia>
                  <EmptyTitle>{t('empty.title')}</EmptyTitle>
                  <EmptyDescription>{t('empty.body')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {items.map((item) => (
                <WatchlistRow
                  key={item.id}
                  item={item}
                  removing={
                    removeItem.isPending && removeItem.variables === item.id
                  }
                  onRemove={() => removeItem.mutate(item.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </PageFrame>
    </AppShell>
  );
}

function WatchlistRow({
  item,
  removing,
  onRemove,
}: {
  item: WatchlistItem;
  removing: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation('watchlist');

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-6">
      <Link
        to={`/stocks/${encodeURIComponent(item.providerSymbol)}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-90"
      >
        <InstrumentLogo
          symbol={item.providerSymbol || item.displayTicker}
          logoUrl={item.logoUrl}
          alt={item.displayName || item.displayTicker}
          size="md"
        />
        <InstrumentIdentity
          density="row"
          name={item.displayName || item.displayTicker}
          ticker={item.displayTicker}
        />
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button asChild size="sm" variant="outline">
          <Link to={`/stocks/${encodeURIComponent(item.providerSymbol)}`}>
            <CandlestickChart data-icon="inline-start" />
            {t('actions.quote')}
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to={`/?symbol=${encodeURIComponent(item.providerSymbol)}`}>
            <Play data-icon="inline-start" />
            {t('actions.analyze')}
          </Link>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('actions.remove')}
              onClick={onRemove}
              disabled={removing}
            >
              {removing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t('actions.remove')}
          </TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}
