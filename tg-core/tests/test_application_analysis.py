from application import analysis
from application.analysis import AnalysisCommand, AnalysisEvent


class StubGraph:
    def __init__(self, selected_analysts, config, debug, callbacks):
        self.config = config

    def propagate(self, ticker, trade_date, asset_type="stock", on_chunk=None):
        on_chunk({"market_report": "market"})
        on_chunk({
            "investment_debate_state": {"judge_decision": "research"},
            "trader_investment_plan": "plan",
            "risk_debate_state": {"judge_decision": "risk"},
            "final_trade_decision": "Hold",
        })
        return {"market_report": "market", "final_trade_decision": "Hold"}, "Hold"


def test_run_analysis_emits_events_and_returns_result(monkeypatch):
    monkeypatch.setattr(analysis, "TradingAgentsGraph", StubGraph)
    events: list[AnalysisEvent] = []
    command = AnalysisCommand(
        ticker="AAPL",
        trade_date="2026-01-15",
        asset_type="stock",
        analysts=("market",),
        config={"max_debate_rounds": 1, "max_risk_discuss_rounds": 1},
    )

    result = analysis.run_analysis(command, on_event=events.append)

    assert result.decision == "Hold"
    assert events[-1].progress_percent == 92
    assert events[-1].state_update["final_trade_decision"] == "Hold"


def test_run_analysis_deduplicates_stage_events_and_reports_tool_calls(monkeypatch):
    tool_message = type(
        "ToolCallMessage",
        (),
        {
            "id": "message-1",
            "tool_calls": [{"id": "call-1", "name": "get_stock_data", "args": {}}],
        },
    )()

    class Graph:
        def __init__(self, **_kwargs):
            pass

        def propagate(self, _ticker, _trade_date, asset_type="stock", on_chunk=None):
            chunk = {"messages": [tool_message]}
            on_chunk(chunk)
            on_chunk(chunk)
            on_chunk({"market_report": "market"})
            return {"market_report": "market"}, "Hold"

    monkeypatch.setattr(analysis, "TradingAgentsGraph", Graph)
    events: list[AnalysisEvent] = []

    analysis.run_analysis(
        AnalysisCommand(
            ticker="AAPL",
            trade_date="2026-01-15",
            asset_type="stock",
            analysts=("market",),
            config={"max_debate_rounds": 1, "max_risk_discuss_rounds": 1},
        ),
        on_event=events.append,
    )

    assert [(event.progress_percent, event.message) for event in events] == [
        (10, "Running Market Analyst"),
        (10, "Market Analyst: calling get_stock_data"),
        (50, "Running research debate (0/2)"),
    ]
