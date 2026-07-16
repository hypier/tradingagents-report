# Market Asset Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display TradingView asset logos before stock identity on the market snapshot and recent research reports, with company names leading the snapshot card.

**Architecture:** Add a narrow TG-web server-side TradingView client that selects the primary market record and derives the public SVG URL from its `logo.logoid`. Expose it through a BFF batch endpoint. Core market data remains unchanged; React uses the installed shadcn Avatar components and keeps ticker-based fallback content.

**Tech Stack:** Python 3.10+, FastAPI, existing TradingView RapidAPI client, TypeScript, Hono, React 19, TanStack Query, shadcn Avatar, Vitest, pytest.

## Global Constraints

- Use `https://tv-logo.tradingviewapi.com/logo/{logoid}.svg` directly in `AvatarImage`; do not proxy, cache, convert, or locally map logo images.
- Reuse TG-web's server-side `TRADINGVIEW_RAPIDAPI_KEY`; do not expose credentials to the browser.
- Preserve current Core market-snapshot fields.
- A missing logo or unavailable image must retain a ticker-character fallback and must not suppress an otherwise available quote or report row.
- Do not modify analysis jobs, create a commit, or create a branch.

---

## File Structure

- `tg-web/src/backend/market-assets/tradingview-market-client.ts`: resolves a preferred TradingView market result into optional public branding data.
- `tg-web/src/backend/routes/analyses.ts`: exposes the BFF batch asset-identity endpoint.
- `tg-web/src/backend/config/node-config.ts` and `tg-web/src/backend/config/worker-config.ts`: read the optional server-only TradingView key.
- `tg-web/src/backend/routes/analyses.ts`: proxies the identity batch endpoint under the existing analyses route group.
- `tg-web/src/frontend/lib/research.ts`: declares identity and optional snapshot logo fields and reads the BFF endpoint.
- `tg-web/src/frontend/pages/home-page.tsx`: renders the snapshot identity and obtains report-row identities.
- `tg-web/src/frontend/components/dashboard/recent-reports.tsx`: renders an avatar before each report ticker.

### Task 1: Resolve Direct TradingView Logo URLs

**Files:**
- Modify: `tg-core/tradingagents/dataflows/tradingview/stock.py`
- Modify: `tg-core/tests/test_tradingview_stock.py`

**Interfaces:**
- Produces `get_tradingview_asset_branding(ticker: str, *, client: TradingViewClient | None = None) -> dict[str, str]`.
- The returned object contains `display_name` when TradingView supplies a description and `logo_url` only when the selected market record contains a nonempty `logo.logoid`.
- The result is public metadata only; it never returns a provider credential or raw response payload.

- [ ] **Step 1: Write failing adapter tests**

```python
def test_asset_branding_returns_the_primary_market_logo_url():
    client = Mock()
    client.get.return_value = {
        "markets": [
            {
                "symbol": "AAPL",
                "full_name": "NASDAQ:AAPL",
                "description": "Apple Inc.",
                "is_primary_listing": True,
                "logo": {"style": "single", "logoid": "apple"},
            }
        ]
    }

    assert tv.get_tradingview_asset_branding("AAPL", client=client) == {
        "display_name": "Apple Inc.",
        "logo_url": "https://tv-logo.tradingviewapi.com/logo/apple.svg",
    }


def test_asset_branding_omits_logo_when_the_market_has_no_logoid():
    client = Mock()
    client.get.return_value = {
        "markets": [
            {
                "symbol": "AAPL",
                "full_name": "NASDAQ:AAPL",
                "description": "Apple Inc.",
                "is_primary_listing": True,
            }
        ]
    }

    assert tv.get_tradingview_asset_branding("AAPL", client=client) == {
        "display_name": "Apple Inc."
    }
```

- [ ] **Step 2: Run the new adapter tests to verify failure**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_stock.py -k asset_branding -q`

Expected: FAIL because `get_tradingview_asset_branding` does not exist.

- [ ] **Step 3: Add the minimal branding resolver**

```python
_LOGO_BASE_URL = "https://tv-logo.tradingviewapi.com/logo"


