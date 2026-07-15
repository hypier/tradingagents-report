# Research Command Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a responsive Research Command dashboard that creates and follows Core analysis jobs, reads their reports, and shows a TradingView-backed market snapshot.

**Architecture:** `tg-web` owns browser-facing Zod contracts and Hono routes. Its routes proxy analysis mutations and reads to `tg-core`; Core remains the sole owner of job state. A small Core market-snapshot route resolves the instrument and reads through the established TradingView vendor path. The dashboard polls only its same-origin BFF and renders Core's sequential research stages rather than inventing parallel Agent telemetry.

**Tech Stack:** React 19, React Router, TanStack Query, Hono RPC, Zod, Tailwind v4, shadcn/ui, FastAPI, Pydantic, existing TradingView dataflow.

## Global Constraints

- This is a private/single-workspace beta until identity and job ownership exist; never label history as user-private.
- The browser calls only same-origin `/api`; `CORE_API_KEY` and `TRADINGVIEW_RAPIDAPI_KEY` stay server-side.
- Core retains all `analysis_jobs` writes and the global serial execution lock.
- The Agent UI is sequential: four selected analysts, research debate, Trader, risk review, final synthesis.
- Market data is a read-only snapshot with `asOf` and source provenance; it is not a brokerage quote or execution surface.
- No watchlist, alerts, payments, portfolio performance, account balance, or order entry is included.

---

### Task 1: Add Core Market Snapshot Contract

**Files:**
- Create: `tg-core/api/market_snapshot.py`
- Modify: `tg-core/api/app.py`
- Test: `tg-core/tests/test_api_market_snapshot.py`

**Interfaces:**
- Produces `GET /api/v1/market-snapshot?ticker=<ticker>` with `{ ticker, displayName, lastPrice, currency, changePercent, asOf, source }`.
- Consumes the existing listing resolver and the TradingView-backed provider route; returns `503` for unavailable data without leaking provider credentials.

- [ ] **Step 1: Write the failing API contract test**

```python
def test_market_snapshot_returns_normalized_public_fields(client, monkeypatch):
    monkeypatch.setattr("api.market_snapshot.read_snapshot", lambda ticker: {
        "ticker": "AAPL", "display_name": "Apple Inc.", "last_price": 210.0,
        "currency": "USD", "change_percent": 1.2, "as_of": "2026-07-15T14:30:00Z",
        "source": "tradingview",
    })
    response = client.get("/api/v1/market-snapshot?ticker=AAPL", headers=api_headers())
    assert response.status_code == 200
    assert response.json()["ticker"] == "AAPL"
```

- [ ] **Step 2: Run the test and verify it fails because the route is absent**

Run: `cd tg-core && .venv/bin/pytest tests/test_api_market_snapshot.py -q`

- [ ] **Step 3: Implement the minimal typed snapshot reader and protected route**

```python
@app.get("/api/v1/market-snapshot", dependencies=[Depends(require_api_key)])
def get_market_snapshot(ticker: str = Query(min_length=1, max_length=32)) -> dict:
    return read_snapshot(ticker)
```

- [ ] **Step 4: Run the focused test and Ruff**

Run: `cd tg-core && .venv/bin/pytest tests/test_api_market_snapshot.py -q && .venv/bin/ruff check api/app.py api/market_snapshot.py tests/test_api_market_snapshot.py`

### Task 2: Define Same-Origin Web Contracts and BFF Routes

**Files:**
- Create: `tg-web/src/backend/routes/analyses.ts`
- Create: `tg-web/src/backend/routes/market-snapshot.ts`
- Modify: `tg-web/src/shared/contracts.ts`
- Modify: `tg-web/src/backend/app.ts`
- Modify: `tg-web/src/backend/core/client.ts`
- Test: `tg-web/tests/unit/app.test.ts`

**Interfaces:**
- Produces `POST /api/analyses`, `GET /api/analyses`, `GET /api/analyses/:id`, `GET /api/analyses/:id/events`, and `GET /api/market-snapshot`.
- Consumes CoreClient methods and validates all browser inputs and Core responses with Zod before returning `ApiSuccess`.

- [ ] **Step 1: Write failing Hono request tests**

```ts
it('forwards a validated analysis request to Core', async () => {
  const response = await app.request('/api/analyses', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker: 'AAPL', tradeDate: '2026-07-15', analysts: ['market'] }),
  });
  expect(response.status).toBe(202);
});
```

- [ ] **Step 2: Run the focused test and verify its route-level failure**

Run: `cd tg-web && pnpm vitest run --project unit tests/unit/app.test.ts`

- [ ] **Step 3: Implement schemas, Core client method, and routes without direct database job mutation**

```ts
app.post('/analyses', async (context) => {
  const input = createAnalysisSchema.parse(await context.req.json());
  const result = analysisJobSchema.parse(await core.submitAnalysis(toCoreRequest(input)));
  return context.json(apiSuccess(result, context.get('requestId')), 202);
});
```

- [ ] **Step 4: Verify route tests, typecheck, and lint**

