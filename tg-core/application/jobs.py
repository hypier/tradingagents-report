from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from application.analysis import AnalysisCommand, run_analysis
from infrastructure import analysis_jobs, database, llm_prices
from tradingagents.dataflows.symbol_utils import crypto_base
from tradingagents.dataflows.utils import safe_ticker_component
from tradingagents.dataflows.yfinance.symbols import is_yahoo_safe, normalize_symbol
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.llm_clients.pricing import calculate_cost
from tradingagents.llm_clients.token_usage import TokenUsageCallback
from tradingagents.reporting import write_report_tree

logger = logging.getLogger(__name__)

DEFAULT_ANALYSTS = ["market", "social", "news", "fundamentals"]
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


@dataclass(frozen=True)
class CreateAnalysisJob:
    ticker: str
    trade_date: date
    asset_type: str | None
    analysts: tuple[str, ...]
    config_overrides: dict[str, Any]
    output_language: str | None = None


def create_job(request: CreateAnalysisJob) -> dict:
    normalized_ticker = normalize_symbol(request.ticker)
    if not is_yahoo_safe(normalized_ticker):
        raise ValueError(f"invalid ticker symbol: {request.ticker!r}")

    asset_type = request.asset_type or detect_asset_type(normalized_ticker)
    analysts = filter_analysts(list(request.analysts or DEFAULT_ANALYSTS), asset_type)
    if not analysts:
        raise ValueError("at least one analyst must be selected after asset filtering")

    overrides = dict(request.config_overrides)
    if request.output_language:
        overrides["output_language"] = request.output_language
    config = build_config(overrides)
    payload = {
        "ticker": normalized_ticker,
        "trade_date": request.trade_date.isoformat(),
        "asset_type": asset_type,
        "analysts": analysts,
        "config_overrides": overrides,
        "output_language": config.get("output_language"),
    }
    return analysis_jobs.insert_job(
        job_id=uuid4(),
        ticker=normalized_ticker,
        trade_date=request.trade_date.isoformat(),
        asset_type=asset_type,
        analysts=analysts,
        request=payload,
        config=public_config(config),
    )


def run_job(job_id: UUID | str) -> None:
    with database.analysis_execution_lock():
        row = analysis_jobs.claim_job(job_id)
        if row is None:
            return
        _run_claimed_job(row)


def _run_claimed_job(row: dict[str, Any]) -> None:
    tracker = TokenUsageCallback()
    config = dict(row.get("config") or {})
    try:
        config = build_config(row["request"].get("config_overrides") or {})
        command = AnalysisCommand(
            ticker=row["ticker"],
            trade_date=row["trade_date"].isoformat(),
            asset_type=row["asset_type"],
            analysts=tuple(row["analysts"]),
            config=config,
        )
        result = run_analysis(
            command,
            callbacks=(tracker,),
            on_event=lambda event: analysis_jobs.update_progress(
                job_id=row["id"],
                progress_percent=event.progress_percent,
                current_step=event.message,
            ),
        )
        report_path = save_api_report(
            result.final_state,
            ticker=row["ticker"],
            job_id=str(row["id"]),
            results_dir=Path(config["results_dir"]),
        )
        usage = tracker.summary()
        apply_pricing_model_fallback(usage, config)
        costs = calculate_cost(
            usage,
            llm_prices.get_model_prices(provider=str(config["llm_provider"])),
        )
        updated = analysis_jobs.mark_succeeded(
            job_id=row["id"],
            final_state=to_jsonable(result.final_state),
            decision=result.decision,
            report_path=str(report_path) if report_path else None,
            token_usage=usage,
            cost_breakdown=costs,
        )
        if not updated:
            logger.warning("Analysis job %s left running state before success update", row["id"])
    except Exception as exc:
        usage = tracker.summary()
        apply_pricing_model_fallback(usage, config)
        costs = calculate_cost(
            usage,
            llm_prices.get_model_prices(provider=str(config.get("llm_provider") or "openai")),
        )
        updated = analysis_jobs.mark_failed(
            job_id=row["id"],
            error=f"{type(exc).__name__}: {exc}",
            token_usage=usage,
            cost_breakdown=costs,
        )
        if not updated:
            logger.warning("Analysis job %s left running state before failure update", row["id"])


def save_api_report(
    final_state: dict[str, Any],
    *,
    ticker: str,
    job_id: str,
    results_dir: Path,
) -> Path | None:
    save_path = results_dir / "api_reports" / safe_ticker_component(ticker) / job_id
    try:
        return write_report_tree(final_state, ticker, save_path)
    except OSError:
        logger.warning(
            "Unable to save API report for job=%s ticker=%s path=%s",
            job_id,
            ticker,
            save_path,
            exc_info=True,
        )
        return None


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
