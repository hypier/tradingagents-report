from __future__ import annotations

from psycopg.types.json import Jsonb

from infrastructure import database
from tradingagents.llm_clients.pricing import (
    FALLBACK_MODEL_PRICES,
    PRICING_REFRESH_INTERVAL,
    calculate_cost,
)


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


def store_refresh_result(price_rows: list[dict], source_results: list[dict]) -> None:
    with database.connect() as conn:
        for result in source_results:
            conn.execute(
                """
                INSERT INTO llm_pricing_sources (
                    source_url, update_interval_seconds, last_checked_at, last_success_at,
                    last_error, model_count, updated_at
                )
                VALUES (%s, %s, now(), CASE WHEN %s THEN now() ELSE NULL END, %s, %s, now())
                ON CONFLICT (source_url)
                DO UPDATE SET
                    update_interval_seconds = EXCLUDED.update_interval_seconds,
                    last_checked_at = now(),
                    last_success_at = CASE
                        WHEN EXCLUDED.last_success_at IS NULL
                        THEN llm_pricing_sources.last_success_at
                        ELSE EXCLUDED.last_success_at
                    END,
                    last_error = EXCLUDED.last_error,
                    model_count = EXCLUDED.model_count,
                    updated_at = now()
                """,
                (
                    result["source_url"],
                    int(PRICING_REFRESH_INTERVAL.total_seconds()),
                    result["success"],
                    result["error"],
                    result["model_count"],
                ),
            )
        for price in price_rows:
            _upsert_model_price(conn, price)


def backfill_analysis_costs() -> None:
    with database.connect() as conn:
        jobs = conn.execute(
            """
            SELECT id, token_usage, COALESCE(config->>'llm_provider', 'openai') AS provider
            FROM analysis_jobs
            WHERE token_usage <> '{}'::jsonb
            """
        ).fetchall()
        prices_by_provider: dict[str, list[dict]] = {}
        for job in jobs:
            provider = str(job.get("provider") or "openai")
            if provider not in prices_by_provider:
                prices_by_provider[provider] = list(
                    conn.execute(
                        """
                        SELECT *
                        FROM llm_model_prices
                        WHERE provider = %s
                          AND billing_mode = 'standard'
                          AND context_tier = 'short'
                        """,
                        (provider,),
                    ).fetchall()
                )
            cost_breakdown = calculate_cost(
                dict(job.get("token_usage") or {}),
                prices_by_provider[provider],
            )
            conn.execute(
                """
                UPDATE analysis_jobs
                SET cost_usd = %s,
                    cost_breakdown = %s,
                    updated_at = now()
                WHERE id = %s
                """,
                (cost_breakdown["total_cost_usd"], Jsonb(cost_breakdown), job["id"]),
            )


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
