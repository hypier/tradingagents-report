# TG-Web Shadcn UI Standardization Design

## Goal

Replace the custom presentation layer across `tg-web` with a consistent,
standard shadcn/ui component set. Keep research jobs, API contracts, React
Query behavior, and report content unchanged.

## Scope

- Use the Dashboard layout pattern: responsive `SidebarProvider`, `Sidebar`,
  `SidebarInset`, a compact site header, and one scrollable content area.
- Install and compose official shadcn/ui primitives for navigation, form
  fields, feedback, tables, empty/loading states, dialogs, tabs, and alerts.
- Replace the custom `command-panel` and `eyebrow` CSS surfaces with standard
  shadcn `Card` composition and semantic theme tokens.
- Make the research form use `FieldGroup` and `Field`; make the analyst set a
  standard `ToggleGroup`; make system errors `Alert`; make empty states
  `Empty`; and make report content a `ScrollArea` inside `Dialog` and `Tabs`.
- Use the existing green primary color through theme variables, not component
  specific color overrides.

## Exclusions

- Do not import dashboard example data, charts, drag-and-drop tables, or other
  unrelated `dashboard-01` feature code.
- Do not change API routes, request payloads, research job state, polling, or
  data-provider behavior.
- Do not implement new navigation destinations for Reports or Settings. The
  new sidebar will preserve their current inert state until those pages exist.

## Component Mapping

| Current surface | Standard component composition |
| --- | --- |
| Custom desktop/mobile navigation | `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `Sheet` |
| Page heading and path | `Breadcrumb`, `Button`, header layout |
| New research assignment | `Card`, `FieldGroup`, `Field`, `Input`, `Select`, `ToggleGroup`, `Button`, `Alert` |
| Live research pipeline | `Card`, `Badge`, `Progress`, `ScrollArea`, `Skeleton`, `Empty` |
| Market snapshot | `Card`, `Badge`, `Skeleton`, `Empty` |
| Research library | `Card`, `Table`, `DropdownMenu`, `Skeleton`, `Empty`, `Alert` |
| Research report | `Dialog`, `Tabs`, `ScrollArea`, `Skeleton`, `Empty`, `Alert` |
| Submission feedback | `Sonner` toast and an inline `Alert` when context is needed |

## Responsive Behavior

The sidebar becomes an off-canvas Sheet below the desktop breakpoint. The
research form uses one column on narrow screens and a dashboard grid on larger
screens. The reports table retains a horizontal scroll container rather than
compressing or clipping columns. Report tabs scroll horizontally and report
text wraps without expanding the dialog.

## Validation

- Run TypeScript, ESLint, unit, and browser tests for `tg-web`.
- Verify desktop and mobile viewport rendering in the local browser.
- Test research submission validation, report-dialog opening, loading,
  error, and empty states.

