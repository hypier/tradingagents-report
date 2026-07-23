import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import type { UserRole } from '@/backend/auth/contract';
import { AdminGate } from '@/frontend/components/admin-gate';
import {
  PageFrame,
  PageToolbar,
} from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/frontend/components/ui/avatar';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import { listManagedUsers } from '@/frontend/lib/auth';

const ROLE_FILTERS = ['all', 'user', 'admin'] as const;

function shortenId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function roleBadgeVariant(role: UserRole) {
  return role === 'admin' ? 'info' : 'secondary';
}

export function AdminUsersPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('query') ?? '';
  const initialRole = searchParams.get('role') ?? 'all';

  const [searchInput, setSearchInput] = useState(initialQuery);
  const [roleFilter, setRoleFilter] = useState(initialRole);
  const [applied, setApplied] = useState({
    query: initialQuery,
    role: initialRole,
  });

  const users = useQuery({
    queryKey: ['admin-users', applied.query],
    queryFn: () =>
      listManagedUsers({
        query: applied.query.trim() || undefined,
      }),
    enabled: session.data?.data.user.role === 'admin',
  });

  const currentUserId = session.data?.data.user.id;
  const managedUsers = useMemo(() => {
    const rows = users.data?.data.users ?? [];
    if (applied.role === 'all') return rows;
    return rows.filter((user) => user.role === applied.role);
  }, [applied.role, users.data?.data.users]);

  function onFilter(event: FormEvent) {
    event.preventDefault();
    const next = {
      query: searchInput.trim(),
      role: roleFilter,
    };
    setApplied(next);
    const params = new URLSearchParams();
    if (next.query) params.set('query', next.query);
    if (next.role !== 'all') params.set('role', next.role);
    setSearchParams(params, { replace: true });
  }

  return (
    <AdminGate
      accessTitle={t('users.accessRequired.title')}
      accessBody={t('users.accessRequired.body')}
    >
      <PageFrame
        title={t('users.heading')}
        description={t('users.subtitle')}
        bodyClassName="gap-0 p-0"
        toolbar={
          <PageToolbar>
            <form
              onSubmit={onFilter}
              className="flex flex-wrap items-end gap-3"
            >
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_FILTERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === 'all'
                        ? t('users.roleAll')
                        : value === 'admin'
                          ? t('users.roleAdmin')
                          : t('users.roleUser')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('users.searchPlaceholder')}
                className="min-w-[12rem] flex-1 basis-40"
              />
              <Button type="submit" variant="secondary">
                <Search data-icon="inline-start" />
                {t('users.filter')}
              </Button>
            </form>
          </PageToolbar>
        }
      >
        {users.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : users.isError ? (
          <div className="p-5">
            <Alert variant="destructive">
              <AlertTitle>{t('users.loadError.title')}</AlertTitle>
              <AlertDescription>{t('users.loadError.body')}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('users.columns.user')}</TableHead>
                  <TableHead>{t('users.columns.email')}</TableHead>
                  <TableHead>{t('users.columns.registered')}</TableHead>
                  <TableHead>{t('users.columns.role')}</TableHead>
                  <TableHead className="text-right">
                    {t('users.columns.credits')}
                  </TableHead>
                  <TableHead className="w-[4.5rem] text-right">
                    {t('users.columns.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {t('users.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  managedUsers.map((user) => {
                    const isCurrentUser = user.id === currentUserId;
                    const detailLabel = t('users.viewDetail');
                    return (
                      <TableRow key={user.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex max-w-[14rem] min-w-0 items-center gap-2.5">
                            <Avatar className="size-7! shrink-0 !rounded-none after:!rounded-none">
                              {user.imageUrl ? (
                                <AvatarImage
                                  src={user.imageUrl}
                                  alt={user.displayName}
                                  className="!rounded-none"
                                />
                              ) : null}
                              <AvatarFallback className="!rounded-none text-xs font-semibold">
                                {user.displayName.slice(0, 1).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p className="truncate text-sm">
                                  {user.displayName}
                                </p>
                                {user.banned ? (
                                  <Badge
                                    variant="destructive"
                                    className="h-5 shrink-0 px-1.5 text-[10px]"
                                  >
                                    {t('users.banned')}
                                  </Badge>
                                ) : null}
                                {isCurrentUser ? (
                                  <Badge
                                    variant="outline"
                                    className="h-5 shrink-0 px-1.5 text-[10px]"
                                  >
                                    {t('users.you')}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                                {shortenId(user.id)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                          {user.email ?? t('users.noEmail')}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatLocaleDateTimeValue(user.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={roleBadgeVariant(user.role)}
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {user.role === 'admin'
                              ? t('users.roleAdmin')
                              : t('users.roleUser')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {user.availableCredits}
                        </TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                asChild
                                size="icon-sm"
                                variant="outline"
                                aria-label={detailLabel}
                              >
                                <Link
                                  to={`/admin/users/${encodeURIComponent(user.id)}`}
                                >
                                  <Info />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{detailLabel}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PageFrame>
    </AdminGate>
  );
}
