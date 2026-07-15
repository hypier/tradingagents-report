# TG-Web Shadcn UI Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize every TG-Web screen on official shadcn/ui components while preserving research-job behavior and API contracts.

**Architecture:** Add the official shadcn/ui dashboard primitives needed by the application, then compose them into a responsive shell around the existing research data flow. Existing page components retain ownership of query and mutation behavior; dashboard and page components only render their supplied data using standard primitives.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix base), TanStack Query, Vitest, Playwright.

## Global Constraints

- Keep all API routes, request payloads, React Query query keys, polling, and Core research behavior unchanged.
- Use official shadcn/ui components and semantic theme tokens; remove custom `command-panel` and `eyebrow` surfaces.
- Retain the green primary color through global theme variables only.
- Do not import `dashboard-01` sample data, charts, drag-and-drop tables, or new product flows.
- Do not commit, create a branch, or overwrite unrelated user changes.

---

## File Structure

- `tg-web/src/frontend/components/ui/`: official shadcn primitives installed by the CLI.
- `tg-web/src/frontend/components/dashboard/app-sidebar.tsx`: application navigation composed from `Sidebar` primitives.
- `tg-web/src/frontend/components/dashboard/site-header.tsx`: breadcrumb and mobile-sidebar trigger.
- `tg-web/src/frontend/components/dashboard/*`: dashboard data surfaces rendered through Cards, Tables, alerts, empties, and scroll areas.
- `tg-web/src/frontend/pages/home-page.tsx`: research form and dashboard composition; owns queries and mutation.
- `tg-web/src/frontend/pages/not-found-page.tsx`: standard shadcn empty-state 404.
- `tg-web/src/frontend/styles/globals.css`: shadcn v4 semantic tokens and no custom component surfaces.
- `tg-web/src/frontend/app/app.tsx`: global providers, including `SidebarProvider` and `Toaster` only where appropriate.
- `tg-web/tests/unit/frontend-app.test.tsx` and `tg-web/tests/e2e/app.spec.ts`: regression coverage for the dashboard and report dialog.

### Task 1: Install the standard component baseline and theme

**Files:**
- Create: `tg-web/src/frontend/components/ui/{alert,breadcrumb,empty,field,scroll-area,sonner,sidebar}.tsx`
- Create: `tg-web/src/frontend/hooks/use-mobile.ts`
- Modify: `tg-web/src/frontend/components/ui/{button,input,separator,sheet,skeleton,tooltip}.tsx`
- Modify: `tg-web/src/frontend/styles/globals.css`
- Modify: `tg-web/package.json`

**Interfaces:**
- Consumes: existing shadcn `components.json` aliases and Tailwind v4 CSS file.
- Produces: standard primitives imported as `@/frontend/components/ui/<name>`.

- [ ] **Step 1: Install the official primitives through the project package runner**

Run:
```bash
cd tg-web
pnpm dlx shadcn@latest add sidebar breadcrumb field alert empty scroll-area sonner
```

Expected: official files are added under `src/frontend/components/ui`, the existing compatible primitives are refreshed, and required runtime dependencies are added.

- [ ] **Step 2: Remove custom surface CSS while retaining semantic green tokens**

Keep the `--primary`, `--secondary`, and `--ring` values in `globals.css`; remove `.command-panel` and `.eyebrow`. The page must render all containers through `Card`, `Empty`, and `Alert` rather than these classes.

- [ ] **Step 3: Verify the primitive baseline**

Run:
```bash
cd tg-web
pnpm typecheck
pnpm lint
```

Expected: both commands exit with code 0 before dashboard composition begins.

### Task 2: Replace the application shell and all dashboard surfaces

**Files:**
- Create: `tg-web/src/frontend/components/dashboard/site-header.tsx`
- Modify: `tg-web/src/frontend/app/app.tsx`
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Modify: `tg-web/src/frontend/pages/not-found-page.tsx`
- Modify: `tg-web/src/frontend/components/dashboard/{app-sidebar,pipeline-panel,recent-reports,report-dialog}.tsx`

