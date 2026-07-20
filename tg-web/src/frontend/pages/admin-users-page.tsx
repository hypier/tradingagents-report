import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Minus,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/frontend/components/ui/toggle-group';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import {
  adjustManagedUserCredits,
  listManagedUsers,
  updateManagedUserRole,
} from '@/frontend/lib/auth';

export function AdminUsersPage() {
  const { t } = useTranslation('admin');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState<string>();
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    displayName: string;
    availableCredits: number;
  } | null>(null);
  const [adjustmentMode, setAdjustmentMode] = useState<'increase' | 'decrease'>(
    'increase',
  );
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
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
  const adjustCredits = useMutation({
    mutationFn: ({
      userId,
      delta,
      reason,
    }: {
      userId: string;
      delta: number;
      reason?: string;
    }) =>
      adjustManagedUserCredits(userId, {
        adjustmentId: crypto.randomUUID(),
        delta,
        reason,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setSelectedUser(null);
      setAdjustmentAmount('');
      setAdjustmentReason('');
      toast.success(t('users.credits.updated'));
    },
    onError: () => toast.error(t('users.credits.updateError')),
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
                <AlertDescription>{t('users.loadError.body')}</AlertDescription>
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
                    <TableHead className="text-right">
                      {t('users.columns.credits')}
                    </TableHead>
                    <TableHead className="w-20">
                      <span className="sr-only">
                        {t('users.columns.actions')}
                      </span>
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
                                <Badge variant="outline">
                                  {t('users.you')}
                                </Badge>
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
                        <TableCell className="text-right tabular-nums">
                          {user.availableCredits}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title={t('users.credits.adjustAria', {
                              name: user.displayName,
                            })}
                            aria-label={t('users.credits.adjustAria', {
                              name: user.displayName,
                            })}
                            onClick={() => {
                              setSelectedUser({
                                id: user.id,
                                displayName: user.displayName,
                                availableCredits: user.availableCredits,
                              });
                              setAdjustmentMode('increase');
                              setAdjustmentAmount('');
                              setAdjustmentReason('');
                            }}
                          >
                            <SlidersHorizontal />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Dialog
          open={selectedUser !== null}
          onOpenChange={(open) => !open && setSelectedUser(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('users.credits.title')}</DialogTitle>
              <DialogDescription>
                {t('users.credits.description', {
                  name: selectedUser?.displayName,
                })}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedUser) return;
                const amount = Number(adjustmentAmount);
                if (
                  !Number.isSafeInteger(amount) ||
                  amount < 1 ||
                  amount > 1_000_000
                )
                  return;
                adjustCredits.mutate({
                  userId: selectedUser.id,
                  delta: adjustmentMode === 'increase' ? amount : -amount,
                  reason: adjustmentReason.trim() || undefined,
                });
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel>{t('users.credits.direction')}</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={adjustmentMode}
                    onValueChange={(value) =>
                      value &&
                      setAdjustmentMode(value as 'increase' | 'decrease')
                    }
                  >
                    <ToggleGroupItem value="increase">
                      <Plus data-icon="inline-start" />{' '}
                      {t('users.credits.increase')}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="decrease">
                      <Minus data-icon="inline-start" />{' '}
                      {t('users.credits.decrease')}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="credit-adjustment-amount">
                    {t('users.credits.points')}
                  </FieldLabel>
                  <Input
                    id="credit-adjustment-amount"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="1000000"
                    step="1"
                    required
                    value={adjustmentAmount}
                    onChange={(event) =>
                      setAdjustmentAmount(event.target.value)
                    }
                  />
                  {selectedUser && adjustmentAmount && (
                    <FieldDescription>
                      {t('users.credits.balancePreview', {
                        count:
                          selectedUser.availableCredits +
                          (adjustmentMode === 'increase' ? 1 : -1) *
                            Number(adjustmentAmount || 0),
                      })}
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="credit-adjustment-reason">
                    {t('users.credits.note')}
                  </FieldLabel>
                  <Input
                    id="credit-adjustment-reason"
                    maxLength={500}
                    value={adjustmentReason}
                    onChange={(event) =>
                      setAdjustmentReason(event.target.value)
                    }
                  />
                </Field>
              </FieldGroup>
              <DialogFooter className="mt-4">
                <Button
                  type="submit"
                  disabled={
                    adjustCredits.isPending ||
                    !adjustmentAmount ||
                    (adjustmentMode === 'decrease' &&
                      Number(adjustmentAmount) >
                        (selectedUser?.availableCredits ?? 0))
                  }
                >
                  {t('users.credits.apply')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
