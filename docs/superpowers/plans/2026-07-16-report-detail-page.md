# Report Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the research report dialog with a sidebar-preserving report page that renders each report section as Markdown.

**Architecture:** `RecentReports` navigates to `/reports/:id` through `HomePage`. `ReportPage` owns the existing `getResearch` query and status states while `MarkdownReport` converts string sections to semantic React elements; JSON values are shown in a preformatted code block. The shared `AppShell` component owns the sidebar and header so the dashboard and report page use the same chrome.

**Tech Stack:** React 19, React Router 7, TanStack Query, Vitest, Testing Library, Tailwind CSS, `react-markdown` with `remark-gfm`.

## Global Constraints

- Keep the existing API contract and `getResearch(id)` request unchanged.
- Keep the sidebar and `SiteHeader` visible on `/reports/:id`.
- Add no backend changes.
- Render untrusted report strings as Markdown without raw HTML execution.
- Do not create a git commit unless the user explicitly requests it.

---

### Task 1: Add Markdown Report Rendering

**Files:**
- Modify: `tg-web/package.json`
- Create: `tg-web/src/frontend/components/report/markdown-report.tsx`
- Create: `tg-web/tests/unit/markdown-report.test.tsx`

**Interfaces:**
- Produces: `MarkdownReport({ value }: { value: unknown }): JSX.Element`
- Consumes: `react-markdown` and `remark-gfm`.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders report markdown as semantic document content', () => {
  render(<MarkdownReport value={'# Market outlook\n\n| Metric | Value |\n| --- | --- |\n| Close | **$327.50** |'} />);

  expect(screen.getByRole('heading', { name: 'Market outlook' })).toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveTextContent('Close');
  expect(screen.getByText('$327.50')).toHaveTagName('strong');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- markdown-report.test.tsx`

Expected: FAIL because `MarkdownReport` does not exist.

- [ ] **Step 3: Implement the minimal renderer**

```tsx
export function MarkdownReport({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return <pre>{JSON.stringify(value, null, 2)}</pre>;
  }

  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>;
}
```

Add `react-markdown` and `remark-gfm` to runtime dependencies, then provide Tailwind component mappings for readable headings, tables, code blocks, and links. Do not enable `rehype-raw`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tg-web && pnpm test:unit -- markdown-report.test.tsx`

Expected: PASS.

### Task 2: Create The Report Route And Preserve App Chrome

**Files:**
- Create: `tg-web/src/frontend/components/app-shell.tsx`
- Create: `tg-web/src/frontend/pages/report-page.tsx`
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Modify: `tg-web/src/frontend/app/router.tsx`
- Modify: `tg-web/tests/unit/frontend-app.test.tsx`

**Interfaces:**
- Consumes: `AppShell({ children }: { children: ReactNode })`, `MarkdownReport`, `getResearch(id)`, `useParams()`, `useNavigate()`.
- Produces: `ReportPage` mounted for `/reports/:id`.

- [ ] **Step 1: Write the failing route test**

```tsx
it('renders a report detail page inside the dashboard shell', () => {
  render(
    <MemoryRouter initialEntries={['/reports/job-1']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getAllByRole('button', { name: 'Toggle Sidebar' })).not.toHaveLength(0);
  expect(screen.getByRole('heading', { name: 'Research report' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- frontend-app.test.tsx`

Expected: FAIL because `/reports/job-1` resolves to the current not-found route.

- [ ] **Step 3: Implement the route and page**

```tsx
<Route path="/reports/:id" element={<ReportPage />} />
```

Move the existing sidebar and header wrapper into `AppShell` and wrap both `HomePage` and `ReportPage`. In `ReportPage`, use the report identifier only when present, fetch it with the existing query key and `getResearch`, then render title, ticker, status badge, a button calling `navigate('/')`, and the existing loading, failure, empty, and tab patterns. Within each `TabsContent`, render `<MarkdownReport value={value} />` in a full-height reading container.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tg-web && pnpm test:unit -- frontend-app.test.tsx`

Expected: PASS.

### Task 3: Replace Dialog Navigation With A Route Transition

**Files:**
- Modify: `tg-web/src/frontend/components/dashboard/recent-reports.tsx`
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Delete: `tg-web/src/frontend/components/dashboard/report-dialog.tsx`
- Modify: `tg-web/tests/unit/frontend-app.test.tsx`

**Interfaces:**
- Consumes: `onOpenReport(id: string)` passed from `HomePage` as `navigate(`/reports/${id}`)`.
- Produces: No mounted report dialog on the dashboard.

- [ ] **Step 1: Write the failing navigation test**

```tsx
it('navigates from a recent report action to the report detail page', async () => {
  render(<RecentReports jobs={[job]} loading={false} error={false} onOpenReport={onOpenReport} />);
  await user.click(screen.getByRole('button', { name: 'Actions for AAPL' }));
  await user.click(screen.getByRole('menuitem', { name: 'View report' }));

  expect(onOpenReport).toHaveBeenCalledWith('job-1');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- frontend-app.test.tsx`

Expected: FAIL because the test fixture and interaction do not exist.

- [ ] **Step 3: Implement the navigation replacement**

```tsx
const navigate = useNavigate();

<RecentReports
  jobs={jobs.data?.data ?? []}
  loading={jobs.isLoading}
  error={jobs.isError}
  onOpenReport={(id) => navigate(`/reports/${id}`)}
/>
```

Remove the dashboard `reportId` state, `ReportDialog` import and mounted dialog. Keep `RecentReports` callback behavior unchanged. Delete the unreferenced dialog component.

- [ ] **Step 4: Run focused tests and static checks**

Run: `cd tg-web && pnpm test:unit -- frontend-app.test.tsx markdown-report.test.tsx && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS with no TypeScript, lint, or build errors.

### Task 4: Verify The Reading Flow In Browser

**Files:**
- Modify only if browser verification exposes a defect in the preceding files.

**Interfaces:**
- Consumes: completed `/reports/:id` route.
- Produces: verified desktop and mobile reading layout.

- [ ] **Step 1: Start the web application**

Run: `cd tg-web && pnpm dev:web -- --host 127.0.0.1`

Expected: Vite serves the frontend on a local port.

- [ ] **Step 2: Verify at desktop and mobile widths**

Open `/reports/<known-job-id>` with the browser tool and check that the sidebar and header remain present, the report content is scrollable, tab labels do not overflow the viewport, and Markdown tables scroll horizontally rather than clipping.

- [ ] **Step 3: Re-run verification after any adjustment**

Run: `cd tg-web && pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS.
