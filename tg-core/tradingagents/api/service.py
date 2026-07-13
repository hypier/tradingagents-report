from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from tradingagents.api import db
from tradingagents.api.schemas import AnalysisRequest
from tradingagents.api.token_usage import TokenUsageCallback
from tradingagents.dataflows.symbol_utils import crypto_base
from tradingagents.dataflows.yfinance.symbols import is_yahoo_safe, normalize_symbol
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph

DEFAULT_ANALYSTS = ["market", "social", "news", "fundamentals"]
ANALYST_REPORT_KEYS = {
    "market": ("market_report", "Market Analyst completed"),
    "social": ("sentiment_report", "Sentiment Analyst completed"),
    "news": ("news_report", "News Analyst completed"),
    "fundamentals": ("fundamentals_report", "Fundamentals Analyst completed"),
}
ALLOWED_CONFIG_OVERRIDES = {
    "llm_provider",
    "deep_think_llm",
    "quick_think_llm",
    "google_thinking_level",
    "openai_reasoning_effort",
    "anthropic_effort",
    "output_language",
    "max_debate_rounds",
    "max_risk_discuss_rounds",
    "max_recur_limit",
    "temperature",
    "llm_max_retries",
    "benchmark_ticker",
    "data_vendors",
    "tool_vendors",
}


def create_analysis_job(request: AnalysisRequest) -> dict:
    normalized_ticker = normalize_symbol(request.ticker)
    if not is_yahoo_safe(normalized_ticker):
        raise ValueError(f"invalid ticker symbol: {request.ticker!r}")

    asset_type = request.asset_type or detect_asset_type(normalized_ticker)
    analysts = filter_analysts(request.analysts or DEFAULT_ANALYSTS, asset_type)
    if not analysts:
        raise ValueError("at least one analyst must be selected after asset filtering")

    overrides = dict(request.config_overrides)
    if request.output_language:
        overrides["output_language"] = request.output_language
    config = build_config(overrides)
    payload = request.model_dump(mode="json")
    payload["ticker"] = normalized_ticker
    payload["asset_type"] = asset_type
    payload["analysts"] = analysts
    payload["config_overrides"] = overrides
    payload["output_language"] = config.get("output_language")

    return db.insert_job(
        job_id=uuid4(),
        ticker=normalized_ticker,
        trade_date=str(request.trade_date),
        asset_type=asset_type,
        analysts=analysts,
        request=payload,
        config=public_config(config),
    )


def run_analysis_job(job_id: UUID | str) -> None:
    with db.analysis_execution_lock():
        row = db.claim_job(job_id)
        if row is None:
            return
        _run_claimed_analysis_job(row)


def _run_claimed_analysis_job(row: dict[str, Any]) -> None:
    job_id = row["id"]
    token_tracker = TokenUsageCallback()
    try:
        request = row["request"]
        config = build_config(request.get("config_overrides") or {})
        ticker = row["ticker"]
        trade_date = row["trade_date"].isoformat()
        asset_type = row["asset_type"]
        analysts = list(row["analysts"] or DEFAULT_ANALYSTS)

        graph = TradingAgentsGraph(
            selected_analysts=analysts,
            config=config,
            debug=False,
            callbacks=[token_tracker],
        )
        final_state, decision = run_graph_with_progress(
            job_id=job_id,
            graph=graph,
            ticker=ticker,
            trade_date=trade_date,
            asset_type=asset_type,
            analysts=analysts,
        )
        report_progress(job_id, 97, "Saving report")
        report_path = save_api_report(graph, final_state, ticker, str(job_id))

        token_usage = token_tracker.summary()
        apply_pricing_model_fallback(token_usage, config)
        db.mark_succeeded(
            job_id=job_id,
            final_state=to_jsonable(final_state),
            decision=str(decision),
            report_path=str(report_path) if report_path else None,
            token_usage=token_usage,
            provider=str(config.get("llm_provider") or "openai"),
        )
        print(f"[analysis:{job_id}] 100% Completed", flush=True)
    except Exception as exc:
        token_usage = token_tracker.summary()
        if "config" in locals():
            apply_pricing_model_fallback(token_usage, config)
        db.mark_failed(
            job_id=job_id,
            error=f"{type(exc).__name__}: {exc}",
            token_usage=token_usage,
            provider=str(
                (config if "config" in locals() else row.get("config") or {}).get(
                    "llm_provider", "openai"
                )
            ),
        )
        print(f"[analysis:{job_id}] failed: {type(exc).__name__}: {exc}", flush=True)

