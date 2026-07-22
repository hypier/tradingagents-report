import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/frontend/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import { listManagedUsers, updateManagedUserRole } from '@/frontend/lib/auth';

export function AdminUsersPage() {
  const { t } = useTranslation('admin');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState<string>();
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users', query],
    queryFn: () => listManagedUsers({ query }),
    enabled: session.data?.data.user.role === 'admin',
  });
  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      updateManagedUserRole(userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('users.roleUpdated'));
    },
    onError: () => toast.error(t('users.roleUpdateError')),
  });

  const currentUserId = session.data?.data.user.id;
  const managedUsers = users.data?.data.users ?? [];

  return (
    <AdminGate
      accessTitle={t('users.accessRequired.title')}
      accessBody={t('users.accessRequired.body')}
    >
      <PageFrame
        title={t('users.heading')}
        description={t('users.description')}
        actions={
          <Badge variant="secondary">
            {t('users.count', {
              count: users.data?.data.totalCount ?? 0,
            })}
          </Badge>
        }
        toolbar={
          <PageToolbar>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(searchInput.trim() || undefined);
              }}
            >
              <FieldGroup className="flex-row items-end gap-2">
                <Field className="max-w-sm">
                  <FieldLabel htmlFor="user-search">
                    {t('users.searchLabel')}
                  </FieldLabel>
                  <Input
                    id="user-search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder={t('users.searchPlaceholder')}
                  />
                </Field>
                <Field className="w-auto">
                  <Button type="submit" variant="outline">
                    <Search data-icon="inline-start" />
                    {t('users.search')}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </PageToolbar>
        }
        bodyClassName="gap-0 p-0"
      >
        {users.isError && (
          <div className="px-5 py-4 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>{t('users.loadError.title')}</AlertTitle>
              <AlertDescription>
                {t('users.loadError.body')}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {users.isLoading ? (
          <div className="flex flex-col gap-2 px-5 py-4 lg:px-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : managedUsers.length === 0 && !users.isError ? (
          <div className="px-5 py-4 lg:px-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound />
                </EmptyMedia>
                <EmptyTitle>{t('users.emptyTitle')}</EmptyTitle>
                <EmptyDescription>{t('users.emptyBody')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 lg:pl-6">
                    {t('users.columns.user')}
                  </TableHead>
                  <TableHead>{t('users.columns.email')}</TableHead>
                  <TableHead>{t('users.columns.registered')}</TableHead>
                  <TableHead className="w-36">
                    {t('users.columns.role')}
                  </TableHead>
                  <TableHead className="pr-5 text-right lg:pr-6">
                    {t('users.columns.credits')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedUsers.map((user) => {
                  const isCurrentUser = user.id === currentUserId;
                  const isUpdating =
                    updateRole.isPending &&
                    updateRole.variables?.userId === user.id;

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="pl-5 lg:pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8! shrink-0 !rounded-none after:!rounded-none">
                            <AvatarImage
                              src={user.imageUrl}
                              alt={user.displayName}
                              className="!rounded-none"
                            />
                            <AvatarFallback className="!rounded-none text-xs font-semibold">
                              {user.displayName.slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex min-w-0 items-center gap-2">
                            <Link
                              className="truncate font-medium hover:underline"
                              to={`/admin/users/${encodeURIComponent(user.id)}`}
                            >
                              {user.displayName}
                            </Link>
                            {user.banned ? (
                              <Badge variant="destructive">
                                {t('users.banned')}
                              </Badge>
                            ) : null}
                            {isCurrentUser && (
                              <Badge variant="outline">{t('users.you')}</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email ?? t('users.noEmail')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatLocaleDateTimeValue(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          disabled={isCurrentUser || isUpdating}
                          onValueChange={(role: UserRole) =>
                            updateRole.mutate({ userId: user.id, role })
                          }
                        >
                          <SelectTrigger
                            aria-label={t('users.roleAria', {
                              name: user.displayName,
                            })}
                            className="w-full"
                            size="sm"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="user">
                                {t('users.roleUser')}
                              </SelectItem>
                              <SelectItem value="admin">
                                {t('users.roleAdmin')}
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="pr-5 text-right font-mono tabular-nums lg:pr-6">
                        {user.availableCredits}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PageFrame>
    </AdminGate>
  );
}
