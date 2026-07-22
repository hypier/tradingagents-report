"""Read LLM model unit prices from the shared ``llm_models`` catalog."""

from __future__ import annotations

from infrastructure import database


def get_model_prices(*, provider: str = "openai") -> list[dict]:
    """Return price rows for ``calculate_cost``.

    ``provider`` is the catalog ``llm_providers.id`` (preferred). Rows are shaped
    for ``tradingagents.llm_clients.pricing.calculate_cost`` (model + unit prices).
    """
    provider_id = provider.strip().lower()
    if not provider_id:
        return []
    with database.connect() as conn:
        rows = conn.execute(
            """
            SELECT
                p.id AS provider,
                m.model,
                'standard' AS billing_mode,
                'short' AS context_tier,
                m.currency,
                m.unit_tokens,
                m.input_price,
                m.cached_input_price,
                m.cache_write_price,
                m.output_price
            FROM llm_models AS m
            JOIN llm_providers AS p ON p.id = m.provider_id
            WHERE p.id = %s
              AND m.input_price IS NOT NULL
              AND m.output_price IS NOT NULL
            """,
            (provider_id,),
        ).fetchall()
    return list(rows)
