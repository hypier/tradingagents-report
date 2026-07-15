import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '../ui/breadcrumb';
import { Separator } from '../ui/separator';
import { SidebarTrigger } from '../ui/sidebar';

export function SiteHeader() { return <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4"><SidebarTrigger /><Separator orientation="vertical" className="h-4" /><Breadcrumb><BreadcrumbList><BreadcrumbItem>Workspace</BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Research</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb></header>; }
