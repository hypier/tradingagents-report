# Status-Driven Dashboard Emphasis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply semantic shadcn status variants to market movement and research workflow state.

**Architecture:** Small local helpers map existing numeric and string state to the installed `Badge` variants. `HomePage`, `PipelinePanel`, and `RecentReports` consume the helpers without changing the data layer.

**Tech Stack:** React 19, TypeScript, shadcn/ui Card, Badge, Progress, Vitest, Testing Library.

## Global Constraints

- Use installed shadcn component variants and semantic tokens only.
- Do not add raw Tailwind color values, global theme changes, API fields, or charts.
- Do not create a git commit unless explicitly requested.

---

### Task 1: Emphasize Market Movement

**Files:**
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Modify: `tg-web/tests/unit/home-page-language.test.tsx`

- [ ] **Step 1: Write the failing variant test**

```tsx
expect(screen.getByText('+1.20%')).toHaveAttribute('data-variant', 'default');
expect(screen.getByText('-1.20%')).toHaveAttribute('data-variant', 'destructive');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tg-web && pnpm test:unit -- home-page-language.test.tsx`

Expected: FAIL because price movement is currently always secondary.

- [ ] **Step 3: Implement minimal semantic mapping**

Add a local helper that returns `default`, `destructive`, or `outline` from `change_percent`. Use it on the market-movement `Badge`, and add a `default` live-quote badge through `CardAction`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tg-web && pnpm test:unit -- home-page-language.test.tsx`

Expected: PASS.

### Task 2: Emphasize Workflow And Report States

**Files:**
- Modify: `tg-web/src/frontend/components/dashboard/pipeline-panel.tsx`
- Modify: `tg-web/src/frontend/components/dashboard/recent-reports.tsx`
- Modify: `tg-web/tests/unit/pipeline-panel.test.tsx`
- Modify: `tg-web/tests/unit/recent-reports.test.tsx`

- [ ] **Step 1: Write failing state-variant tests**

```tsx
expect(screen.getByText('In progress')).toHaveAttribute('data-variant', 'default');
expect(screen.getByText('failed')).toHaveAttribute('data-variant', 'destructive');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tg-web && pnpm test:unit -- pipeline-panel.test.tsx recent-reports.test.tsx`

Expected: FAIL because current, failed, and pending states use outline.

- [ ] **Step 3: Implement state mappings**

Map running/queued states to `default`, succeeded/completed states to `secondary`, failed states to `destructive`, and pending states to `outline` in the existing Badge components.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tg-web && pnpm test:unit -- pipeline-panel.test.tsx recent-reports.test.tsx`

Expected: PASS.

### Task 3: Verify The Dashboard

**Files:**
- Modify only if a check finds a defect.

- [ ] **Step 1: Run frontend verification**

Run: `cd tg-web && pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS.

- [ ] **Step 2: Verify desktop and mobile appearance**

Use the local browser to confirm semantic color differentiation is visible without overlap and reset any temporary viewport override before finishing.
