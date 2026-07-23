import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

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
      <div className="flex flex-wrap items-end justify-between gap-3 px-3 py-3.5 sm:px-5 lg:px-6">
        <div className="min-w-0 flex-1 basis-[12rem]">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <div className="mt-1 text-sm text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
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
        'border-t border-border px-3 py-3.5 sm:px-5 lg:px-6',
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
  headerClassName,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  headerClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        className={headerClassName}
      >
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
  bodyClassName,
  ...props
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
} & Omit<ComponentProps<'section'>, 'title' | 'children'>) {
  return (
    <section
      className={cn('border border-border bg-card', className)}
      {...props}
    >
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
      <div className={cn('p-4', bodyClassName)}>{children}</div>
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
  iconClassName,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  /** When set, wraps the icon in a rectangular wash well. */
  iconClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('border border-border bg-card px-4 py-3', className)}>
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        {Icon ? (
          iconClassName ? (
            <span
              className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center border',
                iconClassName,
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
          ) : (
            <Icon className="size-4 shrink-0" aria-hidden />
          )
        ) : null}
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-2xl font-semibold tabular-nums tracking-tight',
          valueClassName,
        )}
      >
        {value}
      </p>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
