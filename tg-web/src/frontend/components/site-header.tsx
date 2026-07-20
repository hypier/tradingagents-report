import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useAccountMenu } from '@/frontend/app/account-menu';
import { LanguageSwitcher } from '@/frontend/components/language-switcher';
import { ThemeSwitcher } from '@/frontend/components/theme-switcher';
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

/** Pages that render their own PageHeader / ruled H1 — skip chrome title. */
function pageOwnsTitle(pathname: string) {
  if (pathname === '/') return true;
  if (pathname === '/tasks') return true;
  if (pathname === '/reports' || pathname.startsWith('/reports/')) return true;
  if (pathname === '/watchlist') return true;
  if (pathname === '/billing') return true;
  if (pathname === '/account') return true;
  if (pathname.startsWith('/stocks/')) return true;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  return false;
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
  const showTitle =
    Boolean(title) || !pageOwnsTitle(location.pathname);
  const resolvedTitle = title ?? t(headerTitleKey(location.pathname));

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/90 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-4 lg:gap-3 lg:px-5">
        <SidebarTrigger className="-ml-1" />
        {showTitle ? (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 data-[orientation=vertical]:h-5"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold tracking-tight text-foreground md:text-base">
                {resolvedTitle}
              </h1>
              {subtitle ? (
                <p className="truncate text-sm text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeSwitcher className="gap-0.5 [&_button]:size-8 [&_button]:rounded-none" />
          <LanguageSwitcher className="h-8 min-w-[7.5rem] rounded-none border-border bg-transparent px-2.5 text-sm" />
          {accountMenu}
        </div>
      </div>
    </header>
  );
}
