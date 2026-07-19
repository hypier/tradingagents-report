import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldAlert, UsersRound } from 'lucide-react';
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
import { listManagedUsers, updateManagedUserRole } from '@/frontend/lib/auth';

export function AdminUsersPage() {
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
      toast.success('User role updated.');
    },
    onError: () => toast.error('Unable to update the user role.'),
  });

  if (session.isLoading) {
    return (
      <AppShell title="User management">
        <PageLayout>
          <Skeleton className="h-72 w-full" />
        </PageLayout>
      </AppShell>
    );
  }

  if (session.isError || session.data?.data.user.role !== 'admin') {
    return (
      <AppShell title="User management">
        <PageLayout>
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>Administrator access required</AlertTitle>
            <AlertDescription>
              Your account does not have permission to manage users.
            </AlertDescription>
          </Alert>
        </PageLayout>
      </AppShell>
    );
  }

  const currentUserId = session.data.data.user.id;
  const managedUsers = users.data?.data.users ?? [];

  return (
    <AppShell title="User management">
      <PageLayout>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Users and roles</h2>
            </CardTitle>
            <CardDescription>
              Review registered accounts and grant administrator access.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">
                {users.data?.data.totalCount ?? 0} users
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
                  <FieldLabel htmlFor="user-search">Search users</FieldLabel>
                  <Input
                    id="user-search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Name, email, or user ID"
                  />
                </Field>
                <Field className="w-auto">
                  <Button type="submit" variant="outline">
                    <Search data-icon="inline-start" />
                    Search
                  </Button>
                </Field>
              </FieldGroup>
            </form>

            {users.isError && (
              <Alert variant="destructive">
                <AlertTitle>Unable to load users</AlertTitle>
                <AlertDescription>
                  Check the Clerk connection and retry.
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
                  <EmptyTitle>No users found</EmptyTitle>
                  <EmptyDescription>
                    Adjust the search and try again.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="w-36">Role</TableHead>
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
                                <Badge variant="outline">You</Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email ?? 'No email'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'medium',
                          }).format(new Date(user.createdAt))}
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
                              aria-label={`Role for ${user.displayName}`}
                              className="w-full"
                              size="sm"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
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
