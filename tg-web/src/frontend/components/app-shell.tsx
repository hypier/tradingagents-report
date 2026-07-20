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
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 64)',
          '--header-height': 'calc(var(--spacing) * 14)',
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="bg-background">
        {maintenance?.enabled ? (
          <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-950 dark:text-amber-100 lg:px-6">
            {maintenanceMessage ||
              (locale === 'zh'
                ? '系统维护中，部分功能可能暂时不可用。'
                : 'System maintenance is in progress. Some features may be unavailable.')}
          </div>
        ) : null}
        <SiteHeader title={title} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
