import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useAccountMenu } from '@/frontend/app/account-menu';
import { Separator } from '@/frontend/components/ui/separator';
import { SidebarTrigger } from '@/frontend/components/ui/sidebar';

function headerTitleKey(pathname: string) {
  if (pathname.startsWith('/admin/billing')) return 'header.adminBilling' as const;
  if (pathname.startsWith('/admin/users')) return 'header.adminUsers' as const;
  if (pathname.startsWith('/billing')) return 'header.billing' as const;
  if (pathname.startsWith('/account')) return 'header.account' as const;
  if (pathname.startsWith('/legal')) return 'header.legal' as const;
  if (pathname.startsWith('/reports/')) return 'header.report' as const;
  if (pathname.startsWith('/reports')) return 'header.reports' as const;
  if (pathname.startsWith('/watchlist')) return 'header.watchlist' as const;
  if (pathname.startsWith('/stocks/')) return 'header.stock' as const;
  if (pathname.startsWith('/tasks')) return 'header.tasks' as const;
  return 'header.desk' as const;
}

export function SiteHeader({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const location = useLocation();
  const { t } = useTranslation('common');
  const accountMenu = useAccountMenu();
  const resolvedTitle = title ?? t(headerTitleKey(location.pathname));

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden size-7 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
            <Activity className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
              {resolvedTitle}
            </h1>
            {subtitle ? (
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {accountMenu ? <div className="ml-auto">{accountMenu}</div> : null}
      </div>
    </header>
  );
}
