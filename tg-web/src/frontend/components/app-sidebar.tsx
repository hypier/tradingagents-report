import * as React from 'react';
import { FileText, LayoutDashboard, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { BrandMark } from '@/frontend/components/icons/research-icons';
import { LanguageSwitcher } from '@/frontend/components/language-switcher';
import { ThemeSwitcher } from '@/frontend/components/theme-switcher';
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

const navigation = [
  { titleKey: 'nav.desk' as const, icon: LayoutDashboard, href: '/' },
  { titleKey: 'nav.reports' as const, icon: FileText, href: '/reports' },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { t } = useTranslation('common');

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
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.href}
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
