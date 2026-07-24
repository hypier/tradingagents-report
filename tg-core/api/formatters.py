from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from tradingagents.dataflows.listings import country_for_exchange

REPORT_KEYS = {
    "market_report": "market_report",
    "sentiment_report": "sentiment_report",
    "news_report": "news_report",
    "fundamentals_report": "fundamentals_report",
    "investment_plan": "research_team_decision",
    "trader_investment_plan": "trader_investment_plan",
    "final_trade_decision": "final_trade_decision",
}

RISK_REPORT_KEYS = {
    "judge_decision": "risk_management_decision",
    "aggressive_history": "risky_analyst",
    "conservative_history": "safe_analyst",
    "neutral_history": "neutral_analyst",
}

RESEARCH_REPORT_KEYS = {
    "bull_history": "bull_researcher",
    "bear_history": "bear_researcher",
    "judge_decision": "research_team_decision",
}

STATUS_MAP = {
    "queued": "queued",
    "running": "running",
    "succeeded": "completed",
    "failed": "failed",
}

ENGLISH_MARKET_TYPES = {
    "stock": "Stock",
    "crypto": "Crypto",
}

RISK_LEVELS = {
    "Buy": "Medium",
    "Overweight": "Medium",
    "Hold": "Low",
    "Underweight": "Medium",
    "Sell": "High",
}

def analysis_result_from_row(row: dict[str, Any]) -> dict[str, Any]:
    final_state = row.get("final_state") or {}
    created_at = ensure_datetime(row.get("created_at"))
    updated_at = ensure_datetime(row.get("updated_at"))
    started_at = ensure_datetime(row.get("started_at"))
    finished_at = ensure_datetime(row.get("finished_at"))
    ticker = str(row.get("ticker") or "")
    trade_date = ensure_date(row.get("trade_date"))
    rating = parse_rating(str(row.get("decision") or final_state.get("final_trade_decision") or ""))
    decision_fields = parse_decision_fields(str(final_state.get("final_trade_decision") or ""))
    decision_brief = (
        final_state.get("decision_brief")
        if isinstance(final_state.get("decision_brief"), dict)
        else {}
    )
    brief_rating = str(decision_brief.get("rating") or rating)
    reports = build_reports(final_state)
    token_usage = dict(row.get("token_usage") or {})
    tokens_used = int(row.get("tokens_used") or token_usage.get("total_tokens") or 0)
    cost_usd = float(row.get("cost_usd") or 0)
    cost_breakdown = dict(row.get("cost_breakdown") or {})
    raw_exchange = row.get("exchange")
    exchange = raw_exchange.strip() or None if isinstance(raw_exchange, str) else None
    display = dict(row.get("display") or {})
    if exchange and not display.get("country"):
        country = country_for_exchange(exchange)
        if country:
            display["country"] = country
    request = row.get("request") or {}
    config = row.get("config") or {}
    output_language = (
        row.get("output_language")
        or (request.get("output_language") if isinstance(request, dict) else None)
        or (config.get("output_language") if isinstance(config, dict) else None)
    )

    return {
        "id": row.get("id"),
        "request_id": row.get("request_id"),
        "ticker": ticker,
        "exchange": exchange,
        "trade_date": trade_date,
        "asset_type": str(row.get("asset_type") or "stock"),
        "analysts": list(row.get("analysts") or []),
        "status": str(row.get("status") or "queued"),
        "progress": {
            "percent": int(row.get("progress_percent") or 0),
            "current_step": row.get("current_step"),
        },
        "decision": {
            "action": brief_rating,
            "rating": brief_rating,
            "headline": decision_brief.get("headline"),
            "conviction": decision_brief.get("conviction"),
            "as_of_price": decision_brief.get("as_of_price"),
            "as_of_date": decision_brief.get("as_of_date"),
            "currency": decision_brief.get("currency"),
            "time_horizon": decision_brief.get("time_horizon"),
            "position_guidance": decision_brief.get("position_guidance"),
            "entry_zone": decision_brief.get("entry_zone"),
            "add_levels": list(decision_brief.get("add_levels") or []),
            "stop_or_reduce": decision_brief.get("stop_or_reduce"),
            "bull_case": decision_brief.get("bull_case"),
            "bear_case": decision_brief.get("bear_case"),
            "key_risk": decision_brief.get("key_risk"),
            "what_to_watch": list(decision_brief.get("what_to_watch") or []),
            "invalidation": decision_brief.get("invalidation"),
            "section_stances": decision_brief.get("section_stances"),
            "conflict_note": decision_brief.get("conflict_note"),
            "confidence": decision_fields.get("confidence", 0),
            "risk_score": decision_fields.get("risk_score", risk_score_for_rating(rating)),
            "target_price": decision_brief.get("target_price", decision_fields.get("target_price")),
            "reasoning": decision_fields.get("reasoning")
            or str(final_state.get("final_trade_decision") or ""),
        },
        "reports": reports,
        "usage": {"tokens": tokens_used, "token_usage": token_usage},
        "cost": {"usd": cost_usd, "breakdown": cost_breakdown},
        "display": display,
        "output_language": output_language,
        "error": row.get("error"),
        "created_at": created_at,
        "updated_at": updated_at,
        "started_at": started_at,
        "finished_at": finished_at,
    }


