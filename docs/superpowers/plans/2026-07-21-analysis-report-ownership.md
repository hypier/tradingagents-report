# Analysis Report Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict analysis lists, reports, and event logs to their owning Clerk account while allowing administrators to view all jobs.

**Architecture:** Derive ownership from the existing `credit_reservations.request_id -> clerk_user_id` relation. TG-web computes an owner scope from the authenticated Clerk role, Core accepts that scope only over its API-key-protected service interface, and PostgreSQL applies ownership before filtering and pagination.

**Tech Stack:** TypeScript, Hono, Clerk, Python 3.10+, FastAPI, psycopg, PostgreSQL, Vitest, pytest, Docker Compose.

---

### Task 1: Core PostgreSQL ownership filtering

**Files:**
- Modify: `tg-core/tests/test_infrastructure_analysis_jobs.py`
- Modify: `tg-core/infrastructure/analysis_jobs.py`

- [ ] **Step 1: Write failing repository tests**

Add tests proving `owner_id` becomes an SQL ownership condition for both detail and list queries while `None` preserves internal/admin behavior:

```python
def test_get_job_filters_by_owner(monkeypatch):
    row = {"id": "job-id"}
    executed = []

    class Cursor:
        def fetchone(self):
            return row

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert analysis_jobs.get_job("job-id", owner_id="user-1") is row
    sql, params = executed[0]
    assert "credit_reservations" in sql
    assert "reservation.request_id = job.request_id" in sql
    assert params == ("job-id", "user-1", "user-1")
```

Extend the list test with `owner_id="user-1"` and assert the owner parameters precede ticker/status/pagination. Add a separate assertion that `get_job("job-id")` retains the simple global query.

- [ ] **Step 2: Run the focused repository tests and verify RED**

Run:

```powershell
cd tg-core
.venv\Scripts\python.exe -m pytest tests/test_infrastructure_analysis_jobs.py -q
```

Expected: FAIL because `get_job()` and `list_jobs()` do not accept `owner_id`.

- [ ] **Step 3: Implement owner-aware SQL**

Change the public signatures to:

```python
def get_job(job_id: UUID | str, *, owner_id: str | None = None) -> dict | None:
    ...

def list_jobs(
    *,
    ticker: str | None = None,
    status: str | None = None,
    owner_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    ...
```

Use an `EXISTS` predicate so one reservation can never duplicate a job row:

```sql
AND (
    %s::text IS NULL
    OR EXISTS (
        SELECT 1
        FROM credit_reservations AS reservation
        WHERE reservation.request_id = job.request_id
          AND reservation.clerk_user_id = %s
    )
)
```

Alias `analysis_jobs AS job` in scoped queries. Do not filter on reservation status or `analysis_job_id`.

- [ ] **Step 4: Re-run repository tests and verify GREEN**

Run the command from Step 2.

Expected: all tests in `test_infrastructure_analysis_jobs.py` PASS.

### Task 2: Core HTTP owner scope and 404 behavior

**Files:**
- Modify: `tg-core/tests/test_api_app.py`
- Modify: `tg-core/api/app.py`
- Modify: `tg-core/docs/API_SERVICE.md`

- [ ] **Step 1: Write failing Core API tests**

Add tests for list, detail, and events:

```python
def test_get_analyses_passes_owner_scope(monkeypatch):
    captured = {}

    def list_jobs(**kwargs):
        captured.update(kwargs)
        return []

    monkeypatch.setattr(api_app.analysis_jobs, "list_jobs", list_jobs)

    assert api_app.get_analyses(owner_id="user-1") == []
    assert captured["owner_id"] == "user-1"


def test_get_analysis_hides_jobs_outside_owner_scope(monkeypatch):
    captured = {}

    def get_job(job_id, *, owner_id=None):
        captured.update(job_id=job_id, owner_id=owner_id)
        return None

    monkeypatch.setattr(api_app.analysis_jobs, "get_job", get_job)

    with pytest.raises(HTTPException) as error:
        api_app.get_analysis(
            UUID("00000000-0000-0000-0000-000000000001"),
            owner_id="user-2",
        )

    assert error.value.status_code == 404
    assert captured["owner_id"] == "user-2"
```

