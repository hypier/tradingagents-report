# Research Command Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Research Command dashboard so its controls, jobs, pipeline, snapshot, and report detail use the same-origin BFF rather than mock data.

**Architecture:** React Query owns BFF reads and polling. The dashboard composes focused components that consume typed browser contracts. Core remains the source of truth for analysis job creation, state, events, reports, and market data.

**Tech Stack:** React 19, TanStack Query, Hono, Zod, Tailwind v4, shadcn/ui, FastAPI.

## Global Constraints

- Browser requests use only `/api`.
- Dashboard reflects sequential Agent execution; no concurrent Agent telemetry.
- No authentication, watchlist persistence, payment, execution, or portfolio features.
- Poll only while a job is queued or running, then stop.

---

### Task 1: Typed Browser Research Client

**Files:**
- Create: `tg-web/src/frontend/lib/research.ts`
- Modify: `tg-web/tests/unit/contracts.test.ts`

**Interfaces:**
- Produces `createResearch`, `listResearch`, `getResearch`, `getResearchEvents`, and `getMarketSnapshot` returning parsed `ApiSuccess` payloads.

- [ ] Write a failing test asserting `createResearch` posts a camel-case browser payload to `/api/analyses`.
- [ ] Run `pnpm vitest run --project unit tests/unit/contracts.test.ts` and observe the missing client failure.
- [ ] Implement the five `fetch` wrappers and Zod response schemas.
- [ ] Re-run the focused test and `pnpm typecheck`.

### Task 2: Live Dashboard State

**Files:**
- Create: `tg-web/src/frontend/components/research-pipeline.tsx`
- Create: `tg-web/src/frontend/components/research-detail.tsx`
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Modify: `tg-web/tests/unit/frontend-app.test.tsx`

**Interfaces:**
- Consumes typed job records and emits `onSelectJob(id)`.
- Produces an ordered stage view from selected analysts plus debate, Trader, risk review, and final synthesis.

- [ ] Write a failing test asserting a submitted job reaches the recent-research table and a running job shows polling state.
- [ ] Run `pnpm vitest run --project unit tests/unit/frontend-app.test.tsx` and observe the current mock-only behavior fail.
- [ ] Implement Query mutations, conditional polling, selected-job report detail, and error states.
- [ ] Run focused frontend tests, typecheck, lint, and build.

### Task 3: Contract and Responsive Validation

**Files:**
- Modify: `tg-web/tests/unit/app.test.ts`
- Modify: `tg-web/tests/e2e/app.spec.ts`
- Modify: `tg-core/docs/API_SERVICE.md`

**Interfaces:**
- Verifies BFF list, detail, events, and market snapshot routes return JSON envelopes.
- Verifies the desktop and mobile dashboard present Research command and Sequential research pipeline.

- [ ] Write failing BFF route tests for list and market snapshot.
- [ ] Implement only validation changes needed to make route tests pass.
- [ ] Add desktop/mobile E2E assertions and document the read-only Core snapshot route.
- [ ] Run `cd tg-core && .venv/bin/pytest tests/test_api_market_snapshot.py -q` and `cd ../tg-web && pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm test:e2e`.

## Plan Review

- Scope covers every current mock-only dashboard surface and the corresponding BFF read boundary.
- All state comes from existing Core jobs or the new Core snapshot route; excluded product systems remain excluded.