def get_tradingview_asset_branding(
    ticker: str,
    *,
    client: TradingViewClient | None = None,
) -> dict[str, str]:
    api = client or TradingViewClient()
    ref, resolved = _resolve(ticker, api)
    markets = _search_markets(api, ref.canonical_symbol, ref.asset_class)
    market = next(
        (
            candidate
            for candidate in markets
            if _market_symbol(candidate) == resolved.symbol
        ),
        None,
    )
    if market is None:
        return {}

    result: dict[str, str] = {}
    description = _identity_field(market.get("description"))
    if description:
        result["display_name"] = description
    logo = market.get("logo")
    logoid = logo.get("logoid") if isinstance(logo, dict) else None
    if isinstance(logoid, str) and logoid.strip():
        result["logo_url"] = f"{_LOGO_BASE_URL}/{quote(logoid.strip(), safe='/')}.svg"
    return result
```

Import `_market_symbol` from `.symbols` and reuse the existing `quote` import. The call must use `_search_markets`, so its existing `filter` behavior and resolved-symbol selection rules remain authoritative.

- [ ] **Step 4: Run adapter coverage**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_stock.py -k 'asset_branding or identity' -q`

Expected: PASS.

### Task 2: Expose Optional Asset Identity From Core

**Files:**
- Create: `tg-core/api/market_identity.py`
- Modify: `tg-core/api/market_snapshot.py`
- Modify: `tg-core/api/app.py`
- Modify: `tg-core/tests/test_api_market_snapshot.py`

**Interfaces:**
- Produces `read_market_identity(ticker: str) -> dict[str, str]` with required `ticker` and `display_name` plus optional `logo_url`.
- Produces `GET /api/v1/market-identities?ticker=AAPL&ticker=MSFT`, authenticated by the existing API-key dependency, returning a list of identity objects in request order.
- Extends `read_snapshot()` with optional `logo_url` while retaining its existing keys and price behavior.

- [ ] **Step 1: Write failing Core API tests**

```python
def test_market_identity_returns_name_and_direct_logo_url(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_API_KEY", "server-secret")
    monkeypatch.setattr(
        "api.app.read_market_identity",
        lambda ticker: {
            "ticker": ticker,
            "display_name": "Apple Inc.",
            "logo_url": "https://tv-logo.tradingviewapi.com/logo/apple.svg",
        },
    )

    response = TestClient(api_app.app).get(
        "/api/v1/market-identities?ticker=AAPL",
        headers={"Authorization": "Bearer server-secret"},
    )

    assert response.status_code == 200
    assert response.json() == [{
        "ticker": "AAPL",
        "display_name": "Apple Inc.",
        "logo_url": "https://tv-logo.tradingviewapi.com/logo/apple.svg",
    }]


def test_market_snapshot_keeps_its_quote_fields_and_adds_logo_url(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_API_KEY", "server-secret")
    monkeypatch.setattr(
        "api.app.read_snapshot",
        lambda ticker: {
            "ticker": ticker,
            "display_name": "Apple Inc.",
            "logo_url": "https://tv-logo.tradingviewapi.com/logo/apple.svg",
            "last_price": 210.0,
            "currency": "USD",
            "change_percent": 1.2,
            "as_of": datetime(2026, 7, 15, tzinfo=timezone.utc),
            "source": "tradingview",
        },
    )

    response = TestClient(api_app.app).get(
        "/api/v1/market-snapshot?ticker=AAPL",
        headers={"Authorization": "Bearer server-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ticker": "AAPL",
        "display_name": "Apple Inc.",
        "logo_url": "https://tv-logo.tradingviewapi.com/logo/apple.svg",
        "last_price": 210.0,
        "currency": "USD",
        "change_percent": 1.2,
        "as_of": "2026-07-15T00:00:00Z",
        "source": "tradingview",
    }
```

- [ ] **Step 2: Run the Core API tests to verify failure**

Run: `cd tg-core && .venv/bin/pytest tests/test_api_market_snapshot.py -q`

Expected: FAIL because the identity route and `read_market_identity` import do not exist.

- [ ] **Step 3: Normalize enrichment and wire the routes**

```python
# tg-core/api/market_identity.py
def read_market_identity(ticker: str) -> dict[str, str]:
    listing = resolve_listing(ticker)
    result = {
        "ticker": listing.display_ticker,
        "display_name": listing.display_ticker,
    }
    try:
        result.update(get_tradingview_asset_branding(listing.display_ticker))
    except (NoMarketDataError, VendorNotConfiguredError, VendorUnavailableError):
        pass
    return result


# tg-core/api/app.py
@app.get("/api/v1/market-identities", dependencies=[Depends(require_api_key)])
def get_market_identities(
    ticker: list[str] = Query(min_length=1, max_length=50),
) -> list[dict[str, str]]:
    return [read_market_identity(value) for value in ticker]
```

