from contextlib import contextmanager

from infrastructure import llm_prices


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
