import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { AppSidebar } from './app-sidebar';
import { SiteHeader } from './site-header';
import { SidebarInset, SidebarProvider } from './ui/sidebar';
import { fetchPublicConfig } from '@/frontend/lib/public-config';

export function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { i18n } = useTranslation();
  const publicConfig = useQuery({
    queryKey: ['public-config'],
    queryFn: () => fetchPublicConfig(),
    staleTime: 60_000,
  });
  const maintenance = publicConfig.data?.maintenance;
  const locale = i18n.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const maintenanceMessage =
    maintenance?.message[locale] ||
    maintenance?.message.en ||
    maintenance?.message.zh ||
    '';

  return (
    <SidebarProvider
      className="min-h-svh"
      style={
        {
          '--sidebar-width': '15.5rem',
          '--header-height': '3.25rem',
        } as CSSProperties
      }
    >
      <AppSidebar variant="sidebar" />
      <SidebarInset className="flex min-h-svh min-w-0 flex-1 flex-col bg-background">
        {maintenance?.enabled ? (
          <div className="border-b border-primary/40 bg-primary/10 px-4 py-2 text-center text-sm text-foreground lg:px-6">
            {maintenanceMessage ||
              (locale === 'zh'
                ? '系统维护中，部分功能可能暂时不可用。'
                : 'System maintenance is in progress. Some features may be unavailable.')}
          </div>
        ) : null}
        <SiteHeader title={title} />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