Add the equivalent event assertion and an admin/global assertion with `owner_id=None`.

- [ ] **Step 2: Run the focused API tests and verify RED**

Run:

```powershell
cd tg-core
.venv\Scripts\python.exe -m pytest tests/test_api_app.py -q
```

Expected: FAIL because the endpoint functions do not accept or forward `owner_id`.

- [ ] **Step 3: Add the protected query parameter**

Add this parameter to all three read endpoints:

```python
owner_id: str | None = Query(default=None, min_length=1, max_length=128)
```

Forward it to `analysis_jobs.list_jobs(..., owner_id=owner_id)` and
`analysis_jobs.get_job(job_id, owner_id=owner_id)`. Keep the existing
`require_api_key` dependency and identical 404 detail for missing and
unauthorized jobs.

- [ ] **Step 4: Document the internal owner parameter**

In `tg-core/docs/API_SERVICE.md`, state that `owner_id` is a trusted
service-to-service filter, not browser authentication; TG-web derives it from
Clerk, ordinary users cannot supply it, and an omitted value is reserved for
administrator/internal global queries.

- [ ] **Step 5: Re-run API and repository tests**

Run:

```powershell
cd tg-core
.venv\Scripts\python.exe -m pytest tests/test_api_app.py tests/test_api_contract.py tests/test_infrastructure_analysis_jobs.py -q
```

Expected: all selected Core tests PASS.

### Task 3: TG-web authenticated role scope

**Files:**
- Modify: `tg-web/tests/unit/core-client.test.ts`
- Modify: `tg-web/tests/unit/app.test.ts`
- Modify: `tg-web/src/backend/core/client.ts`
- Modify: `tg-web/src/backend/routes/analyses.ts`

- [ ] **Step 1: Write failing CoreClient tests**

Add tests that express the desired client API:

```typescript
it('adds the authenticated owner and discards an inbound owner override', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
  const client = new CoreClient(
    new URL('https://core.example.test'),
    'server-secret',
    fetchMock,
  );
  const query = new URLSearchParams({
    status: 'succeeded',
    owner_id: 'forged-user',
  });

  await client.listAnalyses(query, 'user-1');

  expect(fetchMock).toHaveBeenCalledWith(
    'https://core.example.test/api/v1/analyses?status=succeeded&owner_id=user-1',
    expect.anything(),
  );
});

it('preserves Core 404 as an analysis-not-found error', async () => {
  const client = new CoreClient(
    new URL('https://core.example.test'),
    'server-secret',
    vi.fn().mockResolvedValue(new Response('missing', { status: 404 })),
  );

  await expect(client.getAnalysis('job-1', 'user-1')).rejects.toMatchObject({
    code: 'ANALYSIS_NOT_FOUND',
    status: 404,
  });
});
```

Also assert detail and events append an encoded owner, and null owner emits no
`owner_id`.

- [ ] **Step 2: Run CoreClient tests and verify RED**

Run:

```powershell
cd tg-web
corepack pnpm test:unit -- core-client.test.ts
```

Expected: FAIL because the client methods do not accept owner scope and 404
currently maps to `CORE_UNAVAILABLE`.

- [ ] **Step 3: Implement the CoreClient contract**

Change the interface to:

```typescript
listAnalyses(input: URLSearchParams, ownerId: string | null): Promise<unknown>;
getAnalysis(id: string, ownerId: string | null): Promise<unknown>;
getAnalysisEvents(id: string, ownerId: string | null): Promise<unknown>;
```

Clone list parameters, delete any existing `owner_id`, then append the
server-derived owner. Use one helper for list/detail/event query construction.
Map HTTP 404 to:

```typescript
new AppError('ANALYSIS_NOT_FOUND', 404, 'Analysis job not found')
```

Keep 400/409 and 503 mappings unchanged.

- [ ] **Step 4: Write failing BFF role tests**

In `app.test.ts`, add one ordinary-user test covering list, detail, and
events:

