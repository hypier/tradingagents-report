import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldAlert, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { UserRole } from '@/backend/auth/contract';
import { AppShell } from '@/frontend/components/app-shell';
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
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

  if (session.isLoading) {
    return (
      <AppShell title={t('users.title')}>
        <PageLayout>
          <Skeleton className="h-72 w-full" />
        </PageLayout>
      </AppShell>
    );
  }

  if (session.isError || session.data?.data.user.role !== 'admin') {
    return (
      <AppShell title={t('users.title')}>
        <PageLayout>
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>{t('users.accessRequired.title')}</AlertTitle>
            <AlertDescription>
              {t('users.accessRequired.body')}
            </AlertDescription>
          </Alert>
        </PageLayout>
      </AppShell>
    );
  }

  const currentUserId = session.data.data.user.id;
  const managedUsers = users.data?.data.users ?? [];

  return (
    <AppShell title={t('users.title')}>
      <PageLayout>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('users.heading')}</h2>
            </CardTitle>
            <CardDescription>{t('users.description')}</CardDescription>
            <CardAction>
              <Badge variant="secondary">
                {t('users.count', {
                  count: users.data?.data.totalCount ?? 0,
                })}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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

            {users.isError && (
              <Alert variant="destructive">
                <AlertTitle>{t('users.loadError.title')}</AlertTitle>
                <AlertDescription>
                  {t('users.loadError.body')}
                </AlertDescription>
              </Alert>
            )}

            {users.isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : managedUsers.length === 0 && !users.isError ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersRound />
                  </EmptyMedia>
                  <EmptyTitle>{t('users.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>{t('users.emptyBody')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('users.columns.user')}</TableHead>
                    <TableHead>{t('users.columns.email')}</TableHead>
                    <TableHead>{t('users.columns.registered')}</TableHead>
                    <TableHead className="w-36">
                      {t('users.columns.role')}
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
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar size="sm">
                              <AvatarImage
                                src={user.imageUrl}
                                alt={user.displayName}
                              />
                              <AvatarFallback>
                                {user.displayName.slice(0, 1).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">
                                {user.displayName}
                              </span>
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageLayout>
    </AppShell>
  );
}

function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      {children}
    </main>
  );
}
