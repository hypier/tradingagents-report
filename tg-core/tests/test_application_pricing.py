from application import pricing


def test_refresh_fetches_then_persists_then_backfills(monkeypatch):
    events = []
    monkeypatch.setattr(pricing.llm_prices, "pricing_refresh_is_due", lambda: True)
    monkeypatch.setattr(
        pricing,
        "fetch_price_rows",
        lambda urls: ([{"model": "gpt-test"}], [{"source_url": "source"}]),
    )
    monkeypatch.setattr(
        pricing.llm_prices,
        "store_refresh_result",
        lambda rows, sources: events.append(("store", rows, sources)),
    )
    monkeypatch.setattr(
        pricing.llm_prices,
        "backfill_analysis_costs",
        lambda: events.append("backfill"),
    )

    pricing.refresh_and_backfill_model_prices()

    assert events[0][0] == "store"
    assert events[1] == "backfill"


def test_refresh_skips_fetch_when_cached_prices_are_not_due(monkeypatch):
    monkeypatch.setattr(pricing.llm_prices, "pricing_refresh_is_due", lambda: False)
    monkeypatch.setattr(
        pricing,
        "fetch_price_rows",
        lambda _urls: (_ for _ in ()).throw(AssertionError("refresh must not fetch")),
    )
    monkeypatch.setattr(
        pricing.llm_prices,
        "store_refresh_result",
        lambda *_args: (_ for _ in ()).throw(AssertionError("refresh must not persist")),
    )
    monkeypatch.setattr(
        pricing.llm_prices,
        "backfill_analysis_costs",
        lambda: (_ for _ in ()).throw(AssertionError("refresh must not backfill")),
    )

    pricing.refresh_and_backfill_model_prices()
