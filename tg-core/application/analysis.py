from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from tradingagents.graph.trading_graph import TradingAgentsGraph

from .progress import estimate_progress


@dataclass(frozen=True)
class AnalysisCommand:
    ticker: str
    trade_date: str
    asset_type: str
    analysts: tuple[str, ...]
    config: dict[str, Any]


@dataclass(frozen=True)
class AnalysisEvent:
    progress_percent: int
    message: str
    state_update: dict[str, Any] | None = None


@dataclass(frozen=True)
class AnalysisResult:
    final_state: dict[str, Any]
    decision: str


def run_analysis(
    command: AnalysisCommand,
    *,
    callbacks: tuple[Any, ...] | list[Any] = (),
    on_event: Callable[[AnalysisEvent], None] | None = None,
) -> AnalysisResult:
    graph = TradingAgentsGraph(
        selected_analysts=list(command.analysts),
        config=command.config,
        debug=False,
        callbacks=list(callbacks),
    )
    merged_state: dict[str, Any] = {}

    def handle_chunk(chunk: dict[str, Any]) -> None:
        merged_state.update(chunk)
        progress, message = estimate_progress(merged_state, command.analysts, command.config)
        if on_event is not None:
            on_event(AnalysisEvent(progress, message, dict(chunk)))

    final_state, decision = graph.propagate(
        command.ticker,
        command.trade_date,
        asset_type=command.asset_type,
        on_chunk=handle_chunk,
    )
    return AnalysisResult(final_state=final_state, decision=str(decision))
