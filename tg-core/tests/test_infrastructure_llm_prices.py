from contextlib import contextmanager

from infrastructure import llm_prices


def test_get_model_prices_reads_llm_models_catalog(monkeypatch):
    class Cursor:
        def fetchall(self):
            return [
                {
                    "provider": "openai",
                    "model": "gpt-test",
                    "billing_mode": "standard",
                    "context_tier": "short",
                    "currency": "USD",
                    "unit_tokens": 1_000_000,
                    "input_price": 1,
                    "cached_input_price": None,
                    "cache_write_price": None,
                    "output_price": 2,
                }
            ]

    class Connection:
        def execute(self, sql, params=()):
            assert "FROM llm_models" in sql
            assert "JOIN llm_providers" in sql
            assert params == ("openai",)
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(llm_prices.database, "connect", connect)

    assert llm_prices.get_model_prices(provider="openai") == [
        {
            "provider": "openai",
            "model": "gpt-test",
            "billing_mode": "standard",
            "context_tier": "short",
            "currency": "USD",
            "unit_tokens": 1_000_000,
            "input_price": 1,
            "cached_input_price": None,
            "cache_write_price": None,
            "output_price": 2,
        }
    ]


def test_get_model_prices_returns_empty_for_blank_provider(monkeypatch):
    def fail_connect():
        raise AssertionError("should not query database for blank provider")

    monkeypatch.setattr(llm_prices.database, "connect", fail_connect)
    assert llm_prices.get_model_prices(provider="  ") == []
