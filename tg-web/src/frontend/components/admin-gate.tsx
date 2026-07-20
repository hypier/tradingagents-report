import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { AppShell } from '@/frontend/components/app-shell';
import { PageBody } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';

/**
 * Shared admin page gate: session loading, non-admin denial, then AppShell + children.
 * Pass `loading` for extra waits (e.g. admin data fetch) once role is confirmed.
 */
export function AdminGate({
  accessTitle,
  accessBody,
  loading = false,
  children,
}: {
  accessTitle: string;
  accessBody: string;
  loading?: boolean;
  children: ReactNode;
}) {
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';

  if (session.isLoading || (isAdmin && loading)) {
    return (
      <AppShell>
        <PageBody>
          <Skeleton className="h-72 w-full" />
        </PageBody>
      </AppShell>
    );
  }

  if (session.isError || !isAdmin) {
    return (
      <AppShell>
        <PageBody>
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>{accessTitle}</AlertTitle>
            <AlertDescription>{accessBody}</AlertDescription>
          </Alert>
        </PageBody>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}
