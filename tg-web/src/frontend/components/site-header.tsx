import { Activity } from 'lucide-react';

import { Separator } from '@/frontend/components/ui/separator';
import { SidebarTrigger } from '@/frontend/components/ui/sidebar';

export function SiteHeader({
  title = 'Research desk',
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden size-7 items-center justify-center rounded-md bg-primary/10 text-primary sm:flex">
            <Activity className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
