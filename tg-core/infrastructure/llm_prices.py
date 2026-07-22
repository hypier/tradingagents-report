from __future__ import annotations

from infrastructure import database
from tradingagents.llm_clients.pricing import FALLBACK_MODEL_PRICES


def seed_fallback_model_prices() -> None:
    with database.connect() as conn:
        for price in FALLBACK_MODEL_PRICES:
            _upsert_model_price(conn, price)


def get_model_prices(
    *,
    provider: str = "openai",
    billing_mode: str = "standard",
    context_tier: str = "short",
) -> list[dict]:
    with database.connect() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM llm_model_prices
            WHERE provider = %s
              AND billing_mode = %s
              AND context_tier = %s
            """,
            (provider, billing_mode, context_tier),
        ).fetchall()
    return list(rows)


def _upsert_model_price(conn, price: dict) -> None:
    conn.execute(
        """
        INSERT INTO llm_model_prices (
            provider, model, billing_mode, context_tier, currency, unit_tokens,
            input_price, cached_input_price, cache_write_price, output_price, source_url
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (provider, model, billing_mode, context_tier)
        DO UPDATE SET
            currency = EXCLUDED.currency,
            unit_tokens = EXCLUDED.unit_tokens,
            input_price = EXCLUDED.input_price,
            cached_input_price = EXCLUDED.cached_input_price,
            cache_write_price = EXCLUDED.cache_write_price,
            output_price = EXCLUDED.output_price,
            source_url = EXCLUDED.source_url,
            updated_at = now()
        """,
        (
            price["provider"],
            price["model"],
            price["billing_mode"],
            price["context_tier"],
            price["currency"],
            price["unit_tokens"],
            price["input_price"],
            price["cached_input_price"],
            price["cache_write_price"],
            price["output_price"],
            price["source_url"],
        ),
    )
