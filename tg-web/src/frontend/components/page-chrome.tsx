import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/frontend/lib/utils';

/** Ruled page title row — Signal Floor standard. */
export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Optional toolbar flush under the title row (filters, tabs). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('shrink-0 border-b border-border', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-3.5 lg:px-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <div className="mt-1 text-sm text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Filter / tab strip under PageHeader. */
export function PageToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-t border-border px-5 py-3.5 lg:px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Standard scrollable page body padding. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 lg:px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** PageHeader + PageBody column — default Signal Floor page shell. */
export function PageFrame({
  title,
  description,
  actions,
  toolbar,
  children,
  bodyClassName,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <PageHeader title={title} description={description} actions={actions}>
        {toolbar}
      </PageHeader>
      <PageBody className={bodyClassName}>{children}</PageBody>
    </div>
  );
}

/** Flat instrument panel — prefer over Card for section chrome. */
export function SectionPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border border-border bg-card', className)}>
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description ? (
              <div className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Compact metric tile — usage / overview stats. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('border border-border bg-card px-4 py-3', className)}>
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
