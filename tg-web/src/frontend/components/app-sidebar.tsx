import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Settings2,
  Shield,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  Globe2,
  ScrollText,
  Cpu,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { BrandMark } from '@/frontend/components/icons/research-icons';
import { LanguageSwitcher } from '@/frontend/components/language-switcher';
import { ThemeSwitcher } from '@/frontend/components/theme-switcher';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/frontend/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/frontend/components/ui/sidebar';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { getBillingOverview } from '@/frontend/lib/billing';
import { fetchPublicConfig } from '@/frontend/lib/public-config';
import { cn } from '@/frontend/lib/utils';

type NavLeaf = {
  titleKey:
    | 'nav.desk'
    | 'nav.tasks'
    | 'nav.reports'
    | 'nav.watchlist'
    | 'nav.billing'
    | 'nav.account'
    | 'nav.adminOverview'
    | 'nav.adminUsers'
    | 'nav.adminAnalyses'
    | 'nav.adminBilling'
    | 'nav.adminModels'
    | 'nav.adminSettings'
    | 'nav.adminMarkets'
    | 'nav.adminAudit';
  icon: typeof LayoutDashboard;
  href: string;
};

const researchNavigationBase: NavLeaf[] = [
  { titleKey: 'nav.desk', icon: LayoutDashboard, href: '/' },
  { titleKey: 'nav.tasks', icon: ListTodo, href: '/tasks' },
  { titleKey: 'nav.reports', icon: FileText, href: '/reports' },
  { titleKey: 'nav.watchlist', icon: ListChecks, href: '/watchlist' },
];

const accountNavigation: NavLeaf[] = [
  { titleKey: 'nav.billing', icon: CreditCard, href: '/billing' },
  { titleKey: 'nav.account', icon: UserRound, href: '/account' },
];

const adminNavigation: NavLeaf[] = [
  { titleKey: 'nav.adminOverview', icon: LayoutDashboard, href: '/admin' },
  { titleKey: 'nav.adminUsers', icon: UsersRound, href: '/admin/users' },
  { titleKey: 'nav.adminAnalyses', icon: ListTodo, href: '/admin/analyses' },
  { titleKey: 'nav.adminBilling', icon: CreditCard, href: '/admin/billing' },
  { titleKey: 'nav.adminModels', icon: Cpu, href: '/admin/models' },
  {
    titleKey: 'nav.adminSettings',
    icon: SlidersHorizontal,
    href: '/admin/settings',
  },
  { titleKey: 'nav.adminMarkets', icon: Globe2, href: '/admin/markets' },
  { titleKey: 'nav.adminAudit', icon: ScrollText, href: '/admin/audit' },
];

