from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from application.analysis import AnalysisCommand, run_analysis
from infrastructure import analysis_jobs, database, llm_prices
from tradingagents.dataflows.listings import ListingRef, listing_from_parts, resolve_listing
from tradingagents.dataflows.symbol_utils import crypto_base
from tradingagents.dataflows.utils import safe_ticker_component
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.llm_clients.pricing import calculate_cost
from tradingagents.llm_clients.token_usage import TokenUsageCallback
from tradingagents.reporting import write_report_tree

logger = logging.getLogger("uvicorn.error.application.jobs")

_UNPRICED_COST_BREAKDOWN = {
    "currency": "USD",
    "total_cost": 0.0,
    "total_cost_usd": 0.0,
    "items": [],
}

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
    ticker: str | None
    trade_date: date
    asset_type: str | None
    analysts: tuple[str, ...]
    config_overrides: dict[str, Any]
    request_id: UUID | None = None
    instrument: dict[str, str] | None = None
    output_language: str | None = None


def create_job(request: CreateAnalysisJob) -> dict:
    listing = resolve_job_listing(request.ticker, request.instrument)
    normalized_ticker = listing.display_ticker

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
        "instrument": listing.as_dict(),
        "trade_date": request.trade_date.isoformat(),
        "asset_type": asset_type,
        "analysts": analysts,
        "config_overrides": overrides,
        "output_language": config.get("output_language"),
    }
    return analysis_jobs.insert_job(
        job_id=uuid4(),
        request_id=request.request_id,
        ticker=normalized_ticker,
        trade_date=request.trade_date.isoformat(),
        asset_type=asset_type,
        analysts=analysts,
        request=payload,
        config=public_config(config),
    )


def resolve_job_listing(
    ticker: str | None,
    instrument: dict[str, str] | None,
) -> ListingRef:
    """Resolve API input without fetching or searching for an instrument."""
    ticker_listing = resolve_listing(ticker) if ticker is not None else None
    instrument_listing = None
    if instrument is not None:
        try:
            instrument_listing = listing_from_parts(
                instrument["exchange"],
                instrument["symbol"],
                instrument.get("display_ticker"),
            )
        except (KeyError, TypeError) as exc:
            raise ValueError("instrument requires exchange and symbol") from exc

    if ticker_listing is None and instrument_listing is None:
        raise ValueError("ticker or instrument is required")
    if ticker_listing and instrument_listing and ticker_listing != instrument_listing:
        raise ValueError("ticker does not match instrument")
    return instrument_listing or ticker_listing


def run_job(job_id: UUID | str) -> None:
    with database.analysis_execution_lock():
        row = analysis_jobs.claim_job(job_id)
        if row is None:
            return
        logger.info(
            "Starting analysis job=%s ticker=%s trade_date=%s analysts=%s",
            row["id"],
            row["ticker"],
            row["trade_date"].isoformat(),
            ",".join(row["analysts"]),
        )
        _run_claimed_job(row)


def _run_claimed_job(row: dict[str, Any]) -> None:
    tracker = TokenUsageCallback()
    config = dict(row.get("config") or {})

    def record_progress(event: Any) -> None:
        logger.info(
            "Analysis progress job=%s ticker=%s progress=%s%% step=%s",
            row["id"],
            row["ticker"],
            event.progress_percent,
            event.message,
        )
        analysis_jobs.update_progress(
            job_id=row["id"],
            progress_percent=event.progress_percent,
            current_step=event.message,
        )

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
            on_event=record_progress,
        )
        logger.info("Saving analysis report job=%s ticker=%s", row["id"], row["ticker"])
        report_path = save_api_report(
            result.final_state,
            ticker=row["ticker"],
            job_id=str(row["id"]),
            results_dir=Path(config["results_dir"]),
        )
        if report_path is not None:
            logger.info(
                "Saved analysis report job=%s ticker=%s path=%s",
                row["id"],
                row["ticker"],
                report_path,
            )
        else:
            logger.warning(
                "Analysis report was not saved job=%s ticker=%s",
                row["id"],
                row["ticker"],
            )
        usage = tracker.summary()
        costs = _calculate_cost_safely(usage, config, row["id"])
        if costs is _UNPRICED_COST_BREAKDOWN:
            updated = analysis_jobs.mark_failed(
                job_id=row["id"],
                error="CostCalculationError: unable to calculate analysis cost",
                token_usage=usage,
                cost_breakdown=costs,
            )
            if not updated:
                logger.warning("Analysis job %s left running state before failure update", row["id"])
            else:
                logger.error(
                    "Analysis job failed job=%s ticker=%s reason=cost calculation",
                    row["id"],
                    row["ticker"],
                )
            return
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
        else:
            logger.info(
                "Analysis job completed job=%s ticker=%s decision=%s tokens=%s",
                row["id"],
                row["ticker"],
                result.decision,
                usage.get("total_tokens", 0),
            )
    except Exception as exc:
        logger.exception("Analysis job failed job=%s ticker=%s", row["id"], row["ticker"])
        usage = tracker.summary()
        costs = _calculate_cost_safely(usage, config, row["id"])
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


def _calculate_cost_safely(
    usage: dict[str, Any], config: dict[str, Any], job_id: UUID | str
) -> dict[str, Any]:
    apply_pricing_model_fallback(usage, config)
    provider = str(config.get("llm_provider") or "openai")
    try:
        return calculate_cost(usage, llm_prices.get_model_prices(provider=provider))
    except Exception:
        logger.exception(
            "Unable to calculate cost for analysis job=%s provider=%s",
            job_id,
            provider,
        )
        return _UNPRICED_COST_BREAKDOWN


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
