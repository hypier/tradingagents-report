from contextlib import contextmanager

from infrastructure import llm_prices


def test_pricing_refresh_is_due_uses_latest_source_success_without_network(monkeypatch):
    executed = []
    timestamps = []

    class Cursor:
        def fetchone(self):
            return {"last_success_at": "2026-07-13T00:00:00+00:00"}

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    def pricing_is_stale(last_success_at):
        timestamps.append(last_success_at)
        return True

    monkeypatch.setattr(llm_prices.database, "connect", connect)
    monkeypatch.setattr(llm_prices, "pricing_is_stale", pricing_is_stale)

    assert llm_prices.pricing_refresh_is_due() is True
    assert timestamps == ["2026-07-13T00:00:00+00:00"]
    assert executed == [
        ("SELECT max(last_success_at) AS last_success_at FROM llm_pricing_sources", ())
    ]


def test_seed_fallback_model_prices_owns_connection_transaction(monkeypatch):
    executed = []

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(llm_prices.database, "connect", connect)
    monkeypatch.setattr(
        llm_prices,
        "FALLBACK_MODEL_PRICES",
        [
            {
                "provider": "openai",
                "model": "test-model",
                "billing_mode": "standard",
                "context_tier": "short",
                "currency": "USD",
                "unit_tokens": 1_000_000,
                "input_price": 1,
                "cached_input_price": None,
                "cache_write_price": None,
                "output_price": 2,
                "source_url": "https://example.test/prices",
            }
        ],
    )

    llm_prices.seed_fallback_model_prices()

    assert "INSERT INTO llm_model_prices" in executed[0][0]
    assert executed[0][1][1] == "test-model"


def test_get_model_prices_reads_cached_rows_without_network_refresh(monkeypatch):
    class Cursor:
        def fetchall(self):
            return [{"model": "test-model"}]

    class Connection:
        def execute(self, _sql, _params=()):
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(llm_prices.database, "connect", connect)

    assert llm_prices.get_model_prices(provider="openai") == [{"model": "test-model"}]


def test_store_refresh_result_writes_source_statuses_and_price_rows(monkeypatch):
    executed = []

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(llm_prices.database, "connect", connect)

    llm_prices.store_refresh_result(
        price_rows=[
            {
                "provider": "openai",
                "model": "test-model",
                "billing_mode": "standard",
                "context_tier": "short",
                "currency": "USD",
                "unit_tokens": 1_000_000,
                "input_price": 1,
                "cached_input_price": None,
                "cache_write_price": None,
                "output_price": 2,
                "source_url": "https://example.test/prices",
            }
        ],
        source_results=[
            {
                "source_url": "https://example.test/prices",
                "success": True,
                "error": None,
                "model_count": 1,
            }
        ],
    )

    assert "INSERT INTO llm_pricing_sources" in executed[0][0]
    assert "INSERT INTO llm_model_prices" in executed[1][0]


def test_backfill_analysis_costs_calculates_with_cached_provider_prices(monkeypatch):
    executed = []
    calculations = []

    class Cursor:
        def __init__(self, rows):
            self.rows = rows

        def fetchall(self):
            return self.rows

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            if "SELECT id, token_usage" in sql:
                return Cursor(
                    [
                        {
                            "id": "job-id",
                            "token_usage": {"total_tokens": 10},
                            "provider": "openai",
                        }
                    ]
                )
            if "SELECT *" in sql:
                return Cursor([{"model": "test-model"}])
            return Cursor([])

    @contextmanager
    def connect():
        yield Connection()

    def calculate_cost(token_usage, price_rows):
        calculations.append((token_usage, price_rows))
        return {"total_cost_usd": 0.25}

    monkeypatch.setattr(llm_prices.database, "connect", connect)
    monkeypatch.setattr(llm_prices, "calculate_cost", calculate_cost)

    llm_prices.backfill_analysis_costs()

    assert calculations == [({"total_tokens": 10}, [{"model": "test-model"}])]
    assert "UPDATE analysis_jobs" in executed[-1][0]
    assert executed[-1][1][0] == 0.25