const floorNavButtonClass = cn(
  'relative h-12 rounded-none px-3.5 text-base font-medium tracking-wide',
  'text-sidebar-foreground/55 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground',
  'data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-primary',
  'data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-primary',
  'before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-none before:bg-transparent before:content-[""]',
  'data-active:before:bg-sidebar-primary',
);

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { t } = useTranslation('common');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const publicConfig = useQuery({
    queryKey: ['public-config'],
    queryFn: () => fetchPublicConfig(),
    staleTime: 60_000,
  });
  const billing = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
    staleTime: 30_000,
  });
  const showWatchlist =
    publicConfig.isLoading || publicConfig.data?.features.watchlist !== false;
  const researchNavigation = showWatchlist
    ? researchNavigationBase
    : researchNavigationBase.filter((item) => item.href !== '/watchlist');
  const availableCredits = billing.data?.data.usage?.availableCredits;
  const periodEnd = billing.data?.data.usage?.periodEnd;

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-0 border-b border-sidebar-border p-0">
        <SidebarMenu className="gap-0">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-16 rounded-none px-3.5 hover:bg-transparent data-active:bg-transparent [&_svg]:size-8!"
            >
              <Link to="/">
                <BrandMark className="size-8 text-sidebar-primary" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">
                    {t('brand.name')}
                  </span>
                  <span className="font-mono text-xs tracking-[0.16em] text-sidebar-primary/80 uppercase">
                    {t('brand.floorTag')}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-0 py-2">
        <SidebarGroup className="gap-1 p-0">
          <SidebarGroupLabel className="h-8 px-3.5 font-mono text-xs tracking-[0.16em] text-sidebar-foreground/40 uppercase">
            {t('nav.research')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-0">
              {researchNavigation.map((item) => (
                <FlatNavItem
                  key={item.href}
                  item={item}
                  pathname={location.pathname}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-3 my-2 bg-sidebar-border" />

        <SidebarGroup className="gap-1 p-0">
          <SidebarGroupLabel className="h-8 px-3.5 font-mono text-xs tracking-[0.16em] text-sidebar-foreground/40 uppercase">
            {t('nav.accountGroup')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-0">
              {accountNavigation.map((item) => (
                <FlatNavItem
                  key={item.href}
                  item={item}
                  pathname={location.pathname}
                />
              ))}
              {isAdmin ? (
                <AdminNavSection pathname={location.pathname} />
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t border-sidebar-border p-3.5">
        {typeof availableCredits === 'number' ? (
          <Link
            to="/billing"
            className="group block rounded-none border border-sidebar-border bg-[#151c25] px-3 py-3 transition-colors hover:border-sidebar-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xs tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                {t('nav.creditsLedger')}
              </p>
              <CreditCard className="size-4 text-sidebar-primary opacity-80 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-1.5 font-mono text-2xl font-semibold leading-none tabular-nums text-sidebar-foreground">
              <span className="mr-2 text-xs font-medium tracking-wide text-sidebar-foreground/45 uppercase">
                {t('nav.creditsLabel', { defaultValue: 'Credits' })}
              </span>
              {availableCredits}
            </p>
            {periodEnd ? (
              <p className="mt-2 font-mono text-xs text-sidebar-foreground/45">
                {t('nav.creditsCycle', {
                  date: new Date(periodEnd * 1000).toLocaleDateString(),
                })}
              </p>
            ) : null}
          </Link>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <ThemeSwitcher className="gap-0.5 [&_button]:size-9 [&_button]:rounded-none [&_button]:text-sidebar-foreground/60 [&_button[aria-pressed=true]]:bg-sidebar-accent [&_button[aria-pressed=true]]:text-sidebar-primary" />
          <LanguageSwitcher className="h-9 min-w-0 border-sidebar-border bg-transparent text-sm text-sidebar-foreground/70" />
        </div>

        <div className="rounded-none border border-sidebar-border/80 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-xs tracking-[0.12em] text-sidebar-foreground/45 uppercase">
            <Shield className="size-3.5 text-sidebar-primary/80" />
            {t('disclaimer.title')}
          </div>
          <p className="text-xs leading-relaxed text-sidebar-foreground/50">
            {t('disclaimer.body')}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function FlatNavItem({
  item,
  pathname,
}: {
  item: NavLeaf;
  pathname: string;
}) {
  const { t } = useTranslation('common');
  const isActive = isNavActive(pathname, item.href);
  return (
    <SidebarMenuItem className="px-0">
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={t(item.titleKey)}
        className={floorNavButtonClass}
      >
        <Link to={item.href}>
          <item.icon className="size-5!" />
          <span>{t(item.titleKey)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AdminNavSection({ pathname }: { pathname: string }) {
  const { t } = useTranslation('common');
  const hasActive = adminNavigation.some((item) =>
    isNavActive(pathname, item.href),
  );
  const [open, setOpen] = React.useState(hasActive);

  React.useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={t('nav.admin')}
            className={floorNavButtonClass}
          >
            <Settings2 className="size-4!" />
            <span>{t('nav.admin')}</span>
            <ChevronRight className="ml-auto size-4! opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-0 ml-0 border-l border-sidebar-border px-0 py-1">
            {adminNavigation.map((item) => {
              const isActive = isNavActive(pathname, item.href);
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActive}
                    className={cn(
                      'relative h-10 rounded-none pl-6 text-sm text-sidebar-foreground/50',
                      'hover:bg-sidebar-accent/40 hover:text-sidebar-foreground',
                      'data-active:bg-sidebar-accent data-active:text-sidebar-primary',
                      'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-none before:bg-transparent before:content-[""]',
                      'data-active:before:bg-sidebar-primary',
                    )}
                  >
                    <Link to={item.href}>
                      <item.icon className="size-4!" />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
