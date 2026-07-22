import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { AdminGate } from '@/frontend/components/admin-gate';
import { InstrumentLogo } from '@/frontend/components/instrument-logo';
import { PageFrame, PageToolbar } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Spinner } from '@/frontend/components/ui/spinner';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/frontend/components/ui/toggle-group';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import {
  deleteAdminMarket,
  listAdminMarkets,
  upsertAdminMarket,
} from '@/frontend/lib/admin-ops';
import { cn } from '@/frontend/lib/utils';
import {
  defaultDisplayNameForExchange,
  exchangeLogoUrl,
  getExchangeCatalogEntry,
  isEquityCatalogGroup,
  listCatalogGroups,
  listExchangeCatalog,
  suggestMarket,
  type ExchangeCatalogEntry,
} from '@/shared/exchange-catalog';

type SelectionFilter = 'all' | 'enabled' | 'disabled';

export function AdminMarketsPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const isAdmin = session.data?.data.user.role === 'admin';
  const exchanges = useQuery({
    queryKey: ['admin-analysis-exchanges'],
    queryFn: () => listAdminMarkets(),
    enabled: isAdmin,
  });

  const [query, setQuery] = useState('');
  const [selectionFilter, setSelectionFilter] =
    useState<SelectionFilter>('all');
  const [activeGroup, setActiveGroup] = useState<string>('');
  /** Local draft; `null` means follow the saved server whitelist. */
  const [draftSet, setDraftSet] = useState<Set<string> | null>(null);

  const items = exchanges.data?.data ?? [];
  const savedSet = useMemo(() => {
    const set = new Set<string>();
    for (const row of items) {
      if (row.enabled) set.add(row.exchange.trim().toUpperCase());
    }
    return set;
  }, [items]);

  const enabledSet = draftSet ?? savedSet;

  const isDirty = useMemo(() => {
    if (!draftSet) return false;
    return !sameSet(draftSet, savedSet);
  }, [draftSet, savedSet]);

  const changeCount = useMemo(() => {
    if (!draftSet) return 0;
    let count = 0;
    for (const code of draftSet) {
      if (!savedSet.has(code)) count += 1;
    }
    for (const code of savedSet) {
      if (!draftSet.has(code)) count += 1;
    }
    return count;
  }, [draftSet, savedSet]);

  const catalogGroups = useMemo(() => listCatalogGroups(), []);

  const catalogRows = useMemo(() => listExchangeCatalog(), []);

  useEffect(() => {
    if (!catalogGroups.length) return;
    if (!activeGroup || !catalogGroups.includes(activeGroup)) {
      setActiveGroup(catalogGroups[0]!);
    }
  }, [activeGroup, catalogGroups]);

  const groupStats = useMemo(() => {
    const stats = new Map<string, { total: number; enabled: number }>();
    for (const group of catalogGroups) {
      stats.set(group, { total: 0, enabled: 0 });
    }
    for (const entry of catalogRows) {
      const current = stats.get(entry.group) ?? { total: 0, enabled: 0 };
      current.total += 1;
      if (enabledSet.has(entry.value.trim().toUpperCase())) {
        current.enabled += 1;
      }
      stats.set(entry.group, current);
    }
    return stats;
  }, [catalogGroups, catalogRows, enabledSet]);

  const filteredByGroup = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byGroup = new Map<string, ExchangeCatalogEntry[]>();
    for (const group of catalogGroups) {
      byGroup.set(group, []);
    }
    for (const entry of catalogRows) {
      const code = entry.value.trim().toUpperCase();
      const checked = enabledSet.has(code);
      if (selectionFilter === 'enabled' && !checked) continue;
      if (selectionFilter === 'disabled' && checked) continue;
      if (needle) {
        const haystack = [
          entry.value,
          entry.name,
          entry.desc,
          entry.country,
          entry.group,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      byGroup.get(entry.group)?.push(entry);
    }
    for (const [group, rows] of byGroup) {
      rows.sort((left, right) => {
        // Pin order to the last saved whitelist so draft toggles do not jump
        // cards around; after save, `savedSet` updates and reorders.
        const leftOn = savedSet.has(left.value.trim().toUpperCase()) ? 0 : 1;
        const rightOn = savedSet.has(right.value.trim().toUpperCase()) ? 0 : 1;
        if (leftOn !== rightOn) return leftOn - rightOn;
        return left.name.localeCompare(right.name);
      });
      byGroup.set(group, rows);
    }
    return byGroup;
  }, [
    catalogGroups,
    catalogRows,
    enabledSet,
    query,
    savedSet,
    selectionFilter,
  ]);

  useEffect(() => {
    if (!activeGroup) return;
    if ((filteredByGroup.get(activeGroup)?.length ?? 0) > 0) return;
    const firstWithRows = catalogGroups.find(
      (group) => (filteredByGroup.get(group)?.length ?? 0) > 0,
    );
    if (firstWithRows) setActiveGroup(firstWithRows);
  }, [activeGroup, catalogGroups, filteredByGroup]);

  const enabledCount = enabledSet.size;
  const activeRows = filteredByGroup.get(activeGroup) ?? [];
  const activeStats = groupStats.get(activeGroup) ?? {
    total: 0,
    enabled: 0,
  };
  const filtering = selectionFilter !== 'all' || Boolean(query.trim());

  function toggleDraft(code: string, enable: boolean) {
    setDraftSet((current) => {
      const next = new Set(current ?? savedSet);
      if (enable) next.add(code);
      else next.delete(code);
      return sameSet(next, savedSet) ? null : next;
    });
  }

  function discardDraft() {
    setDraftSet(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      const draft = draftSet ?? savedSet;
      const toAdd = [...draft].filter((code) => !savedSet.has(code));
      const toRemove = [...savedSet].filter((code) => !draft.has(code));
      await Promise.all([
        ...toAdd.map((code) => {
          const catalog = getExchangeCatalogEntry(code);
          return upsertAdminMarket(code, {
            enabled: true,
            displayName: defaultDisplayNameForExchange(code),
            market: suggestMarket(catalog?.country, {
              group: catalog?.group,
            }),
          });
        }),
        ...toRemove.map((code) => deleteAdminMarket(code)),
      ]);
      return { added: toAdd.length, removed: toRemove.length };
    },
    onSuccess: async (result) => {
      setDraftSet(null);
      toast.success(
        t('markets.toast.saved', {
          count: result.added + result.removed,
        }),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['admin-analysis-exchanges'],
        }),
        queryClient.invalidateQueries({ queryKey: ['public-config'] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(error.message || t('markets.toast.saveError')),
  });

  return (
    <AdminGate
      accessTitle={t('markets.accessRequired.title')}
      accessBody={t('markets.accessRequired.body')}
      loading={exchanges.isLoading}
    >
      <PageFrame
        title={t('markets.heading')}
        description={t('markets.subtitle')}
        bodyClassName="gap-0 p-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm tabular-nums text-muted-foreground">
              {t('markets.summary', {
                enabled: enabledCount,
                total: catalogRows.length,
              })}
              {isDirty ? (
                <span className="ml-2 text-primary">
                  {t('markets.unsaved', { count: changeCount })}
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!isDirty || save.isPending}
              onClick={discardDraft}
            >
              <RotateCcw data-icon="inline-start" />
              {t('markets.actions.discard')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!isDirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {t('markets.actions.save')}
            </Button>
          </div>
        }
        toolbar={
          <PageToolbar className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup
                type="single"
                value={selectionFilter}
                onValueChange={(value) => {
                  if (
                    value === 'all' ||
                    value === 'enabled' ||
                    value === 'disabled'
                  ) {
                    setSelectionFilter(value);
                  }
                }}
                variant="outline"
                size="sm"
                spacing={0}
                className="justify-start"
              >
                <ToggleGroupItem value="all" className="rounded-none px-3.5">
                  {t('markets.filters.all')}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="enabled"
                  className="rounded-none px-3.5"
                >
                  {t('markets.filters.enabled')}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="disabled"
                  className="rounded-none px-3.5"
                >
                  {t('markets.filters.disabled')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('markets.filters.searchPlaceholder')}
                className="pl-9"
              />
            </div>
          </PageToolbar>
        }
      >
        {exchanges.isError ? (
          <div className="px-5 py-4 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>{t('markets.loadError.title')}</AlertTitle>
              <AlertDescription>{t('markets.loadError.body')}</AlertDescription>
            </Alert>
          </div>
        ) : catalogGroups.length === 0 || !activeGroup ? (
          <div className="px-5 py-8 text-sm text-muted-foreground lg:px-6">
            {t('markets.emptyFiltered')}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="shrink-0 border-b border-border lg:w-56 lg:border-r lg:border-b-0 xl:w-60">
              <div className="p-3 lg:hidden">
                <Select value={activeGroup} onValueChange={setActiveGroup}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogGroups.map((group) => {
                      const stats = groupStats.get(group) ?? {
                        total: 0,
                        enabled: 0,
                      };
                      const filteredCount =
                        filteredByGroup.get(group)?.length ?? 0;
                      return (
                        <SelectItem key={group} value={group}>
                          {localizeGroup(group, t)} (
                          {filtering
                            ? filteredCount
                            : `${stats.enabled}/${stats.total}`}
                          )
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <nav className="hidden max-h-full overflow-y-auto p-2 lg:block">
                <p className="px-2 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {t('markets.groupsLabel')}
                </p>
                <ul className="space-y-0.5">
                  {catalogGroups.map((group, index) => {
                    const stats = groupStats.get(group) ?? {
                      total: 0,
                      enabled: 0,
                    };
                    const filteredCount =
                      filteredByGroup.get(group)?.length ?? 0;
                    const selected = group === activeGroup;
                    const emptyWhileFiltering =
                      filtering && filteredCount === 0;
                    const isNonEquity = !isEquityCatalogGroup(group);
                    const prevIsEquity =
                      index > 0 &&
                      isEquityCatalogGroup(catalogGroups[index - 1]);
                    const showDivider = isNonEquity && prevIsEquity;
                    return (
                      <li
                        key={group}
                        className={cn(showDivider && 'mt-2 border-t border-border pt-2')}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveGroup(group)}
                          className={cn(
                            'flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left text-sm transition-colors',
                            selected
                              ? 'bg-primary/10 text-foreground'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                            emptyWhileFiltering && 'opacity-40',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block leading-snug font-medium">
                              {localizeGroup(group, t)}
                            </span>
                            {isNonEquity ? (
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                {t('markets.kind.other')}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {filtering
                              ? filteredCount
                              : `${stats.enabled}/${stats.total}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold tracking-tight">
                    {localizeGroup(activeGroup, t)}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {t('markets.panelHint', {
                      visible: activeRows.length,
                      enabled: activeStats.enabled,
                      total: activeStats.total,
                    })}
                  </p>
                </div>
              </div>

              {activeRows.length === 0 ? (
                <p className="px-5 py-10 text-sm text-muted-foreground">
                  {t('markets.emptyFiltered')}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
                  {activeRows.map((entry) => {
                    const code = entry.value.trim().toUpperCase();
                    const checked = enabledSet.has(code);
                    const saved = savedSet.has(code);
                    const changed = checked !== saved;
                    const market = suggestMarket(entry.country, {
                      group: entry.group,
                    });
                    const title = entry.name.trim() || code;
                    const showCode = title.trim().toUpperCase() !== code;
                    const description = cleanExchangeDescription(entry);
                    return (
                      <label
                        key={code}
                        htmlFor={`exchange-${code}`}
                        className={cn(
                          'flex cursor-pointer flex-col gap-2 border border-border bg-card p-3 transition-colors active:scale-[0.99]',
                          checked
                            ? 'border-primary/50 bg-primary/5'
                            : 'hover:bg-muted/30',
                          changed && 'ring-1 ring-primary/30',
                          save.isPending && 'pointer-events-none opacity-55',
                        )}
                      >
                        <span className="flex items-start gap-2.5">
                          <InstrumentLogo
                            symbol={code}
                            logoUrl={exchangeLogoUrl(entry.value)}
                            alt={title}
                            size="lg"
                            className="border border-border bg-background"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium leading-snug">
                                  {title}
                                </span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                                  {showCode ? (
                                    <span className="font-mono tracking-wide">
                                      {code}
                                    </span>
                                  ) : null}
                                  {market ? (
                                    <span className="font-mono tabular-nums">
                                      {showCode ? '· ' : ''}
                                      {market}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                              <Checkbox
                                checked={checked}
                                disabled={save.isPending}
                                onCheckedChange={(next) => {
                                  const enable = next === true;
                                  if (enable === checked) return;
                                  toggleDraft(code, enable);
                                }}
                                id={`exchange-${code}`}
                                className="mt-0.5 size-4 shrink-0"
                                aria-label={t('markets.fields.enabled')}
                              />
                            </span>
                          </span>
                        </span>
                        {description ? (
                          <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {description}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </PageFrame>
    </AdminGate>
  );
}

function sameSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

/** Drop redundant name/code prefixes from TradingView-style descriptions. */
function cleanExchangeDescription(
  entry: ExchangeCatalogEntry,
): string | null {
  const raw = entry.desc?.trim() || '';
  if (!raw) return null;
  const name = entry.name.trim();
  const code = entry.value.trim();
  if (!raw || raw === name || raw === code) return null;

  const dashed = raw.split(/\s*[—–-]\s*/);
  if (
    dashed.length >= 2 &&
    dashed[0]!.trim().toUpperCase() === code.toUpperCase()
  ) {
    const rest = dashed.slice(1).join(' - ').trim();
    if (rest && rest.toUpperCase() !== name.toUpperCase()) return rest;
    if (rest && rest.toUpperCase() === name.toUpperCase()) return null;
  }

  if (raw.toLowerCase().startsWith(name.toLowerCase())) {
    const rest = raw.slice(name.length).replace(/^[—–\-\s]+/, '').trim();
    return rest || null;
  }

  return raw;
}

function localizeGroup(
  group: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string {
  return t(`markets.groups.${group}`, { defaultValue: group });
}