In `read_snapshot`, call `read_market_identity(ticker)` before fetching OHLCV. Set `ticker` and `display_name` from that identity object, and add `logo_url` only if it exists. Keep existing `TypeError`/`ValueError` behavior for quote fetch failures; identity enrichment errors remain optional by design.

- [ ] **Step 4: Run Core checks**

Run: `cd tg-core && .venv/bin/pytest tests/test_api_market_snapshot.py tests/test_tradingview_stock.py -q && .venv/bin/ruff check api/market_identity.py api/market_snapshot.py api/app.py tradingagents/dataflows/tradingview/stock.py`

Expected: PASS.

### Task 3: Add the BFF Identity Batch Contract

**Files:**
- Modify: `tg-web/src/backend/core/client.ts`
- Modify: `tg-web/src/backend/routes/analyses.ts`
- Modify: `tg-web/tests/unit/core-client.test.ts`
- Modify: `tg-web/tests/unit/app.test.ts`
- Modify: `tg-web/tests/integration/node-runtime.test.ts`
- Modify: `tg-web/tests/worker/cloudflare.test.ts`

**Interfaces:**
- Extends `CoreClientContract` with `getMarketIdentities(tickers: string[]): Promise<unknown>`.
- Produces BFF route `GET /api/market-identities?ticker=AAPL&ticker=MSFT` with the existing `{ data, requestId }` envelope.
- Rejects a request with no nonblank `ticker` value using the existing `VALIDATION_ERROR` response shape.

- [ ] **Step 1: Write a failing BFF route test**

```ts
it('encodes repeated ticker parameters for the protected Core identity route', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
  const client = new CoreClient(
    new URL('https://core.example.test'),
    'server-secret',
    fetchMock,
  );

  await client.getMarketIdentities(['AAPL', '0700.HK']);

  expect(fetchMock).toHaveBeenCalledWith(
    'https://core.example.test/api/v1/market-identities?ticker=AAPL&ticker=0700.HK',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer server-secret' }),
    }),
  );
});


it('forwards requested asset tickers to Core', async () => {
  const core = {
    ...fakeDependencies().core,
    getMarketIdentities: vi.fn().mockResolvedValue([
      { ticker: 'AAPL', display_name: 'Apple Inc.', logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg' },
    ]),
  };
  const app = createApp(fakeDependencies({ core }));

  const response = await app.request('/api/market-identities?ticker=AAPL');

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: [{ ticker: 'AAPL' }] });
  expect(core.getMarketIdentities).toHaveBeenCalledWith(['AAPL']);
});
```

- [ ] **Step 2: Run the BFF test to verify failure**

Run: `cd tg-web && pnpm test:unit -- core-client.test.ts app.test.ts`

Expected: FAIL because the contract and BFF route do not exist.

- [ ] **Step 3: Implement contract, query encoding, and proxy validation**

```ts
// CoreClientContract and CoreClient
getMarketIdentities(tickers: string[]): Promise<unknown> {
  const search = new URLSearchParams(tickers.map((ticker) => ['ticker', ticker]));
  return this.request(`/api/v1/market-identities?${search.toString()}`, {}, true);
}

// analysisRoutes
app.get('/market-identities', async (context) => {
  const tickers = (context.req.queries('ticker') ?? []).filter((ticker) => ticker.trim());
  if (!tickers.length) {
    return context.json({ error: { code: 'VALIDATION_ERROR', message: 'ticker is required', requestId: context.get('requestId') } }, 400);
  }
  return context.json(apiSuccess(await dependencies.core.getMarketIdentities(tickers), context.get('requestId')));
});
```

Add `getMarketIdentities: vi.fn()` to the dependency fixtures in `tests/unit/app.test.ts`, `tests/integration/node-runtime.test.ts`, and `tests/worker/cloudflare.test.ts`. Update the research-library mocks in `tests/unit/home-page-navigation.test.tsx` and `tests/unit/home-page-market-snapshot.test.tsx` with `getMarketIdentities: vi.fn().mockResolvedValue({ data: [], requestId: 'request-1' })`.

- [ ] **Step 4: Run the BFF tests**

Run: `cd tg-web && pnpm test:unit -- core-client.test.ts app.test.ts && pnpm test:integration -- node-runtime.test.ts`

Expected: PASS.

### Task 4: Render Asset Identity In The Dashboard

