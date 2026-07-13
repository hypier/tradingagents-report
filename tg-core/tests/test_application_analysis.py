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