Run: `cd tg-web && pnpm vitest run --project unit tests/unit/app.test.ts && pnpm typecheck && pnpm lint`

### Task 3: Build the Query Layer and Sequential Pipeline Model

**Files:**
- Create: `tg-web/src/frontend/lib/research.ts`
- Create: `tg-web/src/frontend/components/research-pipeline.tsx`
- Test: `tg-web/tests/unit/research-pipeline.test.tsx`

**Interfaces:**
- Produces `buildPipeline(job)` with ordered stages `analysts -> research_debate -> trader -> risk_review -> final_synthesis`.
- Consumes job status, `currentStep`, `progressPercent`, and events. It never infers independent concurrent Agent completion.

- [ ] **Step 1: Write a failing ordered-stage test**

```tsx
it('marks only the current sequential stage as running', () => {
  render(<ResearchPipeline job={runningMarketJob} />);
  expect(screen.getByText('Market analyst')).toHaveAttribute('data-state', 'running');
  expect(screen.getByText('Fundamentals analyst')).toHaveAttribute('data-state', 'pending');
});
```

- [ ] **Step 2: Run the test and verify it fails because the component is absent**

Run: `cd tg-web && pnpm vitest run --project unit tests/unit/research-pipeline.test.tsx`

- [ ] **Step 3: Implement the pure pipeline mapper and accessible pipeline component**

```ts
const stages = selectedAnalysts.map(toAnalystStage).concat(debateStages);
const activeIndex = stageIndexFor(job.currentStep, stages);
```

- [ ] **Step 4: Verify the focused unit test passes**

Run: `cd tg-web && pnpm vitest run --project unit tests/unit/research-pipeline.test.tsx`

### Task 4: Compose the Research Command Dashboard

**Files:**
- Create: `tg-web/src/frontend/components/app-sidebar.tsx`
- Create: `tg-web/src/frontend/components/research-command.tsx`
- Create: `tg-web/src/frontend/components/market-snapshot.tsx`
- Create: `tg-web/src/frontend/components/recent-research.tsx`
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Modify: `tg-web/src/frontend/styles/globals.css`
- Test: `tg-web/tests/unit/frontend-app.test.tsx`

**Interfaces:**
- Consumes the same-origin route hooks from Task 3 and shadcn `Button`, `Card`, `Badge`, `Progress`, `Tabs`, `Table`, and `Tooltip`.
- Produces responsive desktop/sidebar and mobile/drawer behavior, research creation, status filtering, report selection, and polling while a job is queued or running.

- [ ] **Step 1: Write a failing interaction test**

```tsx
it('submits a selected ticker from Research command', async () => {
  render(<HomePage />);
  await userEvent.type(screen.getByLabelText('Ticker'), 'AAPL');
  await userEvent.click(screen.getByRole('button', { name: 'Run research' }));
  expect(await screen.findByText('Queued')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify it fails before the dashboard is implemented**

Run: `cd tg-web && pnpm vitest run --project unit tests/unit/frontend-app.test.tsx`

- [ ] **Step 3: Add required shadcn components and implement the dashboard**

Run: `cd tg-web && pnpm dlx shadcn@latest add button card badge progress table tabs tooltip sheet input select toggle-group separator skeleton`

- [ ] **Step 4: Verify tests, lint, typecheck, and build**

Run: `cd tg-web && pnpm test:unit && pnpm lint && pnpm typecheck && pnpm build`

### Task 5: Validate the Full Flow and Responsive Layout

**Files:**
- Modify: `tg-web/tests/e2e/app.spec.ts`
- Modify: `tg-core/docs/API_SERVICE.md`
- Modify: `tg-core/docs/ARCHITECTURE_DESIGN.md`

**Interfaces:**
- Verifies a browser can render the dashboard, issue a BFF request against a stubbed Core API, and display an API JSON error without exposing secrets.

- [ ] **Step 1: Write a failing E2E assertion for the Research command**

```ts
await expect(page.getByRole('heading', { name: 'Research command' })).toBeVisible();
await expect(page.getByText('Sequential research pipeline')).toBeVisible();
```

- [ ] **Step 2: Run and observe the missing-dashboard failure**

Run: `cd tg-web && pnpm test:e2e`

- [ ] **Step 3: Extend E2E coverage for desktop and mobile, then document Core's new snapshot contract**

```md
`GET /api/v1/market-snapshot` is a server-authenticated, read-only quote snapshot. It returns provenance and `asOf`; it is not a streaming market-data service.
```

- [ ] **Step 4: Run the final validation suite**

Run: `cd tg-core && .venv/bin/pytest tests/test_api_market_snapshot.py -q && cd ../tg-web && pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm test:e2e`

## Plan Review

- Coverage: Tasks 1-2 preserve Core job ownership and establish all BFF boundaries; Task 3 preserves Core's sequential Agent semantics; Task 4 delivers the selected command-center surface; Task 5 validates and documents it.
- Explicit exclusions: identity, ownership, watchlist, alerts, payment, execution, and streaming quotes are not added.
- Type consistency: browser types are defined in `shared/contracts.ts`, BFF routes validate those types, and UI consumes only BFF responses.