**Interfaces:**
- Consumes: `AnalysisJob`, `AnalysisEvent`, `createResearch`, `getMarketSnapshot`, `getResearchEvents`, `listResearch`, and `getResearch` without changing signatures.
- Produces: a responsive sidebar dashboard with semantic status, loading, error, and empty states.

- [ ] **Step 1: Convert the shell to the standard dashboard layout**

Use the following component hierarchy:
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <SiteHeader />
    <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">...</main>
  </SidebarInset>
</SidebarProvider>
```

`AppSidebar` must use `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`, and `SidebarMenuButton`. It must use the sidebar's built-in off-canvas behavior on mobile rather than a separate hand-written layout.

- [ ] **Step 2: Convert the research assignment to standard fields and feedback**

Use `CardHeader`, `CardTitle`, `CardDescription`, and `CardContent`. Structure controls with:
```tsx
<FieldGroup className="grid gap-4 lg:grid-cols-[minmax(180px,1.25fr)_minmax(150px,.75fr)_minmax(150px,.75fr)_auto]">
  <Field>...</Field>
</FieldGroup>
```

Use `FieldLabel`, existing `Input`/`Select`, `ToggleGroup`, and `Button`. Render mutation failures with `Alert` and successful submissions with `toast()` from `sonner` after invalidating the existing `['analyses']` query.

- [ ] **Step 3: Replace each data surface with standard stateful components**

Use full `Card` composition for Pipeline, Snapshot, and Recent Reports. Use `Badge` variants for job states, `Progress` for completion, `Skeleton` while data loads, `Alert` for query failures, and `Empty` for no job/snapshot/report conditions. Wrap the reports table in `ScrollArea` to preserve columns on narrow viewports. Wrap report tab content in `ScrollArea` and use a semantic `pre` block that wraps long report text.

- [ ] **Step 4: Convert the 404 page to an Empty state**

Use `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, and an outline `Button` that returns to the existing `/` route. Do not add a new route.

- [ ] **Step 5: Verify the application behavior**

Run:
```bash
cd tg-web
pnpm typecheck
pnpm lint
pnpm test:unit
```

Expected: type checking, linting, and unit tests pass. The rendered home page still has a `main` landmark, the sequential-agent heading, and the recent-reports heading.

### Task 3: Cover the refactor and validate display behavior

**Files:**
- Modify: `tg-web/tests/unit/frontend-app.test.tsx`
- Modify: `tg-web/tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: the public landmarks, headings, report action menu, and dialog behavior from Task 2.
- Produces: regression tests for the standard component dashboard and manual browser verification at desktop and mobile widths.

- [ ] **Step 1: Extend unit coverage for state surfaces**

Render `App` with the existing router and assert the `main` landmark, Dashboard research heading, and reports heading. Add a mocked failed analyses request assertion for the `Alert` role, and assert the no-report state is exposed as an Empty component rather than plain custom text.

- [ ] **Step 2: Keep and extend browser coverage**

Preserve the completed-report test. Add checks that the dashboard has a navigation landmark on desktop and that the report dialog remains visible after selecting `View report`.

- [ ] **Step 3: Run all targeted checks**

Run:
```bash
cd tg-web
pnpm test:unit
pnpm test:e2e
pnpm build
```

Expected: all commands exit with code 0.

- [ ] **Step 4: Inspect desktop and mobile layout in the local browser**

At the normal desktop viewport, verify that the sidebar, header, Cards, and report table are visible without overlaps. At a 390 px wide viewport, verify that navigation becomes an off-canvas sidebar, the assignment controls stack, the report table scrolls horizontally, and dialog tabs/content do not overflow.

## Plan Self-Review

- Spec coverage: Tasks 1-3 implement standard components, dashboard layout, semantic theme use, responsive behavior, and all requested validation without changing data flow.
- Placeholder scan: no incomplete work markers or unspecified implementation steps remain.
- Type consistency: existing research types and API function signatures are preserved; no new cross-module data contract is introduced.
