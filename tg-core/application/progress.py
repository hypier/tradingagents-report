from dataclasses import dataclass
from typing import Any

ANALYST_REPORT_KEYS = {
    "market": ("market_report", "Market Analyst completed"),
    "social": ("sentiment_report", "Sentiment Analyst completed"),
    "news": ("news_report", "News Analyst completed"),
    "fundamentals": ("fundamentals_report", "Fundamentals Analyst completed"),
}


@dataclass(frozen=True)
class ProgressUpdate:
    progress_percent: int
    message: str
    kind: str


class ProgressEventProjector:
    """Turn graph state chunks into deduplicated, user-visible activity events."""

    def __init__(self, analysts: tuple[str, ...] | list[str], config: dict[str, Any]) -> None:
        self._analysts = analysts
        self._config = config
        self._last_stage: tuple[int, str] | None = None
        self._seen_tool_calls: set[str] = set()

    def consume(self, state: dict[str, Any], chunk: dict[str, Any]) -> list[ProgressUpdate]:
        progress, stage = estimate_progress(state, self._analysts, self._config)
        events: list[ProgressUpdate] = []
        if (progress, stage) != self._last_stage:
            self._last_stage = (progress, stage)
            events.append(ProgressUpdate(progress, stage, "stage"))

        actor = stage.removeprefix("Running ").split(" (")[0]
        for message in chunk.get("messages", []):
            message_id = getattr(message, "id", None)
            for tool_call in getattr(message, "tool_calls", None) or []:
                name = tool_call.get("name") if isinstance(tool_call, dict) else tool_call.name
                call_id = tool_call.get("id") if isinstance(tool_call, dict) else tool_call.id
                if not name:
                    continue
                key = f"{message_id or 'message'}:{call_id or name}"
                if key in self._seen_tool_calls:
                    continue
                self._seen_tool_calls.add(key)
                events.append(ProgressUpdate(progress, f"{actor}: calling {name}", "tool_call"))
        return events


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
    max_risk = max(1, int(config.get("max_risk_discuss_rounds") or 1) * 3)
    risk_count = int(risk_state.get("count") or 0)
    if not risk_state.get("judge_decision"):
        # Risk routing hands off to Portfolio Manager once count reaches the
        # configured debate limit; keep that handoff visible while the PM runs.
        if risk_count >= max_risk:
            return 90, "Running Portfolio Manager"
        count = min(max_risk, risk_count)
        return 72 + int((count / max_risk) * 16), f"Running risk debate ({count}/{max_risk})"

    return 92, "Portfolio Manager completed"
