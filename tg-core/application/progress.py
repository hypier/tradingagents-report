from typing import Any

ANALYST_REPORT_KEYS = {
    "market": ("market_report", "Market Analyst completed"),
    "social": ("sentiment_report", "Sentiment Analyst completed"),
    "news": ("news_report", "News Analyst completed"),
    "fundamentals": ("fundamentals_report", "Fundamentals Analyst completed"),
}


def estimate_progress(
    state: dict[str, Any],
    analysts: tuple[str, ...] | list[str],
    config: dict[str, Any],
) -> tuple[int, str]:
    selected = [analyst for analyst in analysts if analyst in ANALYST_REPORT_KEYS]
    if selected:
        per_analyst = 40 / len(selected)
        completed = 0
        current_label = "Running analyst team"
        for analyst in selected:
            report_key, label = ANALYST_REPORT_KEYS[analyst]
            if state.get(report_key):
                completed += 1
                current_label = label
                continue
            current_label = f"Running {label.removesuffix(' completed')}"
            break
        if completed < len(selected):
            return int(10 + completed * per_analyst), current_label

    investment_state = state.get("investment_debate_state") or {}
    if not investment_state.get("judge_decision"):
        max_debate = max(1, int(config.get("max_debate_rounds") or 1) * 2)
        count = min(max_debate, int(investment_state.get("count") or 0))
        return 50 + int((count / max_debate) * 12), f"Running research debate ({count}/{max_debate})"

    if not state.get("trader_investment_plan"):
        return 66, "Running Trader"

    risk_state = state.get("risk_debate_state") or {}
    if not risk_state.get("judge_decision"):
        max_risk = max(1, int(config.get("max_risk_discuss_rounds") or 1) * 3)
        count = min(max_risk, int(risk_state.get("count") or 0))
        return 72 + int((count / max_risk) * 16), f"Running risk debate ({count}/{max_risk})"

    return 92, "Portfolio Manager completed"
