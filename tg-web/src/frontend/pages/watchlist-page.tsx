import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { PageFrame, SectionPanel } from '../components/page-chrome';
import { TickerSearch } from '../components/ticker-search';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Spinner } from '../components/ui/spinner';
import type { SelectedInstrument } from '../lib/research';
import {
  addWatchlistItem,
  createWatchlistGroup,
  createWatchlistTag,
  getWatchlist,
  removeWatchlistItem,
  setWatchlistItemTags,
} from '../lib/watchlist';

export function WatchlistPage() {
  const { t } = useTranslation(['watchlist', 'common']);
  const queryClient = useQueryClient();
  const [pendingInstrument, setPendingInstrument] =
    useState<SelectedInstrument | null>(null);
  const [groupName, setGroupName] = useState('');
  const [tagName, setTagName] = useState('');
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
  const createGroup = useMutation({
    mutationFn: (name: string) => createWatchlistGroup(name),
    onSuccess: () => {
      setGroupName('');
      void refresh();
      toast.success(t('toasts.groupCreated'));
    },
    onError: () => toast.error(t('toasts.groupError')),
  });
  const createTag = useMutation({
    mutationFn: () => createWatchlistTag({ name: tagName }),
    onSuccess: () => {
      setTagName('');
      void refresh();
      toast.success(t('toasts.tagCreated'));
    },
    onError: () => toast.error(t('toasts.tagError')),
  });
  const assignTag = useMutation({
    mutationFn: ({
      itemId,
      tagIds,
    }: {
      itemId: string;
      tagIds: string[];
    }) => setWatchlistItemTags(itemId, tagIds),
    onSuccess: () => void refresh(),
  });

  const groups = watchlist.data?.data.groups ?? [];
  const tags = watchlist.data?.data.tags ?? [];
  const defaultGroupId = groups[0]?.id;

  return (
    <AppShell>
      <PageFrame title={t('title')} description={t('subtitle')}>
          <SectionPanel
            title={t('add.title')}
            description={t('add.description')}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <TickerSearch
                  value={pendingInstrument}
                  onChange={setPendingInstrument}
                />
              </div>
              <Button
                disabled={
                  !pendingInstrument || !defaultGroupId || addItem.isPending
                }
                onClick={() => {
                  if (!pendingInstrument || !defaultGroupId) return;
                  addItem.mutate({
                    groupId: defaultGroupId,
                    exchange: pendingInstrument.exchange,
                    symbol: pendingInstrument.symbol,
                    displayTicker: pendingInstrument.display_ticker,
                    providerSymbol: pendingInstrument.provider_symbol,
                    displayName: pendingInstrument.display_name,
                    logoUrl: pendingInstrument.logo_url ?? null,
                  });
                }}
              >
                {addItem.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                {t('add.action')}
              </Button>
            </div>
          </SectionPanel>

          <div className="grid gap-5 md:grid-cols-2">
            <SectionPanel title={t('groups.title')}>
              <div className="flex gap-2">
                <Input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder={t('groups.placeholder')}
                />
                <Button
                  variant="outline"
                  disabled={!groupName.trim() || createGroup.isPending}
                  onClick={() => createGroup.mutate(groupName.trim())}
                >
                  {t('groups.create')}
                </Button>
              </div>
            </SectionPanel>
            <SectionPanel title={t('tags.title')}>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Input
                    value={tagName}
                    onChange={(event) => setTagName(event.target.value)}
                    placeholder={t('tags.placeholder')}
                  />
                  <Button
                    variant="outline"
                    disabled={!tagName.trim() || createTag.isPending}
                    onClick={() => createTag.mutate()}
                  >
                    {t('tags.create')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag.id} variant="secondary">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </SectionPanel>
          </div>

          {watchlist.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : watchlist.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{t('loadError.title')}</AlertTitle>
              <AlertDescription>{t('loadError.body')}</AlertDescription>
            </Alert>
          ) : (
            groups.map((group) => (
              <SectionPanel
                key={group.id}
                title={group.name}
                description={t('groups.itemCount', {
                  count: group.items.length,
                })}
              >
                {group.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('groups.empty')}
                  </p>
                ) : (
                  <div className="divide-y divide-border border border-border">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <Link
                            className="font-medium hover:underline"
                            to={`/stocks/${encodeURIComponent(item.providerSymbol)}`}
                          >
                            {item.displayName}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.displayTicker} · {item.providerSymbol}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tags.map((tag) => {
                              const active = item.tags.some(
                                (itemTag) => itemTag.id === tag.id,
                              );
                              return (
                                <Button
                                  key={tag.id}
                                  size="sm"
                                  variant={active ? 'default' : 'outline'}
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    const next = active
                                      ? item.tags
                                          .filter(
                                            (itemTag) => itemTag.id !== tag.id,
                                          )
                                          .map((itemTag) => itemTag.id)
                                      : [
                                          ...item.tags.map(
                                            (itemTag) => itemTag.id,
                                          ),
                                          tag.id,
                                        ];
                                    assignTag.mutate({
                                      itemId: item.id,
                                      tagIds: next,
                                    });
                                  }}
                                >
                                  {tag.name}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to={`/?symbol=${encodeURIComponent(item.providerSymbol)}`}
                            >
                              {t('actions.analyze')}
                            </Link>
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('actions.remove')}
                            onClick={() => removeItem.mutate(item.id)}
                            disabled={removeItem.isPending}
                          >
                            {removeItem.isPending &&
                            removeItem.variables === item.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionPanel>
            ))
          )}
      </PageFrame>
    </AppShell>
  );
}
