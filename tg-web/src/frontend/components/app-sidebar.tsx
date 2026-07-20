import * as React from 'react';
import {
  CreditCard,
  FileText,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Settings2,
  Shield,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { BrandMark } from '@/frontend/components/icons/research-icons';
import { LanguageSwitcher } from '@/frontend/components/language-switcher';
import { ThemeSwitcher } from '@/frontend/components/theme-switcher';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
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
} from '@/frontend/components/ui/sidebar';

const baseNavigation = [
  { titleKey: 'nav.desk' as const, icon: LayoutDashboard, href: '/' },
  { titleKey: 'nav.tasks' as const, icon: ListTodo, href: '/tasks' },
  { titleKey: 'nav.reports' as const, icon: FileText, href: '/reports' },
  { titleKey: 'nav.watchlist' as const, icon: ListChecks, href: '/watchlist' },
  { titleKey: 'nav.billing' as const, icon: CreditCard, href: '/billing' },
  { titleKey: 'nav.account' as const, icon: UserRound, href: '/account' },
];

const adminNavigation = [
  {
    titleKey: 'nav.adminUsers' as const,
    icon: UsersRound,
    href: '/admin/users',
  },
  {
    titleKey: 'nav.adminBilling' as const,
    icon: Settings2,
    href: '/admin/billing',
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { t } = useTranslation('common');
  const session = useAuthSession();
  const navigation = [
    ...baseNavigation,
    ...(session.data?.data.user.role === 'admin' ? adminNavigation : []),
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
              {navigation.map((item) => {
                const title = t(item.titleKey);
                const isActive =
                  item.href === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={title}
                    >
                      <Link to={item.href}>
                        <item.icon />
                        <span>{title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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