```typescript
expect(dependencies.core.listAnalyses).toHaveBeenCalledWith(
  expect.any(URLSearchParams),
  'user-1',
);
expect(dependencies.core.getAnalysis).toHaveBeenCalledWith(jobId, 'user-1');
expect(dependencies.core.getAnalysisEvents).toHaveBeenCalledWith(
  jobId,
  'user-1',
);
```

Send `?owner_id=forged-user` on the list request and assert the
`URLSearchParams` passed by the route does not grant the forged scope.
Add an administrator test by making `auth.getUser()` return
`role: 'admin'` and assert all three methods receive `null`.

- [ ] **Step 5: Run BFF tests and verify RED**

Run:

```powershell
cd tg-web
corepack pnpm test:unit -- app.test.ts
```

Expected: FAIL because analysis routes call CoreClient without an owner scope.

- [ ] **Step 6: Implement role-derived scope**

Add a small local helper in `routes/analyses.ts`:

```typescript
function analysisOwnerScope(context: Context<AppEnvironment>) {
  return context.get('authUser').role === 'admin'
    ? null
    : context.get('auth').userId;
}
```

Pass this value to list, detail, and event CoreClient methods. Do not read an
owner from headers, URL params, or request bodies.

- [ ] **Step 7: Re-run Web focused tests**

Run:

```powershell
cd tg-web
corepack pnpm test:unit -- core-client.test.ts app.test.ts
```

Expected: all focused Web tests PASS.

### Task 4: Documentation, regression verification, and local deployment

**Files:**
- Modify: `tg-core/docs/ARCHITECTURE_DESIGN.md`
- Verify all changed paths

- [ ] **Step 1: Update architecture documentation**

Document the flow:

```text
Clerk session -> TG-web role-derived owner scope -> API-key-protected Core
query -> PostgreSQL EXISTS(credit_reservations request/user match)
```

State that administrators omit the scope and ordinary cross-account reads
return 404. Clarify that direct CLI/Core jobs without reservations are
administrator-only in TG-web.

- [ ] **Step 2: Run static validation**

Run:

```powershell
cd tg-core
.venv\Scripts\python.exe -m py_compile api/app.py infrastructure/analysis_jobs.py
.venv\Scripts\ruff.exe check api/app.py infrastructure/analysis_jobs.py tests/test_api_app.py tests/test_infrastructure_analysis_jobs.py

cd ..\tg-web
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm exec prettier --check src/backend/core/client.ts src/backend/routes/analyses.ts tests/unit/core-client.test.ts tests/unit/app.test.ts
```

Expected: every command exits 0.

- [ ] **Step 3: Run regression tests**

Run:

```powershell
cd tg-core
.venv\Scripts\python.exe -m pytest tests/test_api_app.py tests/test_api_contract.py tests/test_application_jobs.py tests/test_infrastructure_analysis_jobs.py -q

cd ..\tg-web
corepack pnpm test:unit
corepack pnpm test:worker
corepack pnpm test:integration
```

Expected: all enabled tests PASS. Run integration outside the sandbox when
Testcontainers requires Docker access.

- [ ] **Step 4: Build production bundles**

Run:

```powershell
cd tg-web
corepack pnpm build
corepack pnpm build:node
```

Expected: both builds exit 0.

- [ ] **Step 5: Inspect the patch**

Run from repository root:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors. Preserve the user's unrelated legacy
`frontend/` deletions and the existing signup/referral feature changes.

- [ ] **Step 6: Rebuild and restart local images**

Run:

```powershell
docker compose --env-file tg-core/.env --profile web -f docker/docker-compose.yml build tradingagents-api tradingagents-web
docker compose --env-file tg-core/.env --profile web -f docker/docker-compose.yml up -d --no-build --wait
```

No migration command is needed because this feature changes no schema.

- [ ] **Step 7: Smoke-test ownership**

Verify `/health` and `/api/ready`. Use existing local Clerk sessions if
available to confirm:

- an ordinary account sees only reservation-owned jobs;
- a different job ID returns 404 for detail and events;
- an administrator still sees all jobs.

Do not create external Clerk users solely for smoke testing. If sessions are
unavailable, report the automated API/repository coverage as the verification
boundary.

No Git commits are included because repository instructions prohibit commits
unless the user explicitly requests one.
