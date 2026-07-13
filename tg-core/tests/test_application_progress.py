from application.progress import estimate_progress


def test_progress_moves_from_analysts_to_research_debate():
    state = {"market_report": "done", "news_report": "done"}
    progress, message = estimate_progress(
        state,
        analysts=("market", "news"),
        config={"max_debate_rounds": 1, "max_risk_discuss_rounds": 1},
    )
    assert progress == 50
    assert message == "Running research debate (0/2)"


def test_progress_finishes_at_portfolio_manager():
    state = {
        "market_report": "done",
        "investment_debate_state": {"judge_decision": "research"},
        "trader_investment_plan": "plan",
        "risk_debate_state": {"judge_decision": "risk"},
    }
    assert estimate_progress(
        state,
        analysts=("market",),
        config={"max_debate_rounds": 1, "max_risk_discuss_rounds": 1},
    ) == (92, "Portfolio Manager completed")
