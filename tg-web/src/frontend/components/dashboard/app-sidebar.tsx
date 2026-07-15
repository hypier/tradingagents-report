import { Activity, FileText, Settings, Sparkles } from 'lucide-react';

import { Separator } from '../ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar';

const navigation = [{ label: 'Research', icon: Activity, active: true }, { label: 'Reports', icon: FileText, active: false }, { label: 'Settings', icon: Settings, active: false }];

export function AppSidebar() {
  return <Sidebar collapsible="offcanvas" variant="inset"><SidebarHeader><SidebarMenu><SidebarMenuItem><SidebarMenuButton size="lg" isActive><Sparkles /><span>TradingAgents</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader><Separator /><SidebarContent><SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{navigation.map(({ label, icon: Icon, active }) => <SidebarMenuItem key={label}><SidebarMenuButton isActive={active} tooltip={label}><Icon /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter><p className="px-2 text-xs leading-5 text-sidebar-foreground/70">Research workflows are informational and do not place trades.</p></SidebarFooter></Sidebar>;
}