**Files:**
- Modify: `tg-web/src/frontend/lib/research.ts`
- Modify: `tg-web/src/frontend/pages/home-page.tsx`
- Modify: `tg-web/src/frontend/components/dashboard/recent-reports.tsx`
- Modify: `tg-web/tests/unit/home-page-market-snapshot.test.tsx`
- Modify: `tg-web/tests/unit/recent-reports.test.tsx`

**Interfaces:**
- Adds `AssetIdentity = { ticker: string; display_name: string; logo_url?: string }` and `getMarketIdentities(tickers: string[])` to `research.ts`.
- Extends `MarketSnapshot` with `logo_url?: string`.
- Extends `RecentReports` with `identities?: Record<string, AssetIdentity>`.

- [ ] **Step 1: Write failing UI tests**

```tsx
// home-page-market-snapshot.test.tsx mock payload
data: {
  ticker: 'AAPL',
  display_name: 'Apple Inc.',
  logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
  last_price: 210,
  currency: 'USD',
  change_percent: 1.2,
},

expect(await screen.findByText('Apple Inc.')).toBeInTheDocument();
expect(screen.getByText('AAPL')).toBeInTheDocument();
expect(screen.getByAltText('Apple Inc. logo')).toHaveAttribute(
  'src',
  'https://tv-logo.tradingviewapi.com/logo/apple.svg',
);

// recent-reports.test.tsx
<RecentReports
  jobs={[{ id: 'job-1', ticker: 'AAPL', status: 'succeeded' }]}
  identities={{
    AAPL: {
      ticker: 'AAPL',
      display_name: 'Apple Inc.',
      logo_url: 'https://tv-logo.tradingviewapi.com/logo/apple.svg',
    },
  }}
  loading={false}
  error={false}
  onOpenReport={vi.fn()}
/>

expect(screen.getByAltText('AAPL logo')).toHaveAttribute(
  'src',
  'https://tv-logo.tradingviewapi.com/logo/apple.svg',
);
```

- [ ] **Step 2: Run UI tests to verify failure**

Run: `cd tg-web && pnpm test:unit -- home-page-market-snapshot.test.tsx recent-reports.test.tsx`

Expected: FAIL because neither the types nor Avatar rendering exist.

- [ ] **Step 3: Implement the client and avatar rendering**

```tsx
// research.ts
export type AssetIdentity = {
  ticker: string;
  display_name: string;
  logo_url?: string;
};

export const getMarketIdentities = (tickers: string[]) =>
  read<AssetIdentity[]>(
    `/api/market-identities?${new URLSearchParams(
      tickers.map((ticker) => ['ticker', ticker]),
    ).toString()}`,
  );

// Avatar usage for a snapshot
<Avatar>
  <AvatarImage src={quote.logo_url} alt={`${quote.display_name ?? quote.ticker} logo`} />
  <AvatarFallback>{quote.ticker.slice(0, 1)}</AvatarFallback>
</Avatar>
```

In `HomePage`, create a TanStack Query keyed by the unique report tickers, call `getMarketIdentities`, and pass an object keyed by ticker into `RecentReports`. Render the snapshot identity as a horizontal row containing Avatar, `display_name ?? ticker` in the primary line, and `ticker` as muted secondary text. In `RecentReports`, use its optional identity lookup for the image URL and preserve the current ticker, decision, status, and report-button content. When identity data is pending or unavailable, render `AvatarFallback` with the ticker's first character.

- [ ] **Step 4: Run dashboard UI tests**

Run: `cd tg-web && pnpm test:unit -- home-page-market-snapshot.test.tsx recent-reports.test.tsx home-page-navigation.test.tsx`

Expected: PASS.

### Task 5: Verify The Complete Change

**Files:**
- Modify only if a verification check identifies a defect.

- [ ] **Step 1: Run targeted backend checks**

Run: `cd tg-core && .venv/bin/pytest tests/test_api_market_snapshot.py tests/test_tradingview_stock.py -q && .venv/bin/ruff check api/market_identity.py api/market_snapshot.py api/app.py tradingagents/dataflows/tradingview/stock.py`

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

Run: `cd tg-web && pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS. Record any pre-existing Vite warnings separately from failures.

- [ ] **Step 3: Verify the running dashboard**

Open `http://localhost:5173/`, enter a ticker with a TradingView logo, and confirm the market snapshot has a logo, company name, and secondary ticker. Confirm report rows show a logo or one-character fallback without overlapping the table content.

- [ ] **Step 4: Check the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; preserve unrelated user changes and do not commit.
