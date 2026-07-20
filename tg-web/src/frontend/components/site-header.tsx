import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useAccountMenu } from '@/frontend/app/account-menu';
import { Separator } from '@/frontend/components/ui/separator';
import { SidebarTrigger } from '@/frontend/components/ui/sidebar';

function headerTitleKey(pathname: string) {
  if (pathname.startsWith('/admin/billing')) return 'header.adminBilling' as const;
  if (pathname.startsWith('/admin/analyses')) return 'header.adminAnalyses' as const;
  if (pathname.startsWith('/admin/models')) return 'header.adminModels' as const;
  if (pathname.startsWith('/admin/settings')) return 'header.adminSettings' as const;
  if (pathname.startsWith('/admin/markets')) return 'header.adminMarkets' as const;
  if (pathname.startsWith('/admin/audit')) return 'header.adminAudit' as const;
  if (pathname.startsWith('/admin/users/')) return 'header.adminUser' as const;
  if (pathname.startsWith('/admin/users')) return 'header.adminUsers' as const;
  if (pathname === '/admin' || pathname.startsWith('/admin/'))
    return 'header.adminOverview' as const;
  if (pathname.startsWith('/billing')) return 'header.billing' as const;
  if (pathname.startsWith('/account')) return 'header.account' as const;
  if (pathname.startsWith('/legal')) return 'header.legal' as const;
  if (pathname.startsWith('/shared/')) return 'header.sharedReport' as const;
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
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/90 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-4 lg:gap-3 lg:px-5">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-1 data-[orientation=vertical]:h-5"
        />
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-foreground md:text-base">
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
