from infrastructure import llm_prices
from tradingagents.llm_clients.pricing import PRICING_SOURCE_URLS, fetch_price_rows


def refresh_and_backfill_model_prices() -> None:
    if not llm_prices.pricing_refresh_is_due():
        return
    price_rows, source_results = fetch_price_rows(PRICING_SOURCE_URLS)
    llm_prices.store_refresh_result(price_rows, source_results)
    llm_prices.backfill_analysis_costs()
