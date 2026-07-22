import { useQuery } from '@tanstack/react-query';
import {
  CreditCard,
  FileText,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  CandlestickChart,
  ChevronRight,
  Shield,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  Globe2,
  ScrollText,
  Cpu,
  Server,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { BrandMark } from '@/frontend/components/icons/research-icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/frontend/components/ui/collapsible';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/frontend/components/ui/sidebar';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { useNavMode } from '@/frontend/hooks/use-nav-mode';
import { getBillingOverview } from '@/frontend/lib/billing';
import { formatLocaleDate } from '@/frontend/lib/format-locale';
import { fetchPublicConfig } from '@/frontend/lib/public-config';
import { cn } from '@/frontend/lib/utils';

type NavLeaf = {
  titleKey:
    | 'nav.desk'
    | 'nav.tasks'
    | 'nav.reports'
    | 'nav.quotes'
    | 'nav.watchlist'
    | 'nav.billing'
    | 'nav.account'
    | 'nav.adminOverview'
    | 'nav.adminUsers'
    | 'nav.adminAnalyses'
    | 'nav.adminBilling'
    | 'nav.adminSettings'
    | 'nav.adminMarkets'
    | 'nav.adminAudit'
    | 'nav.adminLlmProviders'
    | 'nav.adminLlmModels';
  icon: typeof LayoutDashboard;
  href: string;
};

type AdminNavEntry =
  | { kind: 'leaf'; item: NavLeaf }
  | {
      kind: 'group';
      titleKey: 'nav.adminLlm';
      icon: typeof LayoutDashboard;
      matchPrefix: string;
      children: NavLeaf[];
    };

type AdminNavSection = {
  titleKey:
    | 'nav.adminOpsGroup'
    | 'nav.adminBillingGroup'
    | 'nav.adminPlatformGroup'
    | 'nav.adminAuditGroup';
  entries: AdminNavEntry[];
};

const researchNavigation: NavLeaf[] = [
  { titleKey: 'nav.desk', icon: LayoutDashboard, href: '/' },
  { titleKey: 'nav.tasks', icon: ListTodo, href: '/tasks' },
  { titleKey: 'nav.reports', icon: FileText, href: '/reports' },
];

const quotesNavigation: NavLeaf = {
  titleKey: 'nav.quotes',
  icon: CandlestickChart,
  href: '/quotes',
};

const watchlistNavigation: NavLeaf = {
  titleKey: 'nav.watchlist',
  icon: ListChecks,
  href: '/watchlist',
};

const accountNavigation: NavLeaf[] = [
  { titleKey: 'nav.billing', icon: CreditCard, href: '/billing' },
  { titleKey: 'nav.account', icon: UserRound, href: '/account' },
];

const adminLlmChildren: NavLeaf[] = [
  {
    titleKey: 'nav.adminLlmProviders',
    icon: Server,
    href: '/admin/llm/providers',
  },
  { titleKey: 'nav.adminLlmModels', icon: Cpu, href: '/admin/llm/models' },
];

const adminSections: AdminNavSection[] = [
  {
    titleKey: 'nav.adminOpsGroup',
    entries: [
      {
        kind: 'leaf',
        item: {
          titleKey: 'nav.adminOverview',
          icon: LayoutDashboard,
          href: '/admin',
        },
      },
      {
        kind: 'leaf',
        item: {
          titleKey: 'nav.adminUsers',
          icon: UsersRound,
          href: '/admin/users',
        },
      },
      {
        kind: 'leaf',
        item: {
          titleKey: 'nav.adminAnalyses',
          icon: ListTodo,
          href: '/admin/analyses',
        },
      },
    ],
  },
  {
    titleKey: 'nav.adminBillingGroup',
    entries: [
      {
        kind: 'leaf',
        item: {
          titleKey: 'nav.adminBilling',
          icon: CreditCard,
          href: '/admin/billing',
        },
      },
    ],
  },
  {
    titleKey: 'nav.adminPlatformGroup',
    entries: [
      {
        kind: 'group',
        titleKey: 'nav.adminLlm',
        icon: Cpu,
        matchPrefix: '/admin/llm',
        children: adminLlmChildren,
      },
      {
        kind: 'leaf',
        item: {
          titleKey: 'nav.adminSettings',
          icon: SlidersHorizontal,
          href: '/admin/settings',
        },
      },
      {
        kind: 'leaf',
        item: {
          titleKey: 'nav.adminMarkets',
          icon: Globe2,
          href: '/admin/markets',
        },
      },
    ],
  },
  {
    titleKey: 'nav.adminAuditGroup',
    entries: [
      {
        kind: 'leaf',
        item: {
          titleKey: 'nav.adminAudit',
          icon: ScrollText,
          href: '/admin/audit',
        },
      },
    ],
  },
];

const floorNavButtonClass = cn(
  'relative h-11 rounded-none px-3.5 text-base font-normal tracking-wide',
  'text-sidebar-foreground/85 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground',
  'data-active:bg-sidebar-accent data-active:font-normal data-active:text-sidebar-primary',
  'data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-primary',
  'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-none before:bg-transparent before:content-[""]',
  'data-active:before:bg-sidebar-primary',
);

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const { t } = useTranslation('common');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const adminRole: boolean | null = session.isLoading ? null : isAdmin;
  const { isAdminMenu, setNavMode } = useNavMode(adminRole);
  const publicConfig = useQuery({
    queryKey: ['public-config'],
    queryFn: () => fetchPublicConfig(),
    staleTime: 60_000,
  });
  const billing = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
    staleTime: 30_000,
    enabled: !isAdminMenu,
  });
  const showWatchlist =
    publicConfig.isLoading || publicConfig.data?.features.watchlist !== false;
  const marketNavigation = showWatchlist
    ? [quotesNavigation, watchlistNavigation]
    : [quotesNavigation];
  const availableCredits = billing.data?.data.usage?.availableCredits;
  const periodEnd = billing.data?.data.usage?.periodEnd;

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-0 border-b border-sidebar-border p-0">
        <SidebarMenu className="gap-0">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="h-16 rounded-none px-3.5 hover:bg-transparent data-active:bg-transparent [&_svg]:size-8!"
            >
              <Link to={isAdminMenu ? '/admin' : '/'}>
                <BrandMark className="size-8 text-sidebar-primary" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-base font-normal tracking-tight text-sidebar-foreground">
                    {t('brand.name')}
                  </span>
                  <span className="font-mono text-xs tracking-[0.16em] text-sidebar-primary/80 uppercase">
                    {isAdminMenu ? t('brand.adminFloorTag') : t('brand.floorTag')}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-0 py-2">
        {isAdminMenu ? (
          adminSections.map((section, index) => (
            <div key={section.titleKey}>
              {index > 0 ? (
                <SidebarSeparator className="mx-3 my-2 bg-sidebar-border" />
              ) : null}
              <SidebarGroup className="gap-1 p-0">
                <SidebarGroupLabel className="h-8 px-3.5 font-mono text-xs font-normal tracking-[0.16em] text-sidebar-foreground/40 uppercase">
                  {t(section.titleKey)}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5 px-0">
                    {section.entries.map((entry) =>
                      entry.kind === 'leaf' ? (
                        <FlatNavItem
                          key={entry.item.href}
                          item={entry.item}
                          pathname={location.pathname}
                        />
                      ) : (
                        <NestedNavGroup
                          key={entry.titleKey}
                          entry={entry}
                          pathname={location.pathname}
                        />
                      ),
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          ))
        ) : (
          <>
            <SidebarGroup className="gap-1 p-0">
              <SidebarGroupLabel className="h-8 px-3.5 font-mono text-xs font-normal tracking-[0.16em] text-sidebar-foreground/40 uppercase">
                {t('nav.research')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5 px-0">
                  {researchNavigation.map((item) => (
                    <FlatNavItem
                      key={item.href}
                      item={item}
                      pathname={location.pathname}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator className="mx-3 my-2 bg-sidebar-border" />
            <SidebarGroup className="gap-1 p-0">
              <SidebarGroupLabel className="h-8 px-3.5 font-mono text-xs font-normal tracking-[0.16em] text-sidebar-foreground/40 uppercase">
                {t('nav.marketGroup')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5 px-0">
                  {marketNavigation.map((item) => (
                    <FlatNavItem
                      key={item.href}
                      item={item}
                      pathname={location.pathname}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator className="mx-3 my-2 bg-sidebar-border" />

            <SidebarGroup className="gap-1 p-0">
              <SidebarGroupLabel className="h-8 px-3.5 font-mono text-xs font-normal tracking-[0.16em] text-sidebar-foreground/40 uppercase">
                {t('nav.accountGroup')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5 px-0">
                  {accountNavigation.map((item) => (
                    <FlatNavItem
                      key={item.href}
                      item={item}
                      pathname={location.pathname}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t border-sidebar-border p-3.5">
        {isAdmin ? (
          <div
            className="grid grid-cols-2 border border-sidebar-border bg-[#151c25] p-0.5"
            role="group"
            aria-label={t('nav.modeSwitch')}
          >
            <button
              type="button"
              aria-pressed={!isAdminMenu}
              onClick={() => setNavMode('user')}
              className={cn(
                'h-9 px-2 font-mono text-xs tracking-[0.12em] uppercase transition-colors',
                !isAdminMenu
                  ? 'bg-sidebar-accent font-normal text-sidebar-primary'
                  : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80',
              )}
            >
              {t('nav.modeUser')}
            </button>
            <button
              type="button"
              aria-pressed={isAdminMenu}
              onClick={() => setNavMode('admin')}
              className={cn(
                'h-9 px-2 font-mono text-xs tracking-[0.12em] uppercase transition-colors',
                isAdminMenu
                  ? 'bg-sidebar-accent font-normal text-sidebar-primary'
                  : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80',
              )}
            >
              {t('nav.modeAdmin')}
            </button>
          </div>
        ) : null}

        {!isAdminMenu && typeof availableCredits === 'number' ? (
          <Link
            to="/billing"
            className="group block rounded-none border border-sidebar-border bg-[#151c25] px-3 py-3 transition-colors hover:border-sidebar-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xs tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                {t('nav.creditsLedger')}
              </p>
              <CreditCard className="size-4 text-sidebar-primary opacity-80 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-1.5 font-mono text-2xl font-semibold leading-none tabular-nums text-sidebar-foreground">
              <span className="mr-2 text-xs font-normal tracking-wide text-sidebar-foreground/45 uppercase">
                {t('nav.creditsLabel', { defaultValue: 'Credits' })}
              </span>
              {availableCredits}
            </p>
            {periodEnd ? (
              <p className="mt-2 font-mono text-xs text-sidebar-foreground/45">
                {t('nav.creditsCycle', {
                  date: formatLocaleDate(periodEnd, '—'),
                })}
              </p>
            ) : null}
          </Link>
        ) : null}

        {!isAdminMenu ? (
          <div className="rounded-none border border-sidebar-border/80 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 font-mono text-xs tracking-[0.12em] text-sidebar-foreground/45 uppercase">
              <Shield className="size-3.5 text-sidebar-primary/80" />
              {t('disclaimer.title')}
            </div>
            <p className="text-xs leading-relaxed text-sidebar-foreground/50">
              {t('disclaimer.body')}
            </p>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}

function FlatNavItem({
  item,
  pathname,
}: {
  item: NavLeaf;
  pathname: string;
}) {
  const { t } = useTranslation('common');
  const isActive = isNavActive(pathname, item.href);
  return (
    <SidebarMenuItem className="px-0">
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={t(item.titleKey)}
        className={floorNavButtonClass}
      >
        <Link to={item.href}>
          <item.icon className="size-5!" />
          <span>{t(item.titleKey)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NestedNavGroup({
  entry,
  pathname,
}: {
  entry: Extract<AdminNavEntry, { kind: 'group' }>;
  pathname: string;
}) {
  const { t } = useTranslation('common');
  const groupActive =
    pathname === entry.matchPrefix ||
    pathname.startsWith(`${entry.matchPrefix}/`);

  return (
    <Collapsible asChild defaultOpen={groupActive}>
      <SidebarMenuItem className="group/collapsible px-0">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={t(entry.titleKey)}
            isActive={groupActive}
            className={floorNavButtonClass}
          >
            <entry.icon className="size-5!" />
            <span>{t(entry.titleKey)}</span>
            <ChevronRight className="ml-auto size-4! transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-0 ml-3.5 border-sidebar-border px-0">
            {entry.children.map((child) => {
              const isActive = isNavActive(pathname, child.href);
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isActive}
                    className={cn(
                      'h-9 rounded-none px-3 text-sm font-normal',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary'
                        : 'text-sidebar-foreground/80',
                    )}
                  >
                    <Link to={child.href}>
                      <child.icon className="size-4!" />
                      <span>{t(child.titleKey)}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