def run_graph_with_progress(
    *,
    job_id: UUID | str,
    graph: TradingAgentsGraph,
    ticker: str,
    trade_date: str,
    asset_type: str,
    analysts: list[str],
) -> tuple[dict, str]:
    graph.ticker = ticker
    report_progress(job_id, 3, "Resolving pending memory entries")
    graph._resolve_pending_entries(ticker)

    report_progress(job_id, 5, "Creating initial graph state")
    past_context = graph.memory_log.get_past_context(ticker)
    instrument_context = graph.resolve_instrument_context(ticker, asset_type)
    init_agent_state = graph.propagator.create_initial_state(
        ticker,
        trade_date,
        asset_type=asset_type,
        past_context=past_context,
        instrument_context=instrument_context,
    )
    args = graph.propagator.get_graph_args()

    trace: list[dict] = []
    final_state: dict[str, Any] = {}
    last_progress = 5
    last_step = "Creating initial graph state"
    report_progress(job_id, 8, "Starting LangGraph stream")

    for chunk in graph.graph.stream(init_agent_state, **args):
        trace.append(chunk)
        final_state.update(chunk)
        progress, step = estimate_progress(final_state, analysts, graph.config)
        if progress > last_progress or step != last_step:
            report_progress(job_id, progress, step)
            last_progress = progress
            last_step = step

    if trace and not final_state:
        for chunk in trace:
            final_state.update(chunk)

    report_progress(job_id, 94, "Persisting final state")
    graph.curr_state = final_state
    graph._log_state(trade_date, final_state)

    report_progress(job_id, 96, "Storing decision memory")
    final_decision = final_state["final_trade_decision"]
    graph.memory_log.store_decision(
        ticker=ticker,
        trade_date=trade_date,
        final_trade_decision=final_decision,
    )
    return final_state, graph.process_signal(final_decision)


def estimate_progress(
    state: dict[str, Any],
    analysts: list[str],
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
    else:
        completed = 0

    investment_state = state.get("investment_debate_state") or {}
    if not investment_state.get("judge_decision"):
        max_debate = max(1, int(config.get("max_debate_rounds") or 1) * 2)
        count = min(max_debate, int(investment_state.get("count") or 0))
        progress = 50 + int((count / max_debate) * 12)
        return progress, f"Running research debate ({count}/{max_debate})"

    if not state.get("trader_investment_plan"):
        return 66, "Running Trader"

    risk_state = state.get("risk_debate_state") or {}
    if not risk_state.get("judge_decision"):
        max_risk = max(1, int(config.get("max_risk_discuss_rounds") or 1) * 3)
        count = min(max_risk, int(risk_state.get("count") or 0))
        progress = 72 + int((count / max_risk) * 16)
        return progress, f"Running risk debate ({count}/{max_risk})"

    return 92, "Portfolio Manager completed"


def report_progress(job_id: UUID | str, progress: int, step: str) -> None:
    progress = max(0, min(99, int(progress)))
    event = {
        "time": datetime.now(timezone.utc).isoformat(),
        "progress_percent": progress,
        "message": step,
    }
    print(f"[analysis:{job_id}] {progress}% {step}", flush=True)
    db.update_progress(
        job_id=job_id,
        progress_percent=progress,
        current_step=step,
        event=event,
    )


def apply_pricing_model_fallback(token_usage: dict[str, Any], config: dict[str, Any]) -> None:
    if token_usage.get("by_model") or not token_usage.get("total_tokens"):
        return
    fallback_model = config.get("deep_think_llm") or config.get("quick_think_llm")
    if fallback_model:
        token_usage["model"] = str(fallback_model)


def build_config(overrides: dict[str, Any]) -> dict[str, Any]:
    unknown = sorted(set(overrides) - ALLOWED_CONFIG_OVERRIDES)
    if unknown:
        joined = ", ".join(unknown)
        raise ValueError(f"unsupported config override(s): {joined}")
    if "output_language" in overrides and not str(overrides["output_language"]).strip():
        raise ValueError("output_language must be a non-empty string")
    config = DEFAULT_CONFIG.copy()
    config.update(overrides)
    if config.get("checkpoint_enabled"):
        raise ValueError("checkpoint_enabled is not supported by the API execution path")
    if config.get("output_language"):
        config["output_language"] = str(config["output_language"]).strip()
    return config


def public_config(config: dict[str, Any]) -> dict[str, Any]:
    hidden_keys = {"memory_log_path", "results_dir", "data_cache_dir", "project_dir"}
    return {key: to_jsonable(value) for key, value in config.items() if key not in hidden_keys}


def detect_asset_type(ticker: str) -> str:
    return "crypto" if crypto_base(ticker) else "stock"


def filter_analysts(analysts: list[str], asset_type: str) -> list[str]:
    selected = list(dict.fromkeys(analysts))
    if asset_type == "crypto":
        selected = [analyst for analyst in selected if analyst != "fundamentals"]
    return selected


def save_api_report(
    graph: TradingAgentsGraph,
    final_state: dict,
    ticker: str,
    job_id: str,
) -> Path | None:
    try:
        save_path = Path(graph.config["results_dir"]) / "api_reports" / ticker / job_id
        return graph.save_reports(final_state, ticker, save_path=save_path)
    except Exception:
        return None


def to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list | tuple | set):
        return [to_jsonable(item) for item in value]
    if hasattr(value, "model_dump"):
        return to_jsonable(value.model_dump())
    if hasattr(value, "content"):
        return {
            "type": type(value).__name__,
            "content": to_jsonable(getattr(value, "content", None)),
            "tool_calls": to_jsonable(getattr(value, "tool_calls", None)),
        }
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)
