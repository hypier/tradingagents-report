# Launch Language And Report Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Core-compatible output-language selection to a research launch and replace report overflow actions with direct icon buttons.

**Architecture:** The form keeps its language state locally and passes the selected language through `createResearch` as `configOverrides.output_language`. `RecentReports` keeps its existing callback contract while replacing its dropdown with an accessible icon button wrapped in the existing tooltip primitives.

**Tech Stack:** React 19, TypeScript, React Testing Library, Vitest, Radix UI, Lucide.

## Global Constraints

- Use only the existing `configOverrides.output_language` Core request path.
- Default language is `English`.
- Do not modify Core API, job, or database code.
- The report icon control must have an accessible name and visible hover tooltip.
- Do not create a git commit unless the user explicitly requests it.

---

### Task 1: Submit The Selected Output Language

**Files:**
- Modify: `tg-web/src/frontend/lib/research.ts`
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Create: `tg-web/tests/unit/home-page-language.test.tsx`

**Interfaces:**
- Extends: `ResearchInput` with `outputLanguage: string`.
- Produces: `createResearch()` POST body includes `configOverrides.output_language`.

- [ ] **Step 1: Write the failing form test**

```tsx
it('submits the selected report language as a Core config override', async () => {
  render(<HomePage />);
  await user.selectOptions(screen.getByLabelText('Report language'), 'Japanese');
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));

  expect(createResearch).toHaveBeenCalledWith(
    expect.objectContaining({ outputLanguage: 'Japanese' }),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- home-page-language.test.tsx`

Expected: FAIL because the report-language form control does not exist.

- [ ] **Step 3: Implement minimal language selection**

```tsx
const [outputLanguage, setOutputLanguage] = useState('English');

<Select value={outputLanguage} onValueChange={setOutputLanguage}>
  <SelectTrigger id="output-language" aria-label="Report language">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>{languageOptions.map(/* SelectItem */)}</SelectContent>
</Select>
```

Add the eleven CLI presets and a custom choice. Render a required text input when custom is selected; use its trimmed value at submit time. Disable submission while that value is blank. Extend `createResearch()` to send `configOverrides: { output_language: input.outputLanguage }`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tg-web && pnpm test:unit -- home-page-language.test.tsx`

Expected: PASS.

### Task 2: Replace Overflow Report Actions

**Files:**
- Modify: `tg-web/src/frontend/components/dashboard/recent-reports.tsx`
- Create: `tg-web/tests/unit/recent-reports.test.tsx`

**Interfaces:**
- Consumes: `onOpenReport(id: string)`.
- Produces: an icon button named `View report for <ticker>` that calls `onOpenReport(job.id)`.

- [ ] **Step 1: Write the failing direct-action test**

```tsx
it('opens a report from its direct icon action', () => {
  render(<RecentReports jobs={[job]} loading={false} error={false} onOpenReport={onOpenReport} />);
  fireEvent.click(screen.getByRole('button', { name: 'View report for AAPL' }));

  expect(onOpenReport).toHaveBeenCalledWith('job-1');
  expect(screen.queryByRole('button', { name: 'Actions for AAPL' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- recent-reports.test.tsx`

Expected: FAIL because the direct action button does not exist.

- [ ] **Step 3: Implement the direct icon action**

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      aria-label={`View report for ${job.ticker}`}
      onClick={() => onOpenReport(job.id)}
      size="icon-sm"
      variant="ghost"
    >
      <FileText />
    </Button>
  </TooltipTrigger>
  <TooltipContent>View report</TooltipContent>
</Tooltip>
```

Remove the dropdown-menu imports and overflow action control.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tg-web && pnpm test:unit -- recent-reports.test.tsx`

Expected: PASS.

### Task 3: Verify The Combined Workflow

**Files:**
- Modify only if testing identifies a defect in the preceding files.

- [ ] **Step 1: Run frontend checks**

Run: `cd tg-web && pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS.

- [ ] **Step 2: Verify in browser**

Use the browser tool on the local frontend to confirm the language control is readable at desktop and mobile widths and each report row exposes a visible icon control with the expected tooltip.