def build_reports(final_state: dict[str, Any]) -> dict[str, Any]:
    reports: dict[str, Any] = {}
    for source_key, target_key in REPORT_KEYS.items():
        value = final_state.get(source_key)
        if value:
            reports[target_key] = value

    research_state = final_state.get("investment_debate_state") or {}
    for source_key, target_key in RESEARCH_REPORT_KEYS.items():
        value = research_state.get(source_key)
        if value and target_key not in reports:
            reports[target_key] = value

    risk_state = final_state.get("risk_debate_state") or {}
    for source_key, target_key in RISK_REPORT_KEYS.items():
        value = risk_state.get(source_key)
        if value:
            reports[target_key] = value

    return reports


def parse_decision_fields(text: str) -> dict[str, Any]:
    from tradingagents.agents.utils.report_i18n import (
        CONFIDENCE_LABELS,
        PRICE_TARGET_LABELS,
    )

    rating = parse_rating(text)
    target = parse_float_after(text, list(PRICE_TARGET_LABELS))
    confidence = parse_float_after(text, list(CONFIDENCE_LABELS))
    if confidence and confidence > 1:
        confidence = min(confidence / 100, 1)
    risk_score = parse_float_after(text, ["Risk Score", "risk_score"])
    if risk_score and risk_score > 1:
        risk_score = min(risk_score / 100, 1)
    reasoning = extract_reasoning(text)
    return {
        "action": rating,
        "confidence": confidence or 0,
        "risk_score": risk_score if risk_score is not None else risk_score_for_rating(rating),
        "target_price": target,
        "reasoning": reasoning,
    }


def parse_rating(text: str) -> str:
    from tradingagents.agents.utils.rating import parse_rating as parse_shared_rating

    return parse_shared_rating(text)


def parse_float_after(text: str, labels: list[str]) -> float | None:
    for label in labels:
        match = re.search(
            rf"{re.escape(label)}\**\s*[:：]?\s*([-+]?\d+(?:\.\d+)?)",
            text,
            re.IGNORECASE,
        )
        if match:
            return float(match.group(1))
    return None


def extract_reasoning(text: str) -> str:
    from tradingagents.agents.utils.report_i18n import REASONING_LABELS

    for label in REASONING_LABELS:
        match = re.search(
            rf"\*\*{re.escape(label)}\*\*\s*[:：]\s*(.*?)(?:\n\s*\n\*\*|\Z)",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if match:
            return match.group(1).strip()
    return text.strip()


def risk_score_for_rating(rating: str) -> float:
    return {
        "Buy": 0.35,
        "Overweight": 0.45,
        "Hold": 0.25,
        "Underweight": 0.65,
        "Sell": 0.85,
    }.get(rating, 0.5)


def build_recommendation(
    rating: str,
    decision_fields: dict[str, Any],
    final_state: dict[str, Any],
) -> str:
    reasoning = decision_fields.get("reasoning") or final_state.get("final_trade_decision") or ""
    target = decision_fields.get("target_price")
    target_part = f" Target price: {target}." if target is not None else ""
    return f"Investment recommendation: {rating}.{target_part} Rationale: {reasoning}"


def research_depth(analysts: list[str]) -> str:
    if len(analysts) >= 3:
        return "Comprehensive"
    return "Quick"


def model_info(config: dict[str, Any]) -> str:
    provider = config.get("llm_provider") or "unknown"
    deep = config.get("deep_think_llm") or "unknown"
    quick = config.get("quick_think_llm") or deep
    return f"{provider}:{deep}/{quick}"


def performance_metrics(
    config: dict[str, Any],
    elapsed: float | None,
    token_usage: dict[str, Any] | None = None,
    cost_breakdown: dict[str, Any] | None = None,
) -> dict[str, Any]:
    total_time = round(elapsed or 0, 2)
    usage = token_usage or {}
    cost = cost_breakdown or {}
    return {
        "total_time": total_time,
        "total_time_minutes": round(total_time / 60, 2),
        "node_count": 0,
        "average_node_time": 0,
        "slowest_node": None,
        "fastest_node": None,
        "node_timings": {},
        "category_timings": {},
        "token_usage": usage,
        "actual_amount": cost.get("total_cost_usd", 0),
        "actual_amount_usd": cost.get("total_cost_usd", 0),
        "cost_breakdown": cost,
        "llm_config": {
            "provider": config.get("llm_provider"),
            "deep_think_model": config.get("deep_think_llm"),
            "quick_think_model": config.get("quick_think_llm"),
        },
    }


def build_analysis_id(ticker: str, trade_date: date | None, created_at: datetime | None) -> str:
    date_part = trade_date.strftime("%Y%m%d") if trade_date else "unknown"
    time_part = created_at.strftime("%H%M%S") if created_at else "000000"
    return f"{ticker}_{date_part}_{time_part}"


def summarize(text: str, limit: int = 300) -> str:
    cleaned = re.sub(r"[#*_`>\-]+", "", text or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "..."


def elapsed_seconds(started_at: datetime | None, finished_at: datetime | None) -> float | None:
    if not started_at or not finished_at:
        return None
    return round(max(0, (finished_at - started_at).total_seconds()), 6)


def ensure_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    return None


def ensure_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    return None


def mongo_date(value: datetime | None) -> dict[str, str] | None:
    if value is None:
        return None
    normalized = value.astimezone(timezone.utc)
    return {"$date": normalized.isoformat(timespec="milliseconds").replace("+00:00", "Z")}


def uuid_to_object_id(value: Any) -> str:
    try:
        return UUID(str(value)).hex[:24]
    except (TypeError, ValueError):
        return "0" * 24
