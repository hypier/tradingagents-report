from cli.main import _build_analysis_command


def test_build_analysis_command_maps_cli_selections():
    command = _build_analysis_command(
        {
            "ticker": "AAPL",
            "analysis_date": "2026-01-15",
            "asset_type": "stock",
        },
        analysts=["market", "news"],
        config={"llm_provider": "openai"},
    )

    assert command.ticker == "AAPL"
    assert command.analysts == ("market", "news")
    assert command.config["llm_provider"] == "openai"
