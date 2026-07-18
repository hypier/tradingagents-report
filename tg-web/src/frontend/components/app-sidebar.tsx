import * as React from 'react';
import {
  Activity,
  CreditCard,
  Settings2,
  Sparkles,
  UsersRound,
  UserRound,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const session = useAuthSession();
  const navigation = [
    { title: 'Research', icon: Activity, href: '/' },
    { title: 'Subscription', icon: CreditCard, href: '/billing' },
    { title: 'Account', icon: UserRound, href: '/account' },
    ...(session.data?.data.user.role === 'admin'
      ? [
          { title: 'User management', icon: UsersRound, href: '/admin/users' },
          {
            title: 'Payment settings',
            icon: Settings2,
            href: '/admin/billing',
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
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link to="/">
                <Sparkles />
                <span className="text-base font-semibold">TradingAgents</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.href)
                    }
                    tooltip={item.title}
                  >
                    <Link to={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 text-xs leading-relaxed text-sidebar-foreground/70">
          Research workflows are informational and do not place trades.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
