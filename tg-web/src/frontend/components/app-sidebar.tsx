import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
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
} from '@/frontend/components/ui/sidebar';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { fetchPublicConfig } from '@/frontend/lib/public-config';

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

type NavSection = {
  titleKey: 'nav.research' | 'nav.accountGroup' | 'nav.admin';
  icon: typeof LayoutDashboard;
  items: NavLeaf[];
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
  { titleKey: 'nav.adminOverview', icon: Activity, href: '/admin' },
  { titleKey: 'nav.adminUsers', icon: UsersRound, href: '/admin/users' },
  { titleKey: 'nav.adminAnalyses', icon: ListTodo, href: '/admin/analyses' },
  {
    titleKey: 'nav.adminBilling',
    icon: Settings2,
    href: '/admin/billing',
  },
  { titleKey: 'nav.adminModels', icon: Cpu, href: '/admin/models' },
  {
    titleKey: 'nav.adminSettings',
    icon: SlidersHorizontal,
    href: '/admin/settings',
  },
  { titleKey: 'nav.adminMarkets', icon: Globe2, href: '/admin/markets' },
  { titleKey: 'nav.adminAudit', icon: ScrollText, href: '/admin/audit' },
];

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionHasActive(pathname: string, items: NavLeaf[]) {
  return items.some((item) => isNavActive(pathname, item.href));
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
  const showWatchlist =
    publicConfig.isLoading || publicConfig.data?.features.watchlist !== false;
  const researchNavigation = showWatchlist
    ? researchNavigationBase
    : researchNavigationBase.filter((item) => item.href !== '/watchlist');

  const sections: NavSection[] = [
    {
      titleKey: 'nav.research',
      icon: LayoutDashboard,
      items: researchNavigation,
    },
    {
      titleKey: 'nav.accountGroup',
      icon: UserRound,
      items: accountNavigation,
    },
    ...(isAdmin
      ? [
          {
            titleKey: 'nav.admin' as const,
            icon: Shield,
            items: adminNavigation,
          },
        ]
      : []),
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="data-[slot=sidebar-menu-button]:p-1.5! [&_svg]:size-10!"
            >
              <Link to="/">
                <BrandMark className="size-10 text-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold tracking-tight">
                    {t('brand.name')}
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {t('brand.tagline')}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.workspace')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((section) => (
                <NavSectionItem
                  key={section.titleKey}
                  section={section}
                  pathname={location.pathname}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
        <div className="rounded-lg border bg-sidebar-accent/40 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-sidebar-foreground/90">
            <Shield className="size-3.5 text-primary" />
            {t('disclaimer.title')}
          </div>
          <p className="text-[11px] leading-relaxed text-sidebar-foreground/75">
            {t('disclaimer.body')}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavSectionItem({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  const { t } = useTranslation('common');
  const hasActive = sectionHasActive(pathname, section.items);
  const [open, setOpen] = React.useState(
    () => hasActive || section.titleKey !== 'nav.admin',
  );

  React.useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  const title = t(section.titleKey);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={title}>
            <section.icon />
            <span>{title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {section.items.map((item) => {
              const itemTitle = t(item.titleKey);
              const isActive = isNavActive(pathname, item.href);
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={isActive}>
                    <Link to={item.href}>
                      <item.icon />
                      <span>{itemTitle}</span>
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
