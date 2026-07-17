import * as React from 'react';
import { FileText, LayoutDashboard, Shield } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { BrandMark } from '@/frontend/components/icons/research-icons';
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
  { title: 'Desk', icon: LayoutDashboard, href: '/' },
  { title: 'Reports', icon: FileText, href: '/#reports' },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();

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
                <BrandMark className="size-8 text-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold tracking-tight">
                    TradingAgents
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    Multi-agent research
                  </span>
                </span>
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
                      item.title === 'Desk' && location.pathname === '/'
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
        <div className="rounded-lg border bg-sidebar-accent/40 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-sidebar-foreground/90">
            <Shield className="size-3.5 text-primary" />
            Research only
          </div>
          <p className="text-[11px] leading-relaxed text-sidebar-foreground/75">
            Outputs are informational and do not place trades.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
